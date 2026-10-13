import { resolve } from "node:path";
import { FIXTURE_SELECTIONS } from "../../analysis/src/fixture.ts";
import type { LocalSelection } from "../../analysis/src/ingestion.ts";
import { ArtifactError, ArtifactStore } from "./artifacts.ts";
import { ConfigurationError, loadConnection } from "./config.ts";
import { DurableError, validateRunId } from "./contracts.ts";
import { Coordinator } from "./coordinator.ts";
import { createDatabase, databaseError } from "./db/client.ts";
import { migrate } from "./db/migrate.ts";
import { assertMigrationStatus } from "./db/migration-status.ts";
import { InvestigationService } from "./service.ts";
import { ManifestError } from "./identity.ts";
import { InputError } from "../../analysis/src/errors.ts";

function argumentsFor(args: readonly string[]): { command: string; values: Map<string, string[]> } {
  const [command, ...rest] = args;
  const commands = [
    "doctor",
    "migrate",
    "submit",
    "worker",
    "list",
    "status",
    "events",
    "cancel",
    "verify",
    "reconcile",
    "gc",
  ];
  if (!command || !commands.includes(command)) throw new DurableError("CLI_USAGE");
  const values = new Map<string, string[]>();
  const flags = new Set(["fixture", "until-idle", "dry-run", "apply"]);
  const allowed: Record<string, string[]> = {
    doctor: [],
    migrate: [],
    list: [],
    submit: ["fixture", "root", "base", "candidate", "source", "mapping", "idempotency-token"],
    worker: ["until-idle"],
    status: ["run-id"],
    events: ["run-id"],
    cancel: ["run-id"],
    verify: ["run-id"],
    reconcile: ["dry-run", "apply"],
    gc: ["dry-run", "apply"],
  };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--") continue;
    const key = rest[i]!.replace(/^--/, "");
    if (
      !rest[i]!.startsWith("--") ||
      !allowed[command]!.includes(key) ||
      (values.has(key) && key !== "source")
    )
      throw new DurableError("CLI_USAGE");
    const value = flags.has(key) ? "true" : rest[++i];
    if (!value || value.startsWith("--") || value.length > 4096)
      throw new DurableError("CLI_USAGE");
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  if (values.has("dry-run") && values.has("apply")) throw new DurableError("CLI_USAGE");
  return { command, values };
}

async function main(): Promise<void> {
  const { command, values } = argumentsFor(process.argv.slice(2));
  const db = createDatabase(await loadConnection(command === "migrate"));
  const output = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
  try {
    if (command === "migrate") {
      await migrate(db, { runtimeRole: (await loadConnection()).user });
      output({ migrated: true });
      return;
    }
    if (command === "doctor") {
      const server = await db.query<{
        version: string;
        address: string;
        superuser: boolean;
        privileged: boolean;
      }>(
        "SELECT current_setting('server_version') AS version, host(inet_server_addr()) AS address, rolsuper AS superuser, (rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AS privileged FROM pg_roles WHERE rolname=current_user",
      );
      if (
        server.rows[0]?.address !== "127.0.0.1" ||
        server.rows[0]?.superuser ||
        server.rows[0]?.privileged
      )
        throw new DurableError("DATABASE_PERMISSION_DENIED");
      const schema = await assertMigrationStatus(db);
      output({
        database: "ready",
        version: server.rows[0].version,
        loopbackOnlyConnection: true,
        runtimeSuperuser: false,
        ...schema,
        trust: "single-owner-local",
        replayExecuted: false,
        repairExecuted: false,
        modelInvocations: 0,
      });
      return;
    }
    const coordinator = new Coordinator(db);
    const store = new ArtifactStore(resolve(".local/durable/artifacts"));
    await store.initialize();
    const service = new InvestigationService(coordinator, store);
    if (command === "submit") {
      const fixture = values.has("fixture");
      if (
        fixture &&
        ["root", "base", "candidate", "source", "mapping"].some((flag) => values.has(flag))
      )
        throw new DurableError("CLI_USAGE");
      const selections: LocalSelection[] = fixture
        ? [...FIXTURE_SELECTIONS]
        : [
            { path: values.get("base")?.[0] ?? "", role: "base-contract" },
            { path: values.get("candidate")?.[0] ?? "", role: "candidate-contract" },
            ...(values.get("source") ?? []).map((path) => ({ path, role: "source" as const })),
            ...(values.has("mapping")
              ? [{ path: values.get("mapping")![0]!, role: "mapping" as const }]
              : []),
          ];
      const token = values.get("idempotency-token")?.[0];
      const run = await service.submit(
        resolve(values.get("root")?.[0] ?? "."),
        selections,
        token ? { idempotencyToken: token } : {},
      );
      output({
        runId: run.runId,
        inputSetDigest: run.inputSetDigest,
        requestKey: run.requestKey,
        state: run.state,
      });
      return;
    }
    if (command === "worker") {
      if (!values.has("until-idle")) throw new DurableError("CLI_USAGE");
      output({
        processed: await service.workUntilIdle(),
        state: "IDLE",
        scope: "currently-ready-work",
      });
      return;
    }
    if (command === "list") {
      output(await coordinator.list());
      return;
    }
    if (command === "gc" || command === "reconcile") {
      const apply = values.has("apply");
      const recovered = command === "reconcile" && apply ? await coordinator.recover() : null;
      output({ ...(await service.garbageCollect(apply)), recovered });
      return;
    }
    const runId = validateRunId(values.get("run-id")?.[0]);
    if (command === "status") output(await coordinator.get(runId));
    else if (command === "events") output(await coordinator.events(runId));
    else if (command === "cancel") output(await coordinator.cancel(runId));
    else if (command === "verify") {
      const { run, result } = await service.verify(runId);
      output({
        runId,
        state: run.state,
        inputSetDigest: run.inputSetDigest,
        runDigest: result.runDigest,
        deltas: result.deltas.length,
        usages: result.usages.length,
        impacts: result.links.length,
        unresolved: result.unresolved.length,
        replayExecuted: false,
        repairExecuted: false,
        modelInvocations: 0,
      });
    }
  } finally {
    await db.close();
  }
}

await main().catch((error: unknown) => {
  const code =
    error instanceof ConfigurationError
      ? error.message
      : error instanceof ArtifactError ||
          error instanceof DurableError ||
          error instanceof ManifestError ||
          error instanceof InputError
        ? error.code
        : databaseError(error).code;
  process.stderr.write(`${JSON.stringify({ error: code, scope: "local-static-analysis-only" })}\n`);
  process.exitCode = code === "CLI_USAGE" ? 64 : 2;
});
