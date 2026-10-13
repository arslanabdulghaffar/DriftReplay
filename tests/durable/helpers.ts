import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { FIXTURE_SELECTIONS } from "../../packages/analysis/src/fixture.ts";
import { ArtifactStore } from "../../packages/durable/src/artifacts.ts";
import { loadConnection } from "../../packages/durable/src/config.ts";
import type { RunLimits } from "../../packages/durable/src/contracts.ts";
import { Coordinator } from "../../packages/durable/src/coordinator.ts";
import { createDatabase, identifier } from "../../packages/durable/src/db/client.ts";
import { migrate } from "../../packages/durable/src/db/migrate.ts";
import { InvestigationService } from "../../packages/durable/src/service.ts";

export async function createHarness() {
  const parent = resolve(".local/durable-tests");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(join(parent, "test-"));
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const runtimeConfig = await loadConnection();
  const owner = createDatabase(await loadConnection(true), { schema });
  await migrate(owner, { runtimeRole: runtimeConfig.user });
  const db = createDatabase(runtimeConfig, { schema });
  const coordinator = new Coordinator(db);
  const store = new ArtifactStore(join(root, "artifacts"));
  await store.initialize();
  const service = new InvestigationService(coordinator, store);
  const inputRoot = join(root, "inputs");
  for (const selection of FIXTURE_SELECTIONS) {
    const target = join(inputRoot, selection.path);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(resolve(selection.path), target);
  }
  return {
    db,
    owner,
    coordinator,
    store,
    service,
    root,
    schema,
    inputRoot,
    submit: (options: { idempotencyToken?: string; limits?: Partial<RunLimits> } = {}) =>
      service.submit(inputRoot, FIXTURE_SELECTIONS, options),
    async dispose() {
      await db.close();
      if (!/^test_[a-f0-9]{32}$/.test(schema)) throw new Error("UNSAFE_TEST_SCHEMA");
      await owner.query(`DROP SCHEMA ${identifier(schema)} CASCADE`);
      await owner.close();
      const target = resolve(root);
      if (!target.startsWith(parent + sep)) throw new Error("UNSAFE_TEST_CLEANUP");
      await rm(target, { recursive: true, force: true });
    },
  };
}
export type Harness = Awaited<ReturnType<typeof createHarness>>;

export async function nextClaim(harness: Harness) {
  await harness.coordinator.dispatch();
  const claim = await harness.coordinator.claim();
  if (!claim) throw new Error("EXPECTED_CLAIM");
  return claim;
}

export async function evidence(harness: Harness, runId: string) {
  const run = await harness.coordinator.get(runId);
  return {
    state: run.state,
    stateVersion: run.stateVersion,
    attempts: run.attempts,
    generation: run.generation,
    inputSetDigest: run.inputSetDigest,
    events: await harness.coordinator.events(runId),
    budget: await harness.coordinator.budgets(),
  };
}
