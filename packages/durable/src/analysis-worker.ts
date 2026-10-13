import { parentPort, workerData } from "node:worker_threads";
import { z } from "zod";
import {
  analyzeSnapshots,
  stoppedResult,
  verifyAnalysisResult,
} from "../../analysis/src/analysis.ts";
import { AnalysisResultSchema } from "../../analysis/src/model.ts";
import { canonical } from "../../analysis/src/identity.ts";
import { POLICY, POLICY_HASH } from "../../analysis/src/policy.ts";

const CapturedSchema = z
  .array(
    z.strictObject({
      path: z.string().max(500),
      role: z.enum(["base-contract", "candidate-contract", "source", "mapping"]),
      bytes: z.instanceof(Uint8Array),
    }),
  )
  .max(POLICY.maxRequestedFiles);
const RequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("run"), captured: CapturedSchema }),
  z.strictObject({
    kind: z.literal("verify"),
    captured: CapturedSchema,
    json: z.string().max(POLICY.maxOutputBytes),
  }),
]);

if (!parentPort) throw new Error("WORKER_ONLY");
const request = RequestSchema.safeParse(workerData);
if (!request.success) throw new Error("INVALID_WORKER_REQUEST");

// This fixed project-owned entry point never imports inspected consumer code or reopens paths.
if (request.data.kind === "run") {
  let result = analyzeSnapshots(request.data.captured);
  if (
    result.policyHash !== POLICY_HASH ||
    (result.state === "ANALYSIS_ONLY" && !verifyAnalysisResult(result, request.data.captured))
  )
    result = stoppedResult("INVALID_ENGINE_OUTPUT", true);
  const json = canonical(AnalysisResultSchema.parse(result));
  if (Buffer.byteLength(json, "utf8") > POLICY.maxOutputBytes) throw new Error("OUTPUT_LIMIT");
  parentPort.postMessage({ kind: "result", json });
} else {
  let accepted = false;
  try {
    if (Buffer.byteLength(request.data.json, "utf8") > POLICY.maxOutputBytes)
      throw new Error("OUTPUT_LIMIT");
    const parsed = AnalysisResultSchema.safeParse(JSON.parse(request.data.json) as unknown);
    if (parsed.success && parsed.data.policyHash === POLICY_HASH) {
      accepted =
        parsed.data.state === "ANALYSIS_ONLY"
          ? verifyAnalysisResult(parsed.data, request.data.captured)
          : canonical(parsed.data) === canonical(analyzeSnapshots(request.data.captured));
    }
  } catch {
    accepted = false;
  }
  parentPort.postMessage({ kind: "verified", accepted });
}
