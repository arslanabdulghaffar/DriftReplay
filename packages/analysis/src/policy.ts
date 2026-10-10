import { z } from "zod";
import { identity } from "./identity.ts";
import { InputError } from "./errors.ts";
import { CURATED_PINS } from "./correspondence.ts";

export const POLICY = Object.freeze({
  id: "local-analysis-v2",
  version: "2",
  maxContractBytes: 2 * 1024 * 1024,
  maxSourceBytes: 256 * 1024,
  maxMappingBytes: 256 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
  maxCombinedSourceBytes: 10 * 1024 * 1024,
  maxRequestedFiles: 2000,
  maxSourceFiles: 256,
  maxOutputBytes: 4 * 1024 * 1024,
  timeBudgetMs: 30000,
  workerHeapMb: 256,
  jsonDepth: 48,
  jsonNodes: 50000,
  jsonTokenCharacters: 65536,
  astNodes: 50000,
  astDepth: 128,
  astRecords: 1000,
  correspondence: "reviewed-mercurypay-byte-pins-only",
  refs: "reject-all",
  codeExecution: false,
  curatedPins: CURATED_PINS,
});
export const POLICY_HASH = identity(POLICY);
export const OptionsSchema = z.strictObject({
  budgetMs: z.number().int().min(1).max(POLICY.timeBudgetMs).optional(),
  maxOutputBytes: z.number().int().min(4096).max(POLICY.maxOutputBytes).optional(),
});
export type AnalysisOptions = z.infer<typeof OptionsSchema>;

export function makeBudget(options: AnalysisOptions, signal?: AbortSignal): () => void {
  const start = performance.now();
  return () => {
    if (signal?.aborted) throw new InputError("CANCELLED");
    if (performance.now() - start >= (options.budgetMs ?? POLICY.timeBudgetMs)) {
      throw new InputError("TIME_LIMIT");
    }
  };
}
