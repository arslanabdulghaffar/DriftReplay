import { resolve } from "node:path";
import { FIXTURE_SELECTIONS } from "./fixture.ts";
import { validateExperimentSelections } from "./ingestion.ts";
import type { LocalSelection } from "./ingestion.ts";
import { runSupervised } from "./supervisor.ts";
import { writeReports } from "./output.ts";
import { InputError } from "./errors.ts";

const usage =
  "Usage: node packages/analysis/src/cli.ts (--fixture | --base REL.json --candidate REL.json --source REL.ts [--source REL.ts ...] [--mapping REL.json]) [--root LOCAL_DIRECTORY]";
try {
  const args = process.argv.slice(2);
  let root = process.cwd(),
    fixture = false,
    rootSet = false;
  const selections: LocalSelection[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--fixture") {
      if (fixture) throw new InputError("INVALID_ARGUMENTS");
      fixture = true;
      continue;
    }
    if (arg === "--help" && args.length === 1) {
      console.log(usage);
      process.exit(0);
    }
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new InputError("INVALID_ARGUMENTS");
    if (arg === "--root") {
      if (rootSet) throw new InputError("INVALID_ARGUMENTS");
      root = resolve(value);
      rootSet = true;
      continue;
    }
    const role =
      arg === "--base"
        ? "base-contract"
        : arg === "--candidate"
          ? "candidate-contract"
          : arg === "--source"
            ? "source"
            : arg === "--mapping"
              ? "mapping"
              : undefined;
    if (!role) throw new InputError("INVALID_ARGUMENTS");
    selections.push({ path: value, role });
  }
  if (fixture && selections.length) throw new InputError("INVALID_ARGUMENTS");
  const approved = validateExperimentSelections(fixture ? FIXTURE_SELECTIONS : selections);
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  const start = performance.now();
  const result = await runSupervised(root, approved, {}, controller.signal);
  const outputs = await writeReports(root, result);
  console.log(
    JSON.stringify({
      state: result.state,
      runDigest: result.runDigest,
      outputs,
      deltas: result.deltas.length,
      usages: result.usages.length,
      links: result.links.length,
      processingMetadata: {
        elapsedMs: Math.round(performance.now() - start),
        resultBytes: Buffer.byteLength(JSON.stringify(result)),
        scope: "nondeterministic measurement; excluded from logical digest",
      },
      replayExecuted: false,
      repairExecuted: false,
      modelInvocations: 0,
      unresolved: result.unresolved,
    }),
  );
  process.exitCode = result.state === "ANALYSIS_ONLY" ? 0 : result.state === "STOPPED" ? 2 : 3;
} catch (error) {
  console.error(
    JSON.stringify({
      state: "STOPPED",
      code: error instanceof InputError ? error.code : "LOCAL_IO_FAILURE",
      usage,
    }),
  );
  process.exitCode = 64;
}
