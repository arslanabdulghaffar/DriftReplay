import pg from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { DurableError } from "../contracts.ts";

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}
export interface SqlClient {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>;
}
export function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new DurableError("INVALID_DATABASE_IDENTIFIER");
  return `"${value}"`;
}
export class DurableDatabase implements SqlClient {
  readonly pool: pg.Pool;
  readonly artifactLockPool: pg.Pool;
  readonly schema: string;
  constructor(config: DatabaseConfig, options: { schema?: string } = {}) {
    if (
      config.host !== "127.0.0.1" ||
      !Number.isSafeInteger(config.port) ||
      config.port < 1024 ||
      config.port > 65535 ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(config.database) ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(config.user) ||
      typeof config.password !== "string" ||
      config.password.length < 1 ||
      Object.keys(config).some(
        (key) => !["host", "port", "database", "user", "password"].includes(key),
      )
    )
      throw new DurableError("INVALID_DATABASE_CONFIG");
    this.schema = options.schema ?? "driftreplay";
    identifier(this.schema);
    this.pool = new pg.Pool({
      ...config,
      max: 4,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 5_000,
      statement_timeout: 10_000,
      lock_timeout: 5_000,
      options: `-c search_path=${this.schema},pg_catalog`,
      application_name: "driftreplay-local-phase3",
    });
    // Idle-client errors are observed; never print raw connection strings or SQL payloads.
    this.pool.on("error", () => {});
    // Advisory-lock waiters must not occupy the pool needed by the lock owner's transactions.
    this.artifactLockPool = new pg.Pool({
      ...config,
      max: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 5_000,
      options: `-c search_path=${this.schema},pg_catalog`,
      application_name: "driftreplay-local-artifact-lock",
    });
    this.artifactLockPool.on("error", () => {});
  }
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, values ? [...values] : undefined);
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await Promise.all([this.pool.end(), this.artifactLockPool.end()]);
  }
}
export function createDatabase(
  config: DatabaseConfig,
  options: { schema?: string } = {},
): DurableDatabase {
  return new DurableDatabase(config, options);
}
export function databaseError(error: unknown): DurableError {
  if (error instanceof DurableError) return error;
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "57P01",
      "57P02",
      "57P03",
      "08000",
      "08003",
      "08006",
      "40001",
      "40P01",
      "55P03",
    ].includes(code)
  )
    return new DurableError("TRANSIENT_DATABASE_FAILURE");
  if (["42P01", "3F000"].includes(code)) return new DurableError("DATABASE_MIGRATION_REQUIRED");
  if (code === "28P01" || code === "42501") return new DurableError("DATABASE_PERMISSION_DENIED");
  return new DurableError("DATABASE_FAILURE");
}
