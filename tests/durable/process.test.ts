import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, evidence, type Harness } from "./helpers.ts";

interface Message {
  point: string;
  [key: string]: unknown;
}
interface Exit {
  code: number | null;
  signal: NodeJS.Signals | null;
}
interface TestChild {
  child: ChildProcess;
  messages: Message[];
  exited: Promise<Exit>;
  waitFor(point: string): Promise<Message>;
}
const children: TestChild[] = [];
const harnesses: Harness[] = [];
const expectedDigest = "1926cf8adad96f725e1ff13196e25913e9adaf77bae9c9d5747381ba1d4c127c";

async function harness(): Promise<Harness> {
  const result = await createHarness();
  harnesses.push(result);
  return result;
}
function launch(h: Harness, mode: string, runId?: string): TestChild {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./process-harness.ts", import.meta.url)),
      mode,
      ...(runId ? [runId] : []),
    ],
    {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        DRIFT_TEST_SCHEMA: h.schema,
        DRIFT_TEST_STORE: h.store.root,
        DRIFT_TEST_INPUT_ROOT: h.inputRoot,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  const messages: Message[] = [];
  let outputBytes = 0;
  for (const stream of [child.stdout, child.stderr])
    stream?.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > 65_536) child.kill("SIGKILL");
    });
  child.on("message", (value: unknown) => {
    if (value && typeof value === "object" && "point" in value && typeof value.point === "string")
      messages.push(value as Message);
  });
  const exited = new Promise<Exit>((done, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => done({ code, signal }));
  });
  const result: TestChild = {
    child,
    messages,
    exited,
    waitFor(point) {
      return new Promise((done, reject) => {
        const existing = messages.find((item) => item.point === point);
        if (existing) {
          done(existing);
          return;
        }
        const timer = setTimeout(() => {
          clean();
          reject(new Error(`TEST_IPC_TIMEOUT_${point}`));
        }, 15_000);
        const listener = (value: unknown) => {
          if (!value || typeof value !== "object" || !("point" in value)) return;
          if (value.point === "failure") {
            clean();
            reject(new Error("TEST_CHILD_FAILURE"));
          } else if (value.point === point) {
            clean();
            done(value as Message);
          }
        };
        const closed = () => {
          clean();
          reject(new Error(`TEST_CHILD_EARLY_EXIT_${point}`));
        };
        const clean = () => {
          clearTimeout(timer);
          child.off("message", listener);
          child.off("close", closed);
        };
        child.on("message", listener);
        child.once("close", closed);
      });
    },
  };
  children.push(result);
  return result;
}
async function kill(child: TestChild): Promise<Exit> {
  expect(child.child.pid).toBeGreaterThan(0);
  expect(child.child.kill("SIGKILL")).toBe(true);
  const exit = await child.exited;
  expect(exit.code === 0 && exit.signal === null).toBe(false);
  return exit;
}
async function verifyRestart(h: Harness, runId: string): Promise<Message> {
  const child = launch(h, "readback", runId);
  const readback = await child.waitFor("verified");
  expect(await child.exited).toEqual({ code: 0, signal: null });
  expect(readback.state).toBe("ANALYSIS_COMPLETE");
  expect(readback.runDigest).toBe(expectedDigest);
  return readback;
}
async function recoverAndDrain(h: Harness): Promise<void> {
  await h.db.query("SELECT pg_sleep(1.2)");
  expect(await h.coordinator.recover()).toBe(1);
  await h.db.query("SELECT pg_sleep(0.25)");
  const restarted = launch(h, "drain");
  expect((await restarted.waitFor("drained")).processed).toBe(1);
  expect(await restarted.exited).toEqual({ code: 0, signal: null });
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.child.exitCode === null && child.child.signalCode === null)
      child.child.kill("SIGKILL");
    await child.exited;
  }
  for (const h of harnesses.splice(0)) await h.dispose();
});

describe("real PostgreSQL and actual killed/restarted worker processes", () => {
  it("D09 survives actual process death after submission commit before notification", async () => {
    const h = await harness();
    const producer = launch(h, "commit");
    const message = await producer.waitFor("committed");
    const runId = String(message.runId);
    const exit = await kill(producer);
    const queued = await h.coordinator.get(runId);
    expect(queued.state).toBe("QUEUED");
    const before = await h.db.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM outbox_events WHERE run_id=$1 AND delivered_at IS NULL",
      [runId],
    );
    expect(before.rows[0]!.count).toBe(1);
    const restarted = launch(h, "drain");
    expect((await restarted.waitFor("drained")).processed).toBe(1);
    expect(await restarted.exited).toEqual({ code: 0, signal: null });
    const facts = await evidence(h, runId);
    expect(facts.state).toBe("ANALYSIS_COMPLETE");
    expect(facts.attempts).toBe(1);
    expect(facts.budget.reservedComputeMs).toBe(0);
    console.info(
      "D09",
      JSON.stringify({ crashPoint: message.point, committedAt: message.at, exit, ...facts }),
    );
  }, 30_000);

  it("D13 kills an actual process with supervised analysis in flight, then fences its replacement", async () => {
    const h = await harness();
    const submitted = await h.submit({ limits: { leaseMs: 1_000 } });
    const worker = launch(h, "analysis");
    const message = await worker.waitFor("analysis-started");
    expect(message.runId).toBe(submitted.runId);
    const exit = await kill(worker);
    expect(worker.messages.some((item) => item.point === "analysis-finished")).toBe(false);
    expect((await h.coordinator.get(submitted.runId)).state).toBe("ANALYZING");
    await recoverAndDrain(h);
    const facts = await evidence(h, submitted.runId);
    expect(facts.state).toBe("ANALYSIS_COMPLETE");
    expect(facts.attempts).toBe(2);
    expect(facts.generation).toBe(2);
    expect(facts.budget.activeWorkers).toBe(0);
    expect(facts.events.filter((item) => item.state === "ANALYSIS_COMPLETE")).toHaveLength(1);
    console.info(
      "D13",
      JSON.stringify({ crashPoint: message.point, beganAt: message.at, exit, ...facts }),
    );
  }, 30_000);

  it("D14 kills after real result staging, reconciles orphans and prevents false completion", async () => {
    const h = await harness();
    const submitted = await h.submit({ limits: { leaseMs: 1_000 } });
    const worker = launch(h, "stage");
    const message = await worker.waitFor("staged");
    expect(message.resultDigest).toBe(expectedDigest);
    const exit = await kill(worker);
    expect((await h.coordinator.get(submitted.runId)).state).toBe("ANALYZING");
    expect(await h.coordinator.artifacts(submitted.runId)).toEqual([]);
    const before = await h.service.garbageCollect();
    expect(before).toMatchObject({ dryRun: true, orphans: 2, deleted: 0 });
    expect((await h.service.garbageCollect(true)).deleted).toBe(0);
    expect((await h.coordinator.blobInventory()).filter((blob) => !blob.referenced)).toHaveLength(
      2,
    );
    await recoverAndDrain(h);
    const verified = await h.service.verify(submitted.runId);
    expect(verified.result.runDigest).toBe(expectedDigest);
    expect((await h.service.garbageCollect()).orphans).toBe(0);
    const facts = await evidence(h, submitted.runId);
    expect(facts.attempts).toBe(2);
    expect(facts.events.filter((item) => item.state === "ANALYSIS_COMPLETE")).toHaveLength(1);
    console.info(
      "D14",
      JSON.stringify({
        crashPoint: message.point,
        stagedAt: message.at,
        exit,
        orphanInventory: before,
        ...facts,
      }),
    );
  }, 30_000);

  it("D27 a fresh process verifies persisted result, audit order and settlement after all workers exit", async () => {
    const h = await harness();
    const submitted = await h.submit();
    const worker = launch(h, "drain");
    expect((await worker.waitFor("drained")).processed).toBe(1);
    expect(await worker.exited).toEqual({ code: 0, signal: null });
    const first = await verifyRestart(h, submitted.runId);
    const second = await verifyRestart(h, submitted.runId);
    expect(second).toEqual(first);
    const facts = await evidence(h, submitted.runId);
    expect(facts.events.map((item) => item.sequence)).toEqual([0, 1, 2, 3]);
    expect(facts.budget.reservedBytes).toBe(0);
    expect(facts.budget.reservedComputeMs).toBe(0);
    console.info("D27", JSON.stringify({ independentReadbacks: 2, ...facts }));
  }, 30_000);
});
