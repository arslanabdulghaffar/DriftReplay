import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DurableError } from "../contracts.ts";
import { identifier } from "./client.ts";
import type { DurableDatabase } from "./client.ts";

export interface Migration {
  version: number;
  sql: string;
}
export async function migrate(
  db: DurableDatabase,
  options: { runtimeRole?: string; migrations?: readonly Migration[] } = {},
): Promise<number[]> {
  const runtimeRole = options.runtimeRole ?? "drift_runtime";
  identifier(runtimeRole);
  const migrations =
    options.migrations ??
    (await Promise.all(
      [
        [1, "001_initial.sql"],
        [2, "002_accounting.sql"],
        [3, "003_storage_guards.sql"],
      ].map(async ([version, file]) => ({
        version: Number(version),
        sql: await readFile(new URL(`./migrations/${String(file)}`, import.meta.url), "utf8"),
      })),
    ));
  const client = await db.pool.connect();
  const applied: number[] = [];
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1),1)", [db.schema]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${identifier(db.schema)}`);
    await client.query(`REVOKE ALL ON SCHEMA ${identifier(db.schema)} FROM PUBLIC`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${identifier(db.schema)}.schema_migrations(version integer PRIMARY KEY CHECK(version>0), checksum text NOT NULL CHECK(checksum ~ '^[0-9a-f]{64}$'), applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`,
    );
    for (const migration of migrations) {
      if (!Number.isSafeInteger(migration.version) || migration.version < 1)
        throw new DurableError("INVALID_MIGRATION");
      const checksum = createHash("sha256").update(migration.sql).digest("hex");
      const previous = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE version=$1",
        [migration.version],
      );
      if (previous.rowCount) {
        if (previous.rows[0]!.checksum !== checksum)
          throw new DurableError("MIGRATION_CHECKSUM_MISMATCH");
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)", [
          migration.version,
          checksum,
        ]);
        await client.query("COMMIT");
        applied.push(migration.version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    await client.query(
      `GRANT USAGE ON SCHEMA ${identifier(db.schema)} TO ${identifier(runtimeRole)}`,
    );
    await client.query(
      `GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA ${identifier(db.schema)} TO ${identifier(runtimeRole)}`,
    );
    await client.query(
      `GRANT USAGE ON ALL SEQUENCES IN SCHEMA ${identifier(db.schema)} TO ${identifier(runtimeRole)}`,
    );
    await client.query(`REVOKE INSERT,UPDATE ON schema_migrations FROM ${identifier(runtimeRole)}`);
    for (const table of [
      "audit_events",
      "storage_events",
      "run_inputs",
      "run_artifacts",
      "idempotency_tokens",
    ])
      await client.query(`REVOKE UPDATE ON ${identifier(table)} FROM ${identifier(runtimeRole)}`);
    await client.query(`REVOKE UPDATE ON budget_limits FROM ${identifier(runtimeRole)}`);
    await client.query(
      `GRANT UPDATE(run_count,active_workers,reserved_bytes,consumed_bytes,reserved_compute_ms,consumed_compute_ms) ON budget_limits TO ${identifier(runtimeRole)}`,
    );
    await client.query(`REVOKE UPDATE ON input_blobs FROM ${identifier(runtimeRole)}`);
    await client.query(
      `GRANT UPDATE(state,deleted_at) ON input_blobs TO ${identifier(runtimeRole)}`,
    );
    await client.query(
      `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${identifier(db.schema)} FROM PUBLIC`,
    );
    return applied;
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext($1),1)", [db.schema])
      .catch(() => undefined);
    client.release();
  }
}
