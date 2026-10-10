import { Worker } from "node:worker_threads";
import { AnalysisResultSchema } from "./model.ts";
import type { AnalysisResult } from "./model.ts";
import { stoppedResult } from "./analysis.ts";
import { POLICY, OptionsSchema } from "./policy.ts";
import type { AnalysisOptions } from "./policy.ts";
import type { LocalSelection } from "./ingestion.ts";
import { validateExperimentSelections, validateRoot } from "./ingestion.ts";
import { InputError } from "./errors.ts";

export function validateWorkerReply(value: unknown): AnalysisResult {
  const parsed = AnalysisResultSchema.safeParse(value);
  return parsed.success ? parsed.data : stoppedResult("INVALID_ENGINE_OUTPUT", true);
}
/** OS process isolation is not claimed. This worker bounds the trusted parser's work. */
export async function runSupervised(
  root: string,
  selections: readonly LocalSelection[],
  options: AnalysisOptions = {},
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const parsed = OptionsSchema.safeParse(options);
  if (!parsed.success) return stoppedResult("INVALID_OPTIONS");
  if (signal?.aborted) return stoppedResult("CANCELLED");
  let selected: readonly LocalSelection[];
  try {
    root = validateRoot(root);
    selected = validateExperimentSelections(selections);
  } catch (error) {
    return stoppedResult(error instanceof InputError ? error.code : "INVALID_INPUT");
  }
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), {
        workerData: { root, selections: selected, options: parsed.data },
        resourceLimits: { maxOldGenerationSizeMb: POLICY.workerHeapMb, stackSizeMb: 4 },
      });
    } catch {
      resolve(stoppedResult("ENGINE_START_FAILURE", true));
      return;
    }
    let done = false;
    const complete = (result: AnalysisResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      void worker.terminate();
      resolve(result);
    };
    const cancel = () => complete(stoppedResult("CANCELLED"));
    const timer = setTimeout(
      () => complete(stoppedResult("TIME_LIMIT")),
      parsed.data.budgetMs ?? POLICY.timeBudgetMs,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    worker.once("message", (value) => complete(validateWorkerReply(value)));
    worker.once("error", () => complete(stoppedResult("ENGINE_FAILURE", true)));
    worker.once("exit", () => complete(stoppedResult("ENGINE_EXIT_WITHOUT_RESULT", true)));
  });
}
