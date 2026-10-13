import { resolve, sep } from "node:path";
import { FIXTURE_SELECTIONS } from "../../packages/analysis/src/fixture.ts";
import { runAnalysis } from "../../packages/durable/src/analysis-adapter.ts";
import { ArtifactStore } from "../../packages/durable/src/artifacts.ts";
import { loadConnection } from "../../packages/durable/src/config.ts";
import { validateRunId } from "../../packages/durable/src/contracts.ts";
import { Coordinator } from "../../packages/durable/src/coordinator.ts";
import { createDatabase } from "../../packages/durable/src/db/client.ts";
import { InvestigationService } from "../../packages/durable/src/service.ts";

// Test-owned IPC pause points. None is imported by the production CLI or configurable worker.
function localTestPath(value: string | undefined): string {
  if (!value) throw new Error("TEST_PATH_REQUIRED");
  const path = resolve(value);
  if (!path.startsWith(resolve(".local/durable-tests") + sep)) throw new Error("TEST_PATH_DENIED");
  return path;
}
async function send(value: Record<string, unknown>): Promise<void> {
  if (!process.send) throw new Error("TEST_IPC_REQUIRED");
  await new Promise<void>((done, reject) =>
    process.send!(value, undefined, undefined, (error) => (error ? reject(error) : done())),
  );
}
async function pause(): Promise<never> {
  return new Promise(() => {
    setInterval(() => {}, 1_000);
  });
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (!["commit", "analysis", "stage", "drain", "readback"].includes(mode ?? ""))
    throw new Error("TEST_MODE_REQUIRED");
  const schema = process.env.DRIFT_TEST_SCHEMA;
  if (!schema || !/^test_[a-f0-9]{32}$/.test(schema)) throw new Error("TEST_SCHEMA_REQUIRED");
  const db = createDatabase(await loadConnection(), { schema });
  const coordinator = new Coordinator(db);
  const store = new ArtifactStore(localTestPath(process.env.DRIFT_TEST_STORE));
  await store.initialize();
  const service = new InvestigationService(coordinator, store);
  try {
    if (mode === "commit") {
      const run = await service.submit(
        localTestPath(process.env.DRIFT_TEST_INPUT_ROOT),
        FIXTURE_SELECTIONS,
      );
      await send({
        point: "committed",
        runId: run.runId,
        requestKey: run.requestKey,
        at: new Date().toISOString(),
      });
      await pause();
    } else if (mode === "drain") {
      await send({ point: "drained", processed: await service.workUntilIdle() });
    } else if (mode === "readback") {
      const runId = validateRunId(process.argv[3]);
      const { run, result } = await service.verify(runId);
      const events = await coordinator.events(runId);
      await send({
        point: "verified",
        runId,
        state: run.state,
        stateVersion: run.stateVersion,
        attempts: run.attempts,
        generation: run.generation,
        inputSetDigest: run.inputSetDigest,
        runDigest: result.runDigest,
        events,
        budget: await coordinator.budgets(),
      });
    } else {
      await coordinator.dispatch();
      const claimed = await coordinator.claim();
      if (!claimed) throw new Error("TEST_CLAIM_REQUIRED");
      const active = await coordinator.start(claimed);
      const captured = await service.captured(active.runId);
      const began = performance.now();
      const analyzing = runAnalysis(captured);
      if (mode === "analysis") {
        await send({
          point: "analysis-started",
          runId: active.runId,
          generation: active.generation,
          attemptId: active.attemptId,
          at: new Date().toISOString(),
        });
        await analyzing;
        await send({ point: "analysis-finished" });
        await pause();
      } else {
        let heartbeat: Promise<void> | undefined;
        const timer = setInterval(
          () => {
            if (!heartbeat)
              heartbeat = coordinator
                .heartbeat(active)
                .then((alive) => {
                  if (!alive) throw new Error("TEST_LEASE_EXPIRED");
                })
                .finally(() => {
                  heartbeat = undefined;
                });
          },
          Math.max(10, Math.floor(active.limits.leaseMs / 4)),
        );
        try {
          const result = await analyzing;
          const staged = await coordinator.withArtifactLock(() =>
            service.stage(active, result, Math.ceil(performance.now() - began)),
          );
          await send({
            point: "staged",
            runId: active.runId,
            generation: active.generation,
            resultDigest: staged.result.runDigest,
            jsonArtifact: staged.jsonArtifact,
            markdownArtifact: staged.markdownArtifact,
            at: new Date().toISOString(),
          });
        } finally {
          clearInterval(timer);
          await heartbeat;
        }
        // No complete() call: parent terminates this real process at the post-stage crash window.
        await pause();
      }
    }
  } finally {
    await db.close();
  }
}

await main().catch(async () => {
  await send({ point: "failure", error: "TEST_PROCESS_FAILED" }).catch(() => undefined);
  process.exitCode = 1;
});
