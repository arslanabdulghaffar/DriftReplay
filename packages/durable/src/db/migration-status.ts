import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DurableError } from "../contracts.ts";
import { databaseError, identifier, type SqlClient } from "./client.ts";

// Keep this fixed reviewed catalog synchronized with migrate.ts. The fresh-migration
// readiness test detects divergence; no caller can supply migration paths or expected hashes.
const MIGRATION_FILES = [
  [1, "001_initial.sql"],
  [2, "002_accounting.sql"],
  [3, "003_storage_guards.sql"],
] as const;

/** Read-only ledger verification; does not create a schema, apply SQL or change checksums. */
export async function assertMigrationStatus(
  db: SqlClient & { readonly schema: string },
): Promise<{ schemaReady: true; migrationVersions: number[] }> {
  const schema = identifier(db.schema);
  let expected: { version: number; checksum: string }[];
  try {
    expected = await Promise.all(
      MIGRATION_FILES.map(async ([version, file]) => ({
        version,
        checksum: createHash("sha256")
          .update(await readFile(new URL(`./migrations/${file}`, import.meta.url), "utf8"))
          .digest("hex"),
      })),
    );
  } catch {
    throw new DurableError("MIGRATION_FILES_UNAVAILABLE");
  }
  try {
    const ledger = await db.query<{ version: number; checksum: string }>(
      `SELECT version,checksum FROM ${schema}.schema_migrations ORDER BY version LIMIT $1`,
      [expected.length + 1],
    );
    if (
      ledger.rows.some((row) => !expected.some((entry) => entry.version === row.version)) ||
      new Set(ledger.rows.map((row) => row.version)).size !== ledger.rows.length
    )
      throw new DurableError("DATABASE_SCHEMA_MISMATCH");
    for (const entry of expected) {
      const applied = ledger.rows.find((row) => row.version === entry.version);
      if (!applied) throw new DurableError("DATABASE_MIGRATION_REQUIRED");
      if (applied.checksum !== entry.checksum)
        throw new DurableError("MIGRATION_CHECKSUM_MISMATCH");
    }
    const table = await db.query<{ present: boolean }>(
      "SELECT to_regclass($1) IS NOT NULL AS present",
      [`${db.schema}.investigation_runs`],
    );
    if (table.rows[0]?.present !== true) throw new DurableError("DATABASE_MIGRATION_REQUIRED");
    return { schemaReady: true, migrationVersions: expected.map((entry) => entry.version) };
  } catch (error) {
    throw databaseError(error);
  }
}
