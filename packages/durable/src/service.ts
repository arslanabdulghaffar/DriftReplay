import {
  captureLocalInputs,
  type CapturedInput,
  type LocalSelection,
} from "../../analysis/src/ingestion.ts";
import { canonical } from "../../analysis/src/identity.ts";
import { AnalysisResultSchema, type AnalysisResult } from "../../analysis/src/model.ts";
import { renderMarkdown } from "../../analysis/src/report.ts";
import { runAnalysis, verifyStoredAnalysis } from "./analysis-adapter.ts";
import { ArtifactError, ArtifactStore, type ArtifactRef } from "./artifacts.ts";
import { DurableError, type LeaseClaim, type RunLimits, type RunRecord } from "./contracts.ts";
import { Coordinator } from "./coordinator.ts";
import { databaseError } from "./db/client.ts";
import { makeManifest, verifyManifest } from "./identity.ts";

export interface StagedResult {
  result: AnalysisResult;
  jsonArtifact: ArtifactRef;
  markdownArtifact: ArtifactRef;
  computeMs: number;
}

/** Trusted local composition boundary: SQL never receives caller-asserted evidence directly. */
export class InvestigationService {
  readonly coordinator: Coordinator;
  readonly store: ArtifactStore;
  constructor(coordinator: Coordinator, store: ArtifactStore) {
    this.coordinator = coordinator;
    this.store = store;
  }

  async submit(
    root: string,
    selections: readonly LocalSelection[],
    options: {
      idempotencyToken?: string;
      limits?: Partial<RunLimits>;
    } = {},
  ): Promise<RunRecord> {
    const captured = await captureLocalInputs(root, selections);
    const workspaceId = await this.coordinator.workspace();
    const manifest = makeManifest(workspaceId, captured);
    return this.coordinator.withArtifactLock(async () => {
      for (const input of captured) await this.store.put(input.bytes);
      const { workspaceId: _workspaceId, ...request } = manifest;
      void _workspaceId;
      return this.coordinator.submit({ ...request, ...options });
    });
  }

  async captured(runId: string): Promise<CapturedInput[]> {
    const run = await this.coordinator.get(runId);
    const manifest = await this.coordinator.inputs(runId);
    const bound = verifyManifest(
      {
        workspaceId: run.workspaceId,
        manifest,
        engine: run.engine,
        policyId: run.policyId,
        policyHash: run.policyHash,
        inputSetDigest: run.inputSetDigest,
        requestKey: run.requestKey,
      },
      await this.coordinator.workspace(),
    );
    const captured: CapturedInput[] = [];
    for (const input of bound.manifest) {
      captured.push({ path: input.path, role: input.role, bytes: await this.store.read(input) });
    }
    if (makeManifest(run.workspaceId, captured).requestKey !== run.requestKey)
      throw new DurableError("INPUT_IDENTITY_MISMATCH");
    return captured;
  }

  /** Stage verified evidence. Caller must keep the retention lock through finalization. */
  async stage(
    claim: LeaseClaim,
    result: AnalysisResult,
    computeMs: number,
    signal?: AbortSignal,
  ): Promise<StagedResult> {
    const remaining = Math.floor(Math.min(30_000, claim.limits.computeMs - computeMs));
    if (remaining < 1) throw new DurableError("COMPUTE_BUDGET_EXCEEDED");
    const parsed = AnalysisResultSchema.parse(result);
    if (
      parsed.state !== "ANALYSIS_ONLY" ||
      !(await verifyStoredAnalysis(parsed, await this.captured(claim.runId), signal, {
        deadlineMs: remaining,
      }))
    )
      throw new DurableError("RESULT_VERIFICATION_FAILED");
    const json = new TextEncoder().encode(canonical(parsed));
    const markdown = new TextEncoder().encode(renderMarkdown(parsed));
    if (json.byteLength + markdown.byteLength > claim.limits.outputBytes)
      throw new DurableError("OUTPUT_BUDGET_EXCEEDED");
    return {
      result: parsed,
      jsonArtifact: await this.store.put(json),
      markdownArtifact: await this.store.put(markdown),
      computeMs,
    };
  }

  async verify(runId: string): Promise<{ run: RunRecord; result: AnalysisResult }> {
    return this.coordinator.withArtifactLock(async () => {
      const run = await this.coordinator.get(runId);
      if (run.state !== "ANALYSIS_COMPLETE") throw new DurableError("RUN_NOT_COMPLETE");
      const artifacts = await this.coordinator.artifacts(runId);
      const machine = artifacts.find((item) => item.role === "result");
      const report = artifacts.find((item) => item.role === "report");
      if (!machine || !report) throw new DurableError("RESULT_ARTIFACT_MISSING");
      const bytes = await this.store.read(machine);
      const result = AnalysisResultSchema.parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
      const reportBytes = await this.store.read(report);
      if (
        canonical(result) !== new TextDecoder().decode(bytes) ||
        result.runDigest !== run.resultDigest ||
        new TextDecoder().decode(reportBytes) !== renderMarkdown(result) ||
        !(await verifyStoredAnalysis(result, await this.captured(runId)))
      )
        throw new DurableError("RESULT_VERIFICATION_FAILED");
      return { run, result };
    });
  }

  async execute(claim: LeaseClaim): Promise<void> {
    let active: LeaseClaim;
    try {
      active = await this.coordinator.start(claim);
    } catch (error) {
      if (databaseError(error).code === "CANCEL_REQUESTED") {
        await this.coordinator.stop(claim, { code: "CANCELLATION_OBSERVED" });
        return;
      }
      if (databaseError(error).code !== "STALE_LEASE") throw error;
      return;
    }
    const abort = new AbortController();
    const began = performance.now();
    const deadline = setTimeout(
      () => abort.abort(),
      Math.min(active.limits.computeMs, active.limits.durationMs),
    );
    let observing: Promise<void> | undefined;
    let observationFailure: DurableError | undefined;
    const timer = setInterval(
      () => {
        if (observing) return;
        observing = this.coordinator
          .heartbeat(active)
          .then((alive) => {
            if (!alive) abort.abort();
          })
          .catch((error: unknown) => {
            observationFailure = databaseError(error);
            abort.abort();
          })
          .finally(() => {
            observing = undefined;
          });
      },
      Math.max(10, Math.floor(active.limits.leaseMs / 4)),
    );
    try {
      const result = await runAnalysis(await this.captured(active.runId), abort.signal, {
        deadlineMs: Math.min(30_000, active.limits.computeMs, active.limits.durationMs),
      });
      if (observationFailure) throw observationFailure;
      await this.coordinator.withArtifactLock(async () => {
        if (result.state === "ANALYSIS_ONLY") {
          const staged = await this.stage(
            active,
            result,
            Math.ceil(performance.now() - began),
            abort.signal,
          );
          if (abort.signal.aborted || performance.now() - began > active.limits.computeMs)
            throw new DurableError("COMPUTE_BUDGET_EXCEEDED");
          await this.coordinator.complete(active, {
            resultDigest: staged.result.runDigest,
            jsonArtifact: staged.jsonArtifact,
            markdownArtifact: staged.markdownArtifact,
            computeMs: Math.ceil(performance.now() - began),
          });
        } else {
          const diagnostic = await this.store.put(new TextEncoder().encode(canonical(result)));
          await this.coordinator.stop(active, {
            code: result.state === "STOPPED" ? "ANALYSIS_STOPPED" : "ENGINE_INDETERMINATE",
            indeterminate: result.state === "INDETERMINATE",
            diagnosticArtifact: diagnostic,
            computeMs: Math.ceil(performance.now() - began),
          });
        }
      });
    } catch (error) {
      const safe =
        observationFailure && !(error instanceof ArtifactError)
          ? observationFailure
          : databaseError(error);
      if (safe.code === "STALE_LEASE") return;
      if (safe.code === "TRANSIENT_DATABASE_FAILURE") {
        // If the DB is still unavailable, persisted lease recovery owns settlement.
        await this.coordinator
          .retry(active, "TRANSIENT_DATABASE_FAILURE", Math.ceil(performance.now() - began))
          .catch(() => undefined);
        return;
      }
      await this.coordinator
        .stop(active, {
          code:
            error instanceof ArtifactError
              ? "ARTIFACT_INTEGRITY_FAILURE"
              : error instanceof DurableError
                ? error.code
                : "INVESTIGATION_FAILURE",
          indeterminate: !(error instanceof ArtifactError || error instanceof DurableError),
          computeMs: Math.ceil(performance.now() - began),
        })
        .catch((stopError: unknown) => {
          const code = databaseError(stopError).code;
          if (code !== "STALE_LEASE" && code !== "TRANSIENT_DATABASE_FAILURE") throw stopError;
        });
    } finally {
      clearInterval(timer);
      clearTimeout(deadline);
      await observing;
    }
  }

  async workUntilIdle(): Promise<number> {
    let processed = 0;
    for (;;) {
      await this.coordinator.recover();
      await this.coordinator.dispatch();
      const claim = await this.coordinator.claim();
      if (!claim) return processed;
      await this.execute(claim);
      processed++;
    }
  }

  async garbageCollect(apply = false): Promise<{
    dryRun: boolean;
    referenced: number;
    orphans: number;
    pending: number;
    deleted: number;
  }> {
    return this.coordinator.withArtifactLock(async () => {
      const disk = await this.store.list();
      let records = await this.coordinator.blobInventory();
      const known = new Set(records.map((entry) => entry.sha256));
      const orphans = disk.filter((entry) => !known.has(entry.sha256));
      if (apply) {
        for (const entry of orphans) await this.coordinator.registerOrphan(entry);
        records = await this.coordinator.blobInventory();
      }
      let deleted = 0;
      for (const entry of records) {
        if (!apply || entry.referenced || entry.state === "DELETED") continue;
        if (!(await this.coordinator.beginBlobDeletion(entry))) continue;
        if (disk.some((blob) => blob.sha256 === entry.sha256)) await this.store.remove(entry);
        await this.coordinator.finishBlobDeletion(entry);
        deleted++;
      }
      if (apply) records = await this.coordinator.blobInventory();
      return {
        dryRun: !apply,
        referenced: records.filter((entry) => entry.referenced).length,
        orphans: orphans.length,
        pending: records.filter((entry) => entry.state === "DELETE_PENDING").length,
        deleted,
      };
    });
  }
}
