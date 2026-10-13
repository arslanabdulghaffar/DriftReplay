import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../../../../tests/durable/helpers.ts";
import { assertMigrationStatus } from "./migration-status.ts";

describe("D01 D02: read-only real PostgreSQL migration readiness", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  }, 30_000);
  afterEach(async () => {
    await h?.dispose();
  }, 30_000);

  it("accepts the exact fresh migration ledger inside a read-only transaction", async () => {
    const before = await h.db.query("SELECT * FROM schema_migrations ORDER BY version");
    const status = await h.db.transaction(async (client) => {
      await client.query("SET TRANSACTION READ ONLY");
      return assertMigrationStatus({ schema: h.schema, query: client.query.bind(client) });
    });
    expect(status).toEqual({ schemaReady: true, migrationVersions: [1, 2, 3] });
    expect((await h.db.query("SELECT * FROM schema_migrations ORDER BY version")).rows).toEqual(
      before.rows,
    );
    expect((await h.db.query("SELECT * FROM local_workspaces")).rowCount).toBe(0);
  });

  it("rejects an absent migration ledger without creating it despite a present run table", async () => {
    await h.owner.query("DROP TABLE schema_migrations");
    await expect(assertMigrationStatus(h.db)).rejects.toThrow("DATABASE_MIGRATION_REQUIRED");
    expect(
      (
        await h.db.query<{ ledger: string | null }>("SELECT to_regclass($1)::text AS ledger", [
          `${h.schema}.schema_migrations`,
        ])
      ).rows[0]!.ledger,
    ).toBeNull();
    expect((await h.db.query("SELECT * FROM investigation_runs")).rowCount).toBe(0);
  });

  it("rejects an older ledger missing migration 3 and leaves it unchanged", async () => {
    await h.owner.query("DELETE FROM schema_migrations WHERE version=3");
    const before = await h.db.query("SELECT * FROM schema_migrations ORDER BY version");
    await expect(assertMigrationStatus(h.db)).rejects.toThrow("DATABASE_MIGRATION_REQUIRED");
    expect((await h.db.query("SELECT * FROM schema_migrations ORDER BY version")).rows).toEqual(
      before.rows,
    );
  });

  it("rejects a changed migration checksum without silently replacing it", async () => {
    await h.owner.query("UPDATE schema_migrations SET checksum=$1 WHERE version=3", [
      "0".repeat(64),
    ]);
    await expect(assertMigrationStatus(h.db)).rejects.toThrow("MIGRATION_CHECKSUM_MISMATCH");
    expect(
      (
        await h.db.query<{ checksum: string }>(
          "SELECT checksum FROM schema_migrations WHERE version=3",
        )
      ).rows[0]!.checksum,
    ).toBe("0".repeat(64));
  });

  it("rejects an unknown future migration instead of declaring compatibility", async () => {
    await h.owner.query("INSERT INTO schema_migrations(version,checksum) VALUES(4,$1)", [
      "f".repeat(64),
    ]);
    await expect(assertMigrationStatus(h.db)).rejects.toThrow("DATABASE_SCHEMA_MISMATCH");
    expect(
      (
        await h.db.query<{ version: number }>(
          "SELECT version FROM schema_migrations ORDER BY version",
        )
      ).rows.map((row) => row.version),
    ).toEqual([1, 2, 3, 4]);
  });
});
