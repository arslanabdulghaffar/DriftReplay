import { randomInt, randomUUID } from "node:crypto";
import { validateExperimentSelections } from "../../analysis/src/ingestion.ts";
import { verifyManifest } from "./identity.ts";
import {
  DurableError,
  TERMINAL_STATES,
  checkedLimits,
  transition,
  validateDigest,
  validateRunId,
} from "./contracts.ts";
import type {
  ArtifactRef,
  AuditEvent,
  BudgetRecord,
  LeaseClaim,
  ManifestEntry,
  RunLimits,
  RunRecord,
  RunState,
  StoredArtifact,
  SubmitRequest,
} from "./contracts.ts";
import type { DurableDatabase, SqlClient } from "./db/client.ts";

type Row = Record<string, unknown>;
function num(row: Row, key: string): number {
  return Number(row[key]);
}
function str(row: Row, key: string): string {
  return String(row[key]);
}
function date(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
function limits(row: Row): RunLimits {
  return {
    maxAttempts: num(row, "max_attempts"),
    computeMs: num(row, "compute_ms"),
    outputBytes: num(row, "output_bytes"),
    durationMs: num(row, "duration_ms"),
    leaseMs: num(row, "lease_ms"),
  };
}
function run(row: Row): RunRecord {
  return {
    runId: str(row, "run_id"),
    workspaceId: str(row, "workspace_id"),
    requestKey: str(row, "request_key"),
    inputSetDigest: str(row, "input_set_digest"),
    state: row.state as RunState,
    stateVersion: num(row, "state_version"),
    engine: row.engine as RunRecord["engine"],
    policyId: str(row, "policy_id"),
    policyHash: str(row, "policy_hash"),
    limits: limits(row),
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
    deadline: date(row.deadline),
    finishedAt: row.finished_at ? date(row.finished_at) : null,
    cancelRequestedAt: row.cancel_requested_at ? date(row.cancel_requested_at) : null,
    resultDigest: row.result_digest ? str(row, "result_digest") : null,
    failureCode: row.failure_code ? str(row, "failure_code") : null,
    attempts: num(row, "attempts"),
    generation: num(row, "generation"),
  };
}
function checkedArtifact(ref: ArtifactRef): void {
  validateDigest(ref.sha256);
  if (
    !Number.isSafeInteger(ref.byteLength) ||
    ref.byteLength < 0 ||
    ref.byteLength > 25 * 1024 * 1024
  )
    throw new DurableError("INVALID_ARTIFACT_SIZE");
}
function failure(code: string): string {
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) throw new DurableError("INVALID_FAILURE_CODE");
  return code;
}
const RUN_SELECT =
  "SELECT r.*,s.attempts,s.generation FROM investigation_runs r JOIN run_steps s USING(run_id,workspace_id)";
const TRANSIENT = new Set([
  "TRANSIENT_DATABASE_FAILURE",
  "WORKER_INTERRUPTED",
  "WORKER_START_FAILURE",
  "WORKER_CRASH",
]);

/** Local trusted coordinator. Every public identity is scoped to the server-established workspace. */
export class Coordinator {
  readonly db: DurableDatabase;
  constructor(db: DurableDatabase) {
    this.db = db;
  }
  async workspace(): Promise<string> {
    return this.db.transaction(async (client) => {
      await client.query(
        "INSERT INTO local_workspaces(singleton) VALUES(true) ON CONFLICT(singleton) DO NOTHING",
      );
      const result = await client.query<Row>(
        "SELECT workspace_id FROM local_workspaces WHERE singleton=true",
      );
      const id = str(result.rows[0]!, "workspace_id");
      await client.query(
        "INSERT INTO budget_limits(workspace_id) VALUES($1) ON CONFLICT DO NOTHING",
        [id],
      );
      return id;
    });
  }
  async withArtifactLock<T>(work: () => Promise<T>): Promise<T> {
    const client = await this.db.artifactLockPool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext($1),2)", [this.db.schema]);
      return await work();
    } finally {
      await client
        .query("SELECT pg_advisory_unlock(hashtext($1),2)", [this.db.schema])
        .catch(() => undefined);
      client.release();
    }
  }
  private async lock(client: SqlClient, workspace: string): Promise<Row> {
    const result = await client.query<Row>(
      "SELECT * FROM budget_limits WHERE workspace_id=$1 FOR UPDATE",
      [workspace],
    );
    if (!result.rows[0]) throw new DurableError("WORKSPACE_NOT_FOUND");
    return result.rows[0];
  }
  private async lockedRun(client: SqlClient, workspace: string, id: string): Promise<Row> {
    const result = await client.query<Row>(
      `${RUN_SELECT} WHERE r.workspace_id=$1 AND r.run_id=$2 FOR UPDATE OF r,s`,
      [workspace, validateRunId(id)],
    );
    if (!result.rows[0]) throw new DurableError("RUN_NOT_FOUND");
    return result.rows[0];
  }
  private async state(
    client: SqlClient,
    row: Row,
    next: RunState,
    actor: AuditEvent["actor"],
    reason: string,
    digest: string | null = null,
    claim?: LeaseClaim,
  ): Promise<Row> {
    transition(row.state as RunState, next);
    const terminal = TERMINAL_STATES.includes(next);
    const updated = await client.query<Row>(
      `UPDATE investigation_runs SET state=$4,state_version=state_version+1,updated_at=clock_timestamp(),
      finished_at=CASE WHEN $5 THEN clock_timestamp() ELSE NULL END,
      cancel_requested_at=CASE WHEN $4 IN ('CANCEL_REQUESTED','CANCELLED') THEN coalesce(cancel_requested_at,clock_timestamp()) ELSE cancel_requested_at END,
      result_digest=$6,failure_code=CASE WHEN $4 IN ('STOPPED','INDETERMINATE') THEN $7 ELSE NULL END
      WHERE workspace_id=$1 AND run_id=$2 AND state_version=$3
      AND ($8::uuid IS NULL OR EXISTS(SELECT 1 FROM run_steps s WHERE s.run_id=$2 AND s.workspace_id=$1
        AND s.owner_token=$8::uuid AND s.generation=$9::integer AND s.attempt_id=$10::uuid AND s.lease_until>clock_timestamp())) RETURNING *`,
      [
        row.workspace_id,
        row.run_id,
        row.state_version,
        next,
        terminal,
        digest,
        failure(reason),
        claim?.ownerToken ?? null,
        claim?.generation ?? null,
        claim?.attemptId ?? null,
      ],
    );
    if (!updated.rows[0]) throw new DurableError(claim ? "STALE_LEASE" : "STALE_STATE");
    const result: Row = { ...updated.rows[0], attempts: row.attempts, generation: row.generation };
    await client.query(
      `INSERT INTO audit_events(workspace_id,run_id,sequence,previous_state,state,state_version,actor,reason,generation)
      VALUES($1,$2,$3,$4,$5,$3,$6,$7,$8)`,
      [
        row.workspace_id,
        row.run_id,
        result.state_version,
        row.state,
        next,
        actor,
        reason,
        row.generation,
      ],
    );
    return result;
  }
  private async blob(client: SqlClient, workspace: string, ref: ArtifactRef): Promise<void> {
    checkedArtifact(ref);
    await client.query(
      "INSERT INTO input_blobs(workspace_id,digest,byte_length) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [workspace, ref.sha256, ref.byteLength],
    );
    const result = await client.query<Row>(
      "SELECT byte_length,state FROM input_blobs WHERE workspace_id=$1 AND digest=$2",
      [workspace, ref.sha256],
    );
    if (
      !result.rows[0] ||
      num(result.rows[0], "byte_length") !== ref.byteLength ||
      result.rows[0].state !== "READY"
    )
      throw new DurableError("BLOB_METADATA_CONFLICT");
  }
  async submit(request: SubmitRequest): Promise<RunRecord> {
    const workspace = await this.workspace();
    verifyManifest(
      {
        workspaceId: workspace,
        manifest: request.manifest,
        inputSetDigest: request.inputSetDigest,
        requestKey: request.requestKey,
        engine: request.engine,
        policyId: request.policyId,
        policyHash: request.policyHash,
      },
      workspace,
    );
    validateExperimentSelections(request.manifest.map(({ path, role }) => ({ path, role })));
    const bound = checkedLimits(request.limits);
    const inputBytes = request.manifest.reduce((sum, item) => sum + item.byteLength, 0);
    if (inputBytes > 25 * 1024 * 1024) throw new DurableError("INPUT_SIZE_LIMIT");
    const token = request.idempotencyToken;
    if (token !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(token))
      throw new DurableError("INVALID_IDEMPOTENCY_TOKEN");
    return this.db.transaction(async (client) => {
      const quota = await this.lock(client, workspace);
      if (token) {
        const existingToken = await client.query<Row>(
          "SELECT request_key FROM idempotency_tokens WHERE workspace_id=$1 AND token=$2",
          [workspace, token],
        );
        if (existingToken.rowCount && existingToken.rows[0]!.request_key !== request.requestKey)
          throw new DurableError("IDEMPOTENCY_CONFLICT");
      }
      const existing = await client.query<Row>(
        `${RUN_SELECT} WHERE r.workspace_id=$1 AND r.request_key=$2`,
        [workspace, request.requestKey],
      );
      if (existing.rows[0]) {
        if (token)
          await client.query(
            "INSERT INTO idempotency_tokens(workspace_id,token,run_id,request_key) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [workspace, token, existing.rows[0].run_id, request.requestKey],
          );
        return run(existing.rows[0]);
      }
      const bytes = inputBytes + bound.outputBytes;
      if (
        num(quota, "run_count") >= num(quota, "max_runs") ||
        num(quota, "reserved_bytes") + num(quota, "consumed_bytes") + bytes >
          num(quota, "max_bytes") ||
        num(quota, "reserved_compute_ms") + num(quota, "consumed_compute_ms") + bound.computeMs >
          num(quota, "max_compute_ms")
      )
        throw new DurableError("BUDGET_EXHAUSTED");
      const inserted = await client.query<Row>(
        `INSERT INTO investigation_runs(workspace_id,request_key,input_set_digest,engine,policy_id,policy_hash,input_bytes,
        max_attempts,compute_ms,output_bytes,duration_ms,lease_ms,deadline) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp()+$11::integer*interval '1 millisecond') RETURNING *`,
        [
          workspace,
          request.requestKey,
          request.inputSetDigest,
          JSON.stringify(request.engine),
          request.policyId,
          request.policyHash,
          inputBytes,
          bound.maxAttempts,
          bound.computeMs,
          bound.outputBytes,
          bound.durationMs,
          bound.leaseMs,
        ],
      );
      const row = inserted.rows[0]!,
        id = str(row, "run_id");
      for (const [position, entry] of request.manifest.entries()) {
        await this.blob(client, workspace, entry);
        await client.query(
          "INSERT INTO run_inputs(workspace_id,run_id,position,role,path,digest,byte_length) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [workspace, id, position, entry.role, entry.path, entry.sha256, entry.byteLength],
        );
      }
      await client.query("INSERT INTO run_steps(workspace_id,run_id) VALUES($1,$2)", [
        workspace,
        id,
      ]);
      await client.query(
        "INSERT INTO budget_reservations(workspace_id,run_id,bytes_reserved,compute_reserved) VALUES($1,$2,$3,$4)",
        [workspace, id, bytes, bound.computeMs],
      );
      await client.query(
        "UPDATE budget_limits SET run_count=run_count+1,reserved_bytes=reserved_bytes+$2,reserved_compute_ms=reserved_compute_ms+$3 WHERE workspace_id=$1",
        [workspace, bytes, bound.computeMs],
      );
      await client.query(
        "INSERT INTO outbox_events(workspace_id,run_id,event_key) VALUES($1,$2,$3)",
        [workspace, id, `${id}:analysis:0`],
      );
      await client.query(
        "INSERT INTO audit_events(workspace_id,run_id,sequence,state,state_version,actor,reason) VALUES($1,$2,0,'QUEUED',0,'operator','SUBMITTED')",
        [workspace, id],
      );
      if (token)
        await client.query(
          "INSERT INTO idempotency_tokens(workspace_id,token,run_id,request_key) VALUES($1,$2,$3,$4)",
          [workspace, token, id, request.requestKey],
        );
      return run({ ...row, attempts: 0, generation: 0 });
    });
  }
  async dispatch(limit = 100): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new DurableError("INVALID_DELIVERY_LIMIT");
    const workspace = await this.workspace();
    return this.db.transaction(async (client) => {
      await this.lock(client, workspace);
      const events = await client.query<Row>(
        "SELECT * FROM outbox_events WHERE workspace_id=$1 AND delivered_at IS NULL AND ready_at<=clock_timestamp() ORDER BY ready_at,event_id FOR UPDATE SKIP LOCKED LIMIT $2",
        [workspace, limit],
      );
      for (const event of events.rows) {
        const receipt = await client.query(
          "INSERT INTO inbox_receipts(workspace_id,event_id,handler) VALUES($1,$2,'local-analysis-v1') ON CONFLICT DO NOTHING RETURNING event_id",
          [workspace, event.event_id],
        );
        if (receipt.rowCount)
          await client.query(
            "UPDATE run_steps s SET ready=true WHERE workspace_id=$1 AND run_id=$2 AND generation=$3 AND EXISTS(SELECT 1 FROM investigation_runs r WHERE r.run_id=s.run_id AND r.state='QUEUED')",
            [workspace, event.run_id, event.generation],
          );
        await client.query(
          "UPDATE outbox_events SET delivered_at=clock_timestamp(),delivery_attempts=delivery_attempts+1 WHERE event_id=$1",
          [event.event_id],
        );
      }
      return events.rowCount ?? 0;
    });
  }
  async claim(ownerToken = randomUUID()): Promise<LeaseClaim | null> {
    validateRunId(ownerToken);
    const workspace = await this.workspace();
    return this.db.transaction(async (client) => {
      const quota = await this.lock(client, workspace);
      if (num(quota, "active_workers") >= num(quota, "max_workers")) return null;
      const selected = await client.query<Row>(
        `${RUN_SELECT} WHERE r.workspace_id=$1 AND r.state='QUEUED' AND s.ready AND s.ready_at<=clock_timestamp()
        AND r.deadline>clock_timestamp() AND s.attempts<r.max_attempts ORDER BY s.ready_at,r.run_id FOR UPDATE OF r,s SKIP LOCKED LIMIT 1`,
        [workspace],
      );
      if (!selected.rows[0]) return null;
      const row = selected.rows[0],
        attemptId = randomUUID();
      const reservation = await client.query<Row>(
        "SELECT compute_reserved-compute_consumed AS remaining FROM budget_reservations WHERE run_id=$1 AND settled_at IS NULL",
        [row.run_id],
      );
      const remaining = num(reservation.rows[0]!, "remaining");
      if (remaining < 1) {
        await this.settle(client, row, 0, 0);
        await this.state(client, row, "INDETERMINATE", "coordinator", "COMPUTE_BUDGET_EXHAUSTED");
        return null;
      }
      const step = await client.query<Row>(
        `UPDATE run_steps SET ready=false,owner_token=$3,attempt_id=$4,generation=generation+1,attempts=attempts+1,
        claimed_at=clock_timestamp(),heartbeat_at=clock_timestamp(),lease_until=least(clock_timestamp()+$5*interval '1 millisecond',$6::timestamptz)
        WHERE workspace_id=$1 AND run_id=$2 RETURNING *`,
        [workspace, row.run_id, ownerToken, attemptId, row.lease_ms, row.deadline],
      );
      row.generation = step.rows[0]!.generation;
      row.attempts = step.rows[0]!.attempts;
      const updated = await this.state(client, row, "CLAIMED", "worker", "CLAIMED");
      await client.query(
        "UPDATE budget_limits SET active_workers=active_workers+1 WHERE workspace_id=$1",
        [workspace],
      );
      return {
        runId: str(row, "run_id"),
        workspaceId: workspace,
        ownerToken,
        generation: num(row, "generation"),
        attemptId,
        stateVersion: num(updated, "state_version"),
        expiresAt: date(step.rows[0]!.lease_until),
        limits: { ...limits(row), computeMs: remaining },
      };
    });
  }
  private async fenced(client: SqlClient, workspace: string, claim: LeaseClaim): Promise<Row> {
    if (claim.workspaceId !== workspace) throw new DurableError("WORKSPACE_MISMATCH");
    validateRunId(claim.ownerToken);
    validateRunId(claim.attemptId);
    const row = await this.lockedRun(client, workspace, claim.runId);
    const valid = await client.query<Row>(
      `SELECT 1 FROM run_steps WHERE workspace_id=$1 AND run_id=$2 AND owner_token=$3 AND generation=$4 AND attempt_id=$5
      AND lease_until>clock_timestamp()`,
      [workspace, claim.runId, claim.ownerToken, claim.generation, claim.attemptId],
    );
    if (
      !valid.rowCount ||
      !["CLAIMED", "ANALYZING", "CANCEL_REQUESTED"].includes(str(row, "state"))
    )
      throw new DurableError("STALE_LEASE");
    return row;
  }
  async start(claim: LeaseClaim): Promise<LeaseClaim> {
    const workspace = await this.workspace();
    return this.db.transaction(async (client) => {
      await this.lock(client, workspace);
      const row = await this.fenced(client, workspace, claim);
      if (row.state === "CANCEL_REQUESTED") throw new DurableError("CANCEL_REQUESTED");
      const updated = await this.state(
        client,
        row,
        "ANALYZING",
        "worker",
        "ANALYSIS_STARTED",
        null,
        claim,
      );
      return { ...claim, stateVersion: num(updated, "state_version") };
    });
  }
  async heartbeat(claim: LeaseClaim): Promise<boolean> {
    const workspace = await this.workspace();
    if (claim.workspaceId !== workspace) return false;
    return this.db.transaction(async (client) => {
      await this.lock(client, workspace);
      const row = await this.lockedRun(client, workspace, claim.runId);
      if (!["CLAIMED", "ANALYZING"].includes(str(row, "state"))) return false;
      const result = await client.query(
        `UPDATE run_steps SET heartbeat_at=clock_timestamp(),lease_until=least(clock_timestamp()+$6*interval '1 millisecond',$7::timestamptz)
        WHERE workspace_id=$1 AND run_id=$2 AND owner_token=$3 AND generation=$4 AND attempt_id=$5 AND lease_until>clock_timestamp() AND $7::timestamptz>clock_timestamp()`,
        [
          workspace,
          claim.runId,
          claim.ownerToken,
          claim.generation,
          claim.attemptId,
          row.lease_ms,
          row.deadline,
        ],
      );
      return result.rowCount === 1;
    });
  }
  private async settle(
    client: SqlClient,
    row: Row,
    outputBytes: number,
    computeMs: number,
    estimated = false,
    claim?: LeaseClaim,
  ): Promise<void> {
    if (
      !Number.isSafeInteger(computeMs) ||
      computeMs < 0 ||
      !Number.isSafeInteger(outputBytes) ||
      outputBytes < 0 ||
      outputBytes > num(row, "output_bytes")
    )
      throw new DurableError("INVALID_ACTUAL_USAGE");
    const reservation = await client.query<Row>(
      "SELECT * FROM budget_reservations WHERE workspace_id=$1 AND run_id=$2 AND settled_at IS NULL FOR UPDATE",
      [row.workspace_id, row.run_id],
    );
    if (!reservation.rows[0]) throw new DurableError("BUDGET_ALREADY_SETTLED");
    const previous = reservation.rows[0];
    const bytes = num(row, "input_bytes") + outputBytes;
    const compute = Math.min(
      num(previous, "compute_reserved"),
      num(previous, "compute_consumed") + computeMs,
    );
    await client.query(
      `UPDATE budget_reservations SET bytes_consumed=$3,compute_consumed=$4,bytes_released=bytes_reserved-$3,
      compute_measured_ms=compute_measured_ms+CASE WHEN $6 THEN 0 ELSE $5 END,
      compute_estimated_ms=compute_estimated_ms+CASE WHEN $6 THEN $5 ELSE 0 END,
      compute_released=compute_reserved-$4,settled_at=clock_timestamp() WHERE workspace_id=$1 AND run_id=$2`,
      [row.workspace_id, row.run_id, bytes, compute, computeMs, estimated],
    );
    await client.query(
      `UPDATE budget_limits SET reserved_bytes=reserved_bytes-$2,consumed_bytes=consumed_bytes+$3,
      reserved_compute_ms=reserved_compute_ms-$4,consumed_compute_ms=consumed_compute_ms+$5,
      active_workers=active_workers-CASE WHEN EXISTS(SELECT 1 FROM run_steps WHERE run_id=$6 AND owner_token IS NOT NULL) THEN 1 ELSE 0 END
      WHERE workspace_id=$1`,
      [
        row.workspace_id,
        previous.bytes_reserved,
        bytes,
        previous.compute_reserved,
        compute,
        row.run_id,
      ],
    );
    // This conditional write is the worker finalization linearization point. An expired
    // lease rolls the entire transaction back, including staged references and accounting.
    const released = await client.query(
      `UPDATE run_steps SET ready=false,owner_token=NULL,lease_until=NULL WHERE workspace_id=$1 AND run_id=$2
        AND ($3::uuid IS NULL OR (owner_token=$3::uuid AND generation=$4::integer AND attempt_id=$5::uuid AND lease_until>clock_timestamp()))`,
      [
        row.workspace_id,
        row.run_id,
        claim?.ownerToken ?? null,
        claim?.generation ?? null,
        claim?.attemptId ?? null,
      ],
    );
    if (released.rowCount !== 1) throw new DurableError("STALE_LEASE");
    await client.query(
      "UPDATE outbox_events SET delivered_at=coalesce(delivered_at,clock_timestamp()) WHERE workspace_id=$1 AND run_id=$2",
      [row.workspace_id, row.run_id],
    );
  }
  private async saveArtifact(
    client: SqlClient,
    row: Row,
    role: StoredArtifact["role"],
    ref: ArtifactRef,
  ): Promise<void> {
    await this.blob(client, str(row, "workspace_id"), ref);
    await client.query(
      "INSERT INTO run_artifacts(workspace_id,run_id,role,digest,byte_length) VALUES($1,$2,$3,$4,$5)",
      [row.workspace_id, row.run_id, role, ref.sha256, ref.byteLength],
    );
  }
  async complete(
    claim: LeaseClaim,
    value: {
      resultDigest: string;
      jsonArtifact: ArtifactRef;
      markdownArtifact: ArtifactRef;
      computeMs: number;
    },
  ): Promise<RunRecord> {
    validateDigest(value.resultDigest);
    checkedArtifact(value.jsonArtifact);
    checkedArtifact(value.markdownArtifact);
    const workspace = await this.workspace();
    return this.db.transaction(async (client) => {
      await this.lock(client, workspace);
      const row = await this.fenced(client, workspace, claim);
      if (row.state === "CANCEL_REQUESTED") {
        await this.settle(client, row, 0, value.computeMs, false, claim);
        return run(await this.state(client, row, "CANCELLED", "worker", "CANCELLATION_OBSERVED"));
      }
      if (row.state !== "ANALYZING") throw new DurableError("INVALID_TRANSITION");
      const budget = await client.query<Row>(
        "SELECT compute_reserved-compute_consumed AS remaining FROM budget_reservations WHERE run_id=$1",
        [row.run_id],
      );
      if (value.computeMs > num(budget.rows[0]!, "remaining"))
        throw new DurableError("COMPUTE_BUDGET_EXCEEDED");
      await this.saveArtifact(client, row, "result", value.jsonArtifact);
      await this.saveArtifact(client, row, "report", value.markdownArtifact);
      await this.settle(
        client,
        row,
        value.jsonArtifact.byteLength + value.markdownArtifact.byteLength,
        value.computeMs,
        false,
        claim,
      );
      return run(
        await this.state(
          client,
          row,
          "ANALYSIS_COMPLETE",
          "worker",
          "RESULT_VERIFIED",
          value.resultDigest,
        ),
      );
    });
  }
  async stop(
    claim: LeaseClaim,
    value: {
      code: string;
      indeterminate?: boolean;
      diagnosticArtifact?: ArtifactRef;
      computeMs?: number;
    },
  ): Promise<RunRecord> {
    failure(value.code);
    const workspace = await this.workspace();
    return this.db.transaction(async (client) => {
      await this.lock(client, workspace);
      const row = await this.fenced(client, workspace, claim);
      const cancelled = row.state === "CANCEL_REQUESTED";
      if (value.diagnosticArtifact && !cancelled)
        await this.saveArtifact(client, row, "diagnostic", value.diagnosticArtifact);
      await this.settle(
        client,
        row,
        cancelled ? 0 : (value.diagnosticArtifact?.byteLength ?? 0),
        value.computeMs ?? 0,
        false,
        claim,
      );
      return run(
        await this.state(
          client,
          row,
          cancelled ? "CANCELLED" : value.indeterminate ? "INDETERMINATE" : "STOPPED",
          "worker",
          cancelled ? "CANCELLATION_OBSERVED" : value.code,
        ),
      );
    });
  }
  private async requeue(
    client: SqlClient,
    row: Row,
    code: string,
    computeMs: number,
    estimated = false,
    claim?: LeaseClaim,
  ): Promise<Row> {
    const expiry = await client.query<Row>(
      "SELECT deadline<=clock_timestamp() AS expired FROM investigation_runs WHERE run_id=$1",
      [row.run_id],
    );
    const budget = await client.query<Row>(
      "SELECT compute_reserved-compute_consumed AS remaining FROM budget_reservations WHERE run_id=$1",
      [row.run_id],
    );
    const exhausted = computeMs >= num(budget.rows[0]!, "remaining");
    if (num(row, "attempts") >= num(row, "max_attempts") || expiry.rows[0]!.expired || exhausted) {
      await this.settle(client, row, 0, computeMs, estimated, claim);
      return this.state(
        client,
        row,
        "INDETERMINATE",
        "coordinator",
        expiry.rows[0]!.expired
          ? "RUN_DEADLINE"
          : exhausted
            ? "COMPUTE_BUDGET_EXHAUSTED"
            : "RETRY_EXHAUSTED",
      );
    }
    const delay = Math.min(1000, 50 * 2 ** num(row, "attempts")) + randomInt(0, 51);
    await client.query(
      `UPDATE budget_reservations SET compute_consumed=compute_consumed+$3,
      compute_measured_ms=compute_measured_ms+CASE WHEN $4 THEN 0 ELSE $3 END,
      compute_estimated_ms=compute_estimated_ms+CASE WHEN $4 THEN $3 ELSE 0 END
      WHERE workspace_id=$1 AND run_id=$2 AND settled_at IS NULL`,
      [row.workspace_id, row.run_id, computeMs, estimated],
    );
    await client.query(
      "UPDATE budget_limits SET active_workers=active_workers-1 WHERE workspace_id=$1",
      [row.workspace_id],
    );
    const released = await client.query(
      `UPDATE run_steps SET owner_token=NULL,lease_until=NULL,ready=false,ready_at=clock_timestamp()+$3*interval '1 millisecond',failure_class=$4 WHERE workspace_id=$1 AND run_id=$2
        AND ($5::uuid IS NULL OR (owner_token=$5::uuid AND generation=$6::integer AND attempt_id=$7::uuid AND lease_until>clock_timestamp()))`,
      [
        row.workspace_id,
        row.run_id,
        delay,
        code,
        claim?.ownerToken ?? null,
        claim?.generation ?? null,
        claim?.attemptId ?? null,
      ],
    );
    if (released.rowCount !== 1) throw new DurableError("STALE_LEASE");
    await client.query(
      "INSERT INTO outbox_events(workspace_id,run_id,event_key,generation,ready_at) VALUES($1,$2,$3,$4,clock_timestamp()+$5*interval '1 millisecond') ON CONFLICT(event_key) DO NOTHING",
      [
        row.workspace_id,
        row.run_id,
        `${str(row, "run_id")}:analysis:${num(row, "generation")}`,
        row.generation,
        delay,
      ],
    );
    return this.state(client, row, "QUEUED", "coordinator", code);
  }
  async retry(claim: LeaseClaim, code: string, computeMs = 0): Promise<RunRecord> {
    if (!TRANSIENT.has(code) || !Number.isSafeInteger(computeMs) || computeMs < 0)
      throw new DurableError("NONRETRYABLE_FAILURE");
    const workspace = await this.workspace();
    return this.db.transaction(async (client) => {
      await this.lock(client, workspace);
      const row = await this.fenced(client, workspace, claim);
      if (row.state === "CANCEL_REQUESTED") {
        await this.settle(client, row, 0, computeMs, false, claim);
        return run(await this.state(client, row, "CANCELLED", "worker", "CANCELLATION_OBSERVED"));
      }
      return run(await this.requeue(client, row, code, computeMs, false, claim));
    });
  }
  async cancel(id: string): Promise<RunRecord> {
    const workspace = await this.workspace();
    return this.db.transaction(async (client) => {
      await this.lock(client, workspace);
      const row = await this.lockedRun(client, workspace, id);
      if (TERMINAL_STATES.includes(row.state as RunState) || row.state === "CANCEL_REQUESTED")
        return run(row);
      if (row.state === "QUEUED") {
        await this.settle(client, row, 0, 0);
        return run(
          await this.state(client, row, "CANCELLED", "operator", "CANCELLED_BEFORE_CLAIM"),
        );
      }
      return run(
        await this.state(client, row, "CANCEL_REQUESTED", "operator", "CANCELLATION_REQUESTED"),
      );
    });
  }
  async recover(): Promise<number> {
    const workspace = await this.workspace();
    return this.db.transaction(async (client) => {
      await this.lock(client, workspace);
      const rows = await client.query<Row>(
        `${RUN_SELECT} WHERE r.workspace_id=$1 AND
        ((s.owner_token IS NOT NULL AND s.lease_until<=clock_timestamp()) OR (r.state='QUEUED' AND r.deadline<=clock_timestamp()))
        ORDER BY r.run_id FOR UPDATE OF r,s SKIP LOCKED`,
        [workspace],
      );
      for (const row of rows.rows) {
        if (row.state === "CANCEL_REQUESTED") {
          const elapsed = await client.query<Row>(
            "SELECT ceil(extract(epoch FROM clock_timestamp()-claimed_at)*1000)::bigint AS elapsed FROM run_steps WHERE run_id=$1",
            [row.run_id],
          );
          await this.settle(
            client,
            row,
            0,
            Math.min(num(elapsed.rows[0]!, "elapsed"), num(row, "compute_ms")),
            true,
          );
          await this.state(client, row, "CANCELLED", "coordinator", "CANCELLATION_RECOVERED");
        } else if (row.state === "QUEUED") {
          await this.settle(client, row, 0, 0);
          await this.state(client, row, "INDETERMINATE", "coordinator", "RUN_DEADLINE");
        } else {
          const elapsed = await client.query<Row>(
            "SELECT ceil(extract(epoch FROM clock_timestamp()-claimed_at)*1000)::bigint AS elapsed FROM run_steps WHERE run_id=$1",
            [row.run_id],
          );
          await this.requeue(
            client,
            row,
            "WORKER_INTERRUPTED",
            Math.min(num(elapsed.rows[0]!, "elapsed"), num(row, "compute_ms")),
            true,
          );
        }
      }
      return rows.rowCount ?? 0;
    });
  }
  async get(id: string): Promise<RunRecord> {
    const workspace = await this.workspace();
    const result = await this.db.query<Row>(
      `${RUN_SELECT} WHERE r.workspace_id=$1 AND r.run_id=$2`,
      [workspace, validateRunId(id)],
    );
    if (!result.rows[0]) throw new DurableError("RUN_NOT_FOUND");
    return run(result.rows[0]);
  }
  async list(): Promise<RunRecord[]> {
    const workspace = await this.workspace();
    const result = await this.db.query<Row>(
      `${RUN_SELECT} WHERE r.workspace_id=$1 ORDER BY r.created_at,r.run_id LIMIT 1000`,
      [workspace],
    );
    return result.rows.map(run);
  }
  async inputs(id: string): Promise<ManifestEntry[]> {
    const found = await this.get(id);
    const result = await this.db.query<Row>(
      "SELECT * FROM run_inputs WHERE workspace_id=$1 AND run_id=$2 ORDER BY position",
      [found.workspaceId, found.runId],
    );
    return result.rows.map((row) => ({
      path: str(row, "path"),
      role: row.role as ManifestEntry["role"],
      sha256: str(row, "digest"),
      byteLength: num(row, "byte_length"),
    }));
  }
  async artifacts(id: string): Promise<StoredArtifact[]> {
    const found = await this.get(id);
    const result = await this.db.query<Row>(
      "SELECT * FROM run_artifacts WHERE workspace_id=$1 AND run_id=$2 ORDER BY role",
      [found.workspaceId, found.runId],
    );
    return result.rows.map((row) => ({
      role: row.role as StoredArtifact["role"],
      sha256: str(row, "digest"),
      byteLength: num(row, "byte_length"),
    }));
  }
  async events(id: string): Promise<AuditEvent[]> {
    const found = await this.get(id);
    const result = await this.db.query<Row>(
      "SELECT * FROM audit_events WHERE workspace_id=$1 AND run_id=$2 ORDER BY sequence",
      [found.workspaceId, found.runId],
    );
    return result.rows.map((row) => ({
      sequence: num(row, "sequence"),
      previousState: row.previous_state as RunState | null,
      state: row.state as RunState,
      stateVersion: num(row, "state_version"),
      actor: row.actor as AuditEvent["actor"],
      reason: str(row, "reason"),
      at: date(row.at),
      generation: row.generation === null ? null : num(row, "generation"),
    }));
  }
  async budgets(): Promise<BudgetRecord> {
    const workspace = await this.workspace();
    const result = await this.db.query<Row>("SELECT * FROM budget_limits WHERE workspace_id=$1", [
      workspace,
    ]);
    const row = result.rows[0]!;
    return {
      maxRuns: num(row, "max_runs"),
      maxWorkers: num(row, "max_workers"),
      maxBytes: num(row, "max_bytes"),
      maxComputeMs: num(row, "max_compute_ms"),
      runCount: num(row, "run_count"),
      activeWorkers: num(row, "active_workers"),
      reservedBytes: num(row, "reserved_bytes"),
      consumedBytes: num(row, "consumed_bytes"),
      reservedComputeMs: num(row, "reserved_compute_ms"),
      consumedComputeMs: num(row, "consumed_compute_ms"),
    };
  }
  async blobInventory(): Promise<
    (ArtifactRef & {
      state: "READY" | "DELETE_PENDING" | "DELETED";
      referenced: boolean;
      deleteAfter: string;
    })[]
  > {
    const workspace = await this.workspace();
    const result = await this.db.query<Row>(
      `SELECT b.*,EXISTS(SELECT 1 FROM run_inputs i WHERE i.workspace_id=b.workspace_id AND i.digest=b.digest)
      OR EXISTS(SELECT 1 FROM run_artifacts a WHERE a.workspace_id=b.workspace_id AND a.digest=b.digest) AS referenced FROM input_blobs b WHERE workspace_id=$1 ORDER BY digest`,
      [workspace],
    );
    return result.rows.map((row) => ({
      sha256: str(row, "digest"),
      byteLength: num(row, "byte_length"),
      state: row.state as "READY" | "DELETE_PENDING" | "DELETED",
      referenced: row.referenced === true,
      deleteAfter: date(row.delete_after),
    }));
  }
  async registerOrphan(ref: ArtifactRef): Promise<void> {
    checkedArtifact(ref);
    const workspace = await this.workspace();
    await this.db.transaction(async (client) => {
      await this.lock(client, workspace);
      const inserted = await client.query(
        "INSERT INTO input_blobs(workspace_id,digest,byte_length) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING digest",
        [workspace, ref.sha256, ref.byteLength],
      );
      if (inserted.rowCount)
        await client.query(
          "INSERT INTO storage_events(workspace_id,digest,reason) VALUES($1,$2,'ORPHAN_REGISTERED')",
          [workspace, ref.sha256],
        );
    });
  }
  async beginBlobDeletion(ref: ArtifactRef): Promise<boolean> {
    checkedArtifact(ref);
    const workspace = await this.workspace();
    return this.db.transaction(async (client) => {
      await this.lock(client, workspace);
      const pending = await client.query(
        `SELECT 1 FROM input_blobs b WHERE workspace_id=$1 AND digest=$2 AND byte_length=$3 AND state='DELETE_PENDING'
        AND NOT EXISTS(SELECT 1 FROM run_inputs i WHERE i.workspace_id=b.workspace_id AND i.digest=b.digest)
        AND NOT EXISTS(SELECT 1 FROM run_artifacts a WHERE a.workspace_id=b.workspace_id AND a.digest=b.digest)`,
        [workspace, ref.sha256, ref.byteLength],
      );
      if (pending.rowCount) return true;
      const updated = await client.query(
        `UPDATE input_blobs b SET state='DELETE_PENDING' WHERE workspace_id=$1 AND digest=$2 AND byte_length=$3 AND state='READY' AND delete_after<=clock_timestamp()
        AND NOT EXISTS(SELECT 1 FROM run_inputs i WHERE i.workspace_id=b.workspace_id AND i.digest=b.digest)
        AND NOT EXISTS(SELECT 1 FROM run_artifacts a WHERE a.workspace_id=b.workspace_id AND a.digest=b.digest) RETURNING digest`,
        [workspace, ref.sha256, ref.byteLength],
      );
      if (updated.rowCount)
        await client.query(
          "INSERT INTO storage_events(workspace_id,digest,reason) VALUES($1,$2,'DELETE_PENDING')",
          [workspace, ref.sha256],
        );
      return updated.rowCount === 1;
    });
  }
  async finishBlobDeletion(ref: ArtifactRef): Promise<void> {
    checkedArtifact(ref);
    const workspace = await this.workspace();
    await this.db.transaction(async (client) => {
      await this.lock(client, workspace);
      const updated = await client.query(
        "UPDATE input_blobs SET state='DELETED',deleted_at=clock_timestamp() WHERE workspace_id=$1 AND digest=$2 AND byte_length=$3 AND state='DELETE_PENDING' RETURNING digest",
        [workspace, ref.sha256, ref.byteLength],
      );
      if (!updated.rowCount) throw new DurableError("INVALID_DELETION_STATE");
      await client.query(
        "INSERT INTO storage_events(workspace_id,digest,reason) VALUES($1,$2,'DELETED')",
        [workspace, ref.sha256],
      );
    });
  }
}
