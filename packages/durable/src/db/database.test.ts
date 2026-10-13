import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureLocalInputs } from "../../../analysis/src/ingestion.ts";
import { FIXTURE_SELECTIONS } from "../../../analysis/src/fixture.ts";
import { sha256 } from "../../../analysis/src/identity.ts";
import { loadConnection } from "../config.ts";
import { Coordinator } from "../coordinator.ts";
import { makeManifest } from "../identity.ts";
import { transition } from "../contracts.ts";
import type { LeaseClaim, RunLimits, SubmitRequest } from "../contracts.ts";
import { createDatabase, identifier } from "./client.ts";
import type { DurableDatabase } from "./client.ts";
import { migrate } from "./migrate.ts";

let owner: DurableDatabase;
let db: DurableDatabase;
let coordinator: Coordinator;
let schema: string;
let sequence = 0;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  schema = `test_db_${randomUUID().replaceAll("-", "")}`;
  const [migrationConfig, runtimeConfig] = await Promise.all([
    loadConnection(true),
    loadConnection(),
  ]);
  owner = createDatabase(migrationConfig, { schema });
  db = createDatabase(runtimeConfig, { schema });
  await migrate(owner, { runtimeRole: runtimeConfig.user });
  coordinator = new Coordinator(db);
  await coordinator.workspace();
});
afterEach(async () => {
  if (db) await db.close();
  if (owner) {
    // This test creates and owns only a unique synthetic schema in the dedicated test database.
    if (!/^test_db_[a-f0-9]{32}$/.test(schema)) throw new Error("UNSAFE_TEST_SCHEMA");
    await owner.query(`DROP SCHEMA ${identifier(schema)} CASCADE`);
    await owner.close();
  }
});
async function request(unique = false, limits?: Partial<RunLimits>): Promise<SubmitRequest> {
  const captured = (await captureLocalInputs(process.cwd(), FIXTURE_SELECTIONS)).map((item) => ({
    ...item,
  }));
  if (unique) {
    const source = captured.find((item) => item.role === "source")!;
    source.bytes = new TextEncoder().encode(
      new TextDecoder().decode(source.bytes) + `\n// unique ${sequence++}\n`,
    );
  }
  const { workspaceId: ignored, ...manifest } = makeManifest(
    await coordinator.workspace(),
    captured,
  );
  void ignored;
  return { ...manifest, ...(limits ? { limits } : {}) };
}
async function active(options: Partial<RunLimits> = {}): Promise<LeaseClaim> {
  await coordinator.submit(await request(true, options));
  await coordinator.dispatch();
  const claimed = await coordinator.claim();
  expect(claimed).not.toBeNull();
  return coordinator.start(claimed!);
}
const result = () => ({
  resultDigest: sha256("synthetic-coordinator-test-result"),
  jsonArtifact: { sha256: sha256("synthetic-json"), byteLength: 14 },
  markdownArtifact: { sha256: sha256("synthetic-report"), byteLength: 16 },
  computeMs: 5,
});

describe("real PostgreSQL schema and durable coordination", () => {
  it("D01 fresh migrations enforce constraints, indexes, runtime privileges and schema versions", async () => {
    const versions = await db.query<{ version: number }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    expect(versions.rows.map((row) => row.version)).toEqual([1, 2, 3]);
    const constraints = await owner.query<{ count: string }>(
      "SELECT count(*) FROM pg_constraint WHERE connamespace=$1::regnamespace",
      [schema],
    );
    expect(Number(constraints.rows[0]!.count)).toBeGreaterThan(60);
    const indexes = await db.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname=$1",
      [schema],
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining(["outbox_ready", "steps_ready", "leases_expired"]),
    );
    await expect(db.query("CREATE TABLE forbidden(value int)")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(db.query("UPDATE budget_limits SET max_runs=999")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      db.query("INSERT INTO schema_migrations(version,checksum) VALUES(9,$1)", [sha256("fake")]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("D02 repeated migration is idempotent and failed migration rolls back DDL and version", async () => {
    expect(await migrate(owner, { runtimeRole: (await loadConnection()).user })).toEqual([]);
    await expect(
      migrate(owner, {
        runtimeRole: (await loadConnection()).user,
        migrations: [
          {
            version: 4,
            sql: "CREATE TABLE should_rollback(value int); SELECT nonexistent_drift_function();",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "42883" });
    expect((await db.query("SELECT version FROM schema_migrations WHERE version=4")).rowCount).toBe(
      0,
    );
    expect(
      (await db.query<{ table: string | null }>("SELECT to_regclass('should_rollback') AS table"))
        .rows[0]!.table,
    ).toBeNull();
    await expect(migrate(owner, { migrations: [{ version: 1, sql: "SELECT 1" }] })).rejects.toThrow(
      "MIGRATION_CHECKSUM_MISMATCH",
    );
  });
  it("D06 six concurrent submissions have one run, reservation and canonical outbox intent", async () => {
    const input = await request();
    const submissions = await Promise.all(
      Array.from({ length: 6 }, () => coordinator.submit(input)),
    );
    // A second round also exercises the separate advisory-lock pool without starving SQL work.
    const serialized = await Promise.all(
      Array.from({ length: 6 }, () =>
        coordinator.withArtifactLock(() => coordinator.submit(input)),
      ),
    );
    expect(new Set(submissions.map((item) => item.runId)).size).toBe(1);
    expect(new Set(serialized.map((item) => item.runId))).toEqual(
      new Set(submissions.map((item) => item.runId)),
    );
    for (const table of ["investigation_runs", "budget_reservations", "outbox_events"]) {
      expect(
        (await db.query<{ count: string }>(`SELECT count(*) FROM ${identifier(table)}`)).rows[0]!
          .count,
      ).toBe("1");
    }
    expect((await coordinator.budgets()).runCount).toBe(1);
  });
  it("D07 idempotency token rejects changed input without another reservation", async () => {
    const first = await coordinator.submit({
      ...(await request(true)),
      idempotencyToken: "reviewed-token",
    });
    await expect(
      coordinator.submit({ ...(await request(true)), idempotencyToken: "reviewed-token" }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect((await coordinator.list()).map((item) => item.runId)).toEqual([first.runId]);
    expect((await coordinator.budgets()).runCount).toBe(1);
  });
  it("D10 duplicate delivery retains one inbox effect and does not append transition audit", async () => {
    const submitted = await coordinator.submit(await request());
    expect(await coordinator.dispatch()).toBe(1);
    await owner.query("UPDATE outbox_events SET delivered_at=NULL WHERE run_id=$1", [
      submitted.runId,
    ]);
    expect(await coordinator.dispatch()).toBe(1);
    expect(
      (await db.query<{ count: string }>("SELECT count(*) FROM inbox_receipts")).rows[0]!.count,
    ).toBe("1");
    expect(
      (await db.query<{ delivery_attempts: number }>("SELECT delivery_attempts FROM outbox_events"))
        .rows[0]!.delivery_attempts,
    ).toBe(2);
    expect(await coordinator.events(submitted.runId)).toHaveLength(1);
    expect((await coordinator.get(submitted.runId)).attempts).toBe(0);
  });
  it("D10 failure after inbox/readiness effects before delivery acknowledgement rolls back atomically", async () => {
    const submitted = await coordinator.submit(await request());
    await owner.query(`CREATE FUNCTION fail_delivery_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF OLD.delivered_at IS NULL AND NEW.delivered_at IS NOT NULL THEN
        RAISE EXCEPTION 'TRUSTED_DELIVERY_ACK_FAULT';
      END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER failed_delivery_ack BEFORE UPDATE ON outbox_events FOR EACH ROW EXECUTE FUNCTION fail_delivery_ack();`);
    await expect(coordinator.dispatch()).rejects.toMatchObject({ code: "P0001" });
    expect((await db.query("SELECT event_id FROM inbox_receipts")).rowCount).toBe(0);
    expect(
      (
        await db.query<{ ready: boolean }>("SELECT ready FROM run_steps WHERE run_id=$1", [
          submitted.runId,
        ])
      ).rows[0]!.ready,
    ).toBe(false);
    const before = (
      await db.query<{ delivered_at: Date | null; delivery_attempts: number }>(
        "SELECT delivered_at,delivery_attempts FROM outbox_events WHERE run_id=$1",
        [submitted.runId],
      )
    ).rows[0]!;
    expect(before).toEqual({ delivered_at: null, delivery_attempts: 0 });
    expect((await coordinator.get(submitted.runId)).state).toBe("QUEUED");
    await owner.query(
      "DROP TRIGGER failed_delivery_ack ON outbox_events; DROP FUNCTION fail_delivery_ack()",
    );
    expect(await coordinator.dispatch()).toBe(1);
    expect((await db.query("SELECT event_id FROM inbox_receipts")).rowCount).toBe(1);
    expect(
      (
        await db.query<{ ready: boolean }>("SELECT ready FROM run_steps WHERE run_id=$1", [
          submitted.runId,
        ])
      ).rows[0]!.ready,
    ).toBe(true);
    expect((await coordinator.get(submitted.runId)).attempts).toBe(0);
    expect(await coordinator.events(submitted.runId)).toHaveLength(1);
  });
  it("D11 overlapping workers admit one owner for the available step", async () => {
    await coordinator.submit(await request());
    await coordinator.dispatch();
    const claims = await Promise.all([
      coordinator.claim(),
      coordinator.claim(),
      coordinator.claim(),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await coordinator.budgets()).activeWorkers).toBe(1);
    expect(claims.find(Boolean)!.generation).toBe(1);
  });
  it("D12 real lease expiry fences old completion, refund and audit against replacement owner", async () => {
    const first = await active({ leaseMs: 500 });
    await delay(650);
    expect(await coordinator.recover()).toBe(1);
    await delay(200);
    await coordinator.dispatch();
    const second = await coordinator.claim();
    expect(second?.generation).toBe(2);
    const started = await coordinator.start(second!);
    const raced = await Promise.allSettled([
      coordinator.stop(first, { code: "STALE_WORKER" }),
      coordinator.complete(started, result()),
    ]);
    expect(raced[0]).toMatchObject({ status: "rejected", reason: { code: "STALE_LEASE" } });
    expect(raced[1]).toMatchObject({ status: "fulfilled", value: { state: "ANALYSIS_COMPLETE" } });
    expect(
      (await coordinator.events(first.runId)).filter((item) => item.state === "ANALYSIS_COMPLETE"),
    ).toHaveLength(1);
    expect((await coordinator.budgets()).activeWorkers).toBe(0);
    expect((await coordinator.budgets()).reservedBytes).toBe(0);
    expect((await coordinator.get(first.runId)).attempts).toBe(2);
  });
  it("D12 expiry during finalization rolls back result references, settlement and completion audit", async () => {
    const claim = await active({ leaseMs: 500 });
    await owner.query(`CREATE FUNCTION delay_result_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      PERFORM pg_sleep(0.65); RETURN NEW; END $$;
      CREATE TRIGGER delayed_artifact BEFORE INSERT ON run_artifacts FOR EACH ROW EXECUTE FUNCTION delay_result_insert();`);
    await expect(coordinator.complete(claim, result())).rejects.toThrow("STALE_LEASE");
    expect((await coordinator.get(claim.runId)).state).toBe("ANALYZING");
    expect(await coordinator.artifacts(claim.runId)).toEqual([]);
    expect((await coordinator.events(claim.runId)).map((item) => item.state)).toEqual([
      "QUEUED",
      "CLAIMED",
      "ANALYZING",
    ]);
    const budget = await coordinator.budgets();
    expect(budget.reservedBytes).toBeGreaterThan(0);
    expect(budget.consumedBytes).toBe(0);
    expect(budget.activeWorkers).toBe(1);
  });
  it("D15 cancel before claim releases unused budget exactly once and retains input storage charge", async () => {
    const submitted = await coordinator.submit(await request());
    await coordinator.cancel(submitted.runId);
    await coordinator.cancel(submitted.runId);
    await coordinator.dispatch();
    expect(await coordinator.claim()).toBeNull();
    const budget = await coordinator.budgets();
    expect(budget.reservedBytes).toBe(0);
    expect(budget.reservedComputeMs).toBe(0);
    expect(budget.consumedBytes).toBeGreaterThan(0);
    expect(budget.activeWorkers).toBe(0);
    expect((await coordinator.get(submitted.runId)).attempts).toBe(0);
    expect(await coordinator.events(submitted.runId)).toHaveLength(2);
  });
  it("D16 overlapping cancellation/completion publishes one terminal audit and settles once", async () => {
    const claim = await active();
    await Promise.all([coordinator.cancel(claim.runId), coordinator.complete(claim, result())]);
    expect(["CANCELLED", "ANALYSIS_COMPLETE"]).toContain(
      (await coordinator.get(claim.runId)).state,
    );
    const terminal = (await coordinator.events(claim.runId)).filter((item) =>
      ["CANCELLED", "ANALYSIS_COMPLETE"].includes(item.state),
    );
    expect(terminal).toHaveLength(1);
    expect((await coordinator.budgets()).reservedComputeMs).toBe(0);
    expect((await coordinator.budgets()).activeWorkers).toBe(0);
    await expect(coordinator.complete(claim, result())).rejects.toThrow("STALE_LEASE");
  });
  it("D16 crashed cancellation recovery charges an explicit DB-time estimate instead of zero", async () => {
    const claim = await active({ leaseMs: 300 });
    expect((await coordinator.cancel(claim.runId)).state).toBe("CANCEL_REQUESTED");
    await delay(400);
    expect(await coordinator.recover()).toBe(1);
    expect((await coordinator.get(claim.runId)).state).toBe("CANCELLED");
    const row = (
      await db.query<{
        compute_measured_ms: string;
        compute_estimated_ms: string;
        compute_consumed: number;
      }>(
        "SELECT compute_measured_ms,compute_estimated_ms,compute_consumed FROM budget_reservations WHERE run_id=$1",
        [claim.runId],
      )
    ).rows[0]!;
    expect(Number(row.compute_measured_ms)).toBe(0);
    expect(Number(row.compute_estimated_ms)).toBeGreaterThanOrEqual(300);
    expect(row.compute_consumed).toBe(Number(row.compute_estimated_ms));
    expect((await coordinator.budgets()).reservedComputeMs).toBe(0);
    expect((await coordinator.budgets()).activeWorkers).toBe(0);
  });
  it("D18 transient retries retain request identity, charge prior work and bound backoff", async () => {
    const first = await active({ computeMs: 5000 });
    expect((await coordinator.retry(first, "WORKER_CRASH", 120)).state).toBe("QUEUED");
    expect(await coordinator.claim()).toBeNull();
    await delay(200);
    await coordinator.dispatch();
    const second = await coordinator.claim();
    expect(second!.runId).toBe(first.runId);
    expect(second!.limits.computeMs).toBe(4880);
    expect(second!.attemptId).not.toBe(first.attemptId);
    expect(second!.generation).toBe(2);
    await coordinator.stop(second!, { code: "TEST_STOP", computeMs: 25 });
    expect((await coordinator.budgets()).consumedComputeMs).toBe(145);
    expect(
      (await db.query<{ count: string }>("SELECT count(*) FROM budget_reservations")).rows[0]!
        .count,
    ).toBe("1");
  });
  it("D19 retry exhaustion and compute exhaustion terminate without leaked reservations", async () => {
    const claim = await active({ maxAttempts: 1 });
    expect((await coordinator.retry(claim, "WORKER_CRASH", 20)).failureCode).toBe(
      "RETRY_EXHAUSTED",
    );
    const second = await active({ computeMs: 50 });
    expect((await coordinator.retry(second, "WORKER_CRASH", 50)).failureCode).toBe(
      "COMPUTE_BUDGET_EXHAUSTED",
    );
    expect((await coordinator.budgets()).reservedComputeMs).toBe(0);
    expect((await coordinator.budgets()).activeWorkers).toBe(0);
  });
  it("D19 persisted deadline terminates queued work and accounts late observed overrun honestly", async () => {
    const queued = await coordinator.submit(await request(true, { durationMs: 50 }));
    await delay(80);
    expect(await coordinator.recover()).toBe(1);
    expect((await coordinator.get(queued.runId)).failureCode).toBe("RUN_DEADLINE");
    const claim = await active({ computeMs: 50 });
    await expect(coordinator.complete(claim, { ...result(), computeMs: 60 })).rejects.toThrow(
      "COMPUTE_BUDGET_EXCEEDED",
    );
    await coordinator.stop(claim, { code: "COMPUTE_BUDGET_EXCEEDED", computeMs: 60 });
    const row = (
      await db.query<{ compute_measured_ms: string; compute_consumed: number }>(
        "SELECT compute_measured_ms,compute_consumed FROM budget_reservations WHERE run_id=$1",
        [claim.runId],
      )
    ).rows[0]!;
    expect(Number(row.compute_measured_ms)).toBe(60);
    expect(row.compute_consumed).toBe(50);
    expect((await coordinator.budgets()).reservedComputeMs).toBe(0);
  });
  it("D20 concurrent distinct submissions cannot oversubscribe a single-run quota", async () => {
    await owner.query("UPDATE budget_limits SET max_runs=1");
    const inputs = await Promise.all([request(true), request(true)]);
    const submitted = await Promise.allSettled(inputs.map((input) => coordinator.submit(input)));
    expect(submitted.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(submitted.filter((item) => item.status === "rejected")).toMatchObject([
      { reason: { code: "BUDGET_EXHAUSTED" } },
    ]);
    expect((await coordinator.budgets()).runCount).toBe(1);
    expect((await coordinator.budgets()).reservedBytes).toBeGreaterThan(0);
  });
  it("D22 forged run/workspace, malformed audit and immutable identity mutations are denied", async () => {
    const claim = await active();
    await expect(coordinator.get("../../secret")).rejects.toThrow("INVALID_RUN_ID");
    await expect(coordinator.get(randomUUID())).rejects.toThrow("RUN_NOT_FOUND");
    await expect(
      coordinator.stop({ ...claim, workspaceId: randomUUID() }, { code: "TEST" }),
    ).rejects.toThrow("WORKSPACE_MISMATCH");
    await expect(db.query("UPDATE audit_events SET reason='FORGED'")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(owner.query("UPDATE audit_events SET reason='FORGED'")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      db.query(
        "INSERT INTO audit_events(workspace_id,run_id,sequence,state,state_version,actor,reason) VALUES($1,$2,99,'ANALYSIS_COMPLETE',99,'worker','FORGED')",
        [claim.workspaceId, claim.runId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query("UPDATE investigation_runs SET request_key=$2 WHERE run_id=$1", [
        claim.runId,
        sha256("forged"),
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(
        "INSERT INTO run_inputs SELECT workspace_id,run_id,99,role,path||'x',digest,byte_length FROM run_inputs WHERE run_id=$1 LIMIT 1",
        [claim.runId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("D23 pure state machine and database reject terminal-to-active transitions", async () => {
    const submitted = await coordinator.submit(await request());
    await coordinator.cancel(submitted.runId);
    expect(() => transition("CANCELLED", "QUEUED")).toThrow("INVALID_TRANSITION");
    await expect(
      owner.query(
        "UPDATE investigation_runs SET state='QUEUED',state_version=state_version+1,finished_at=NULL WHERE run_id=$1",
        [submitted.runId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    expect((await coordinator.get(submitted.runId)).state).toBe("CANCELLED");
  });
});
