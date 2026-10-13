import pg from "pg";

// Invoked explicitly only inside the ephemeral CI PostgreSQL service job.
// It is not an application CLI command or a local installation helper.
if (
  process.env.CI !== "true" ||
  process.env.DRIFT_DB_HOST !== "127.0.0.1" ||
  process.env.DRIFT_DB_DATABASE !== "driftreplay_phase3"
)
  throw new Error("CI_BOOTSTRAP_SCOPE_REQUIRED");
const password = (name: string): string => {
  const value = process.env[name];
  if (!value || !/^[A-Za-z0-9_-]{16,100}$/.test(value))
    throw new Error("CI_SYNTHETIC_PASSWORD_REQUIRED");
  return value;
};
const client = new pg.Client({
  host: "127.0.0.1",
  port: Number(process.env.DRIFT_DB_PORT),
  database: "driftreplay_phase3",
  user: "postgres",
  password: password("DRIFT_BOOTSTRAP_PASSWORD"),
});
try {
  await client.connect();
  await client.query(
    `CREATE ROLE drift_migrator LOGIN PASSWORD '${password("DRIFT_MIGRATION_PASSWORD")}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`,
  );
  await client.query(
    `CREATE ROLE drift_runtime LOGIN PASSWORD '${password("DRIFT_DB_PASSWORD")}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`,
  );
  await client.query("REVOKE ALL ON DATABASE driftreplay_phase3 FROM PUBLIC");
  await client.query("GRANT CONNECT,CREATE ON DATABASE driftreplay_phase3 TO drift_migrator");
  await client.query("GRANT CONNECT ON DATABASE driftreplay_phase3 TO drift_runtime");
  await client.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
  process.stdout.write("Ephemeral CI database roles prepared.\n");
} catch {
  process.stderr.write("CI_DATABASE_BOOTSTRAP_FAILED\n");
  process.exitCode = 2;
} finally {
  await client.end();
}
