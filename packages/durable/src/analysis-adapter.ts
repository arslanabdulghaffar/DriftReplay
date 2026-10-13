import { Worker } from "node:worker_threads";
import { z } from "zod";
import { stoppedResult } from "../../analysis/src/analysis.ts";
import { AnalysisResultSchema, type AnalysisResult } from "../../analysis/src/model.ts";
import { validateExperimentSelections, type CapturedInput } from "../../analysis/src/ingestion.ts";
import { POLICY, POLICY_HASH } from "../../analysis/src/policy.ts";

export interface AnalysisDeadline {
  readonly deadlineMs?: number;
}

const DeadlineSchema = z.strictObject({
  deadlineMs: z.number().int().min(1).max(POLICY.timeBudgetMs).optional(),
});
const ReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("result"), json: z.string().max(POLICY.maxOutputBytes) }),
  z.strictObject({ kind: z.literal("verified"), accepted: z.boolean() }),
]);
type Reply = z.infer<typeof ReplySchema>;

/** Copy finite plain byte records before structured clone can invoke caller accessors. */
function snapshotInputs(value: unknown): CapturedInput[] {
  if (!Array.isArray(value) || value.length > POLICY.maxRequestedFiles) throw new Error();
  const entries = Object.getOwnPropertyDescriptors(value);
  let total = 0;
  let sources = 0;
  const captured: CapturedInput[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = entries[String(index)];
    const item: unknown = descriptor && "value" in descriptor ? descriptor.value : undefined;
    if (
      !item ||
      typeof item !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(item) as object | null)
    )
      throw new Error();
    const fields = Object.getOwnPropertyDescriptors(item);
    if (
      Reflect.ownKeys(item).length !== 3 ||
      !["path", "role", "bytes"].every((key) => fields[key] && "value" in fields[key]!)
    )
      throw new Error();
    const path: unknown = fields.path!.value;
    const role: unknown = fields.role!.value;
    const bytes: unknown = fields.bytes!.value;
    if (
      typeof path !== "string" ||
      typeof role !== "string" ||
      !["base-contract", "candidate-contract", "source", "mapping"].includes(role) ||
      !(bytes instanceof Uint8Array) ||
      !(bytes.buffer instanceof ArrayBuffer)
    )
      throw new Error();
    const limit =
      role === "source"
        ? POLICY.maxSourceBytes
        : role === "mapping"
          ? POLICY.maxMappingBytes
          : POLICY.maxContractBytes;
    total += bytes.byteLength;
    if (role === "source") sources += bytes.byteLength;
    if (
      bytes.byteLength > limit ||
      total > POLICY.maxTotalBytes ||
      sources > POLICY.maxCombinedSourceBytes
    )
      throw new Error();
    captured.push({ path, role: role as CapturedInput["role"], bytes: Uint8Array.from(bytes) });
  }
  validateExperimentSelections(captured.map(({ path, role }) => ({ path, role })));
  return captured;
}

/** Only bounded JSON data crosses the verification protocol; accessors are never evaluated. */
function resultJson(value: unknown): string {
  let remaining = POLICY.maxOutputBytes;
  let nodes = 0;
  const active = new Set<object>();
  const visit = (item: unknown, depth: number): string => {
    if (++nodes > 200_000 || depth > 32) throw new Error();
    const debit = (text: string): string => {
      remaining -= Buffer.byteLength(text, "utf8");
      if (remaining < 0) throw new Error();
      return text;
    };
    if (item === null || typeof item === "string" || typeof item === "boolean") {
      if (typeof item === "string" && item.length > POLICY.maxOutputBytes) throw new Error();
      return debit(JSON.stringify(item));
    }
    if (typeof item === "number" && Number.isFinite(item)) return debit(JSON.stringify(item));
    if (
      !item ||
      typeof item !== "object" ||
      active.has(item) ||
      (!Array.isArray(item) &&
        ![Object.prototype, null].includes(Object.getPrototypeOf(item) as object | null))
    )
      throw new Error();
    active.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    let result: string;
    if (Array.isArray(item)) {
      if (item.length > 200_000 || Reflect.ownKeys(item).length !== item.length + 1)
        throw new Error();
      debit("[]" + ",".repeat(Math.max(0, item.length - 1)));
      const elements: string[] = [];
      for (let index = 0; index < item.length; index++) {
        const field = descriptors[String(index)];
        if (!field || !("value" in field)) throw new Error();
        elements.push(visit(field.value as unknown, depth + 1));
      }
      result = `[${elements.join(",")}]`;
    } else {
      const keys = Reflect.ownKeys(item);
      if (keys.length > 200_000) throw new Error();
      debit("{}" + ",".repeat(Math.max(0, keys.length - 1)));
      const elements: string[] = [];
      for (const key of keys) {
        if (typeof key !== "string") throw new Error();
        const field = descriptors[key];
        if (!field || !("value" in field) || !field.enumerable) throw new Error();
        elements.push(
          `${debit(JSON.stringify(key) + ":")}${visit(field.value as unknown, depth + 1)}`,
        );
      }
      result = `{${elements.join(",")}}`;
    }
    active.delete(item);
    return result;
  };
  return visit(value, 0);
}

async function supervise(
  captured: readonly CapturedInput[],
  kind: "run" | "verify",
  proposed: unknown,
  signal: AbortSignal | undefined,
  options: AnalysisDeadline,
): Promise<Reply> {
  const diagnostic = (code: string, indeterminate = false): Reply =>
    kind === "verify"
      ? { kind: "verified", accepted: false }
      : { kind: "result", json: JSON.stringify(stoppedResult(code, indeterminate)) };
  const started = performance.now();
  const limits = DeadlineSchema.safeParse(options);
  if (!limits.success) return diagnostic("INVALID_OPTIONS");
  if (signal?.aborted) return diagnostic("CANCELLED");
  let inputs: CapturedInput[];
  let json: string | undefined;
  try {
    inputs = snapshotInputs(captured);
    if (kind === "verify") json = resultJson(proposed);
  } catch {
    return diagnostic("INVALID_INPUT");
  }
  const remaining = (limits.data.deadlineMs ?? POLICY.timeBudgetMs) - (performance.now() - started);
  if (remaining <= 0) return diagnostic("TIME_LIMIT");
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./analysis-worker.ts", import.meta.url), {
        workerData: { kind, captured: inputs, ...(json === undefined ? {} : { json }) },
        resourceLimits: { maxOldGenerationSizeMb: POLICY.workerHeapMb, stackSizeMb: 4 },
      });
    } catch {
      resolve(diagnostic("ENGINE_START_FAILURE", true));
      return;
    }
    let done = false;
    const complete = (reply: Reply) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      // Resolve after termination so no abandoned trusted parser remains active.
      void worker.terminate().then(
        () => resolve(reply),
        () => resolve(diagnostic("ENGINE_TERMINATION_FAILURE", true)),
      );
    };
    const cancel = () => complete(diagnostic("CANCELLED"));
    const timer = setTimeout(() => complete(diagnostic("TIME_LIMIT")), remaining);
    signal?.addEventListener("abort", cancel, { once: true });
    worker.once("message", (value: unknown) => {
      const parsed = ReplySchema.safeParse(value);
      if (
        !parsed.success ||
        (kind === "run" ? parsed.data.kind !== "result" : parsed.data.kind !== "verified") ||
        (parsed.data.kind === "result" &&
          Buffer.byteLength(parsed.data.json, "utf8") > POLICY.maxOutputBytes)
      ) {
        complete(diagnostic("INVALID_ENGINE_OUTPUT", true));
        return;
      }
      complete(parsed.data);
    });
    worker.once("error", () => complete(diagnostic("ENGINE_FAILURE", true)));
    worker.once("exit", () => complete(diagnostic("ENGINE_EXIT_WITHOUT_RESULT", true)));
    if (signal?.aborted) cancel();
  });
}

/** Trusted code only: the worker consumes owned CAS bytes, never the original source paths. */
export async function runAnalysis(
  captured: readonly CapturedInput[],
  signal?: AbortSignal,
  options: AnalysisDeadline = {},
): Promise<AnalysisResult> {
  const reply = await supervise(captured, "run", undefined, signal, options);
  try {
    if (reply.kind !== "result") throw new Error();
    const result = AnalysisResultSchema.parse(JSON.parse(reply.json) as unknown);
    if (result.policyHash !== POLICY_HASH) throw new Error();
    return result;
  } catch {
    return stoppedResult("INVALID_ENGINE_OUTPUT", true);
  }
}

/** Independent bounded recomputation. A stopped diagnostic is not a successful run identity. */
export async function verifyStoredAnalysis(
  proposed: unknown,
  captured: readonly CapturedInput[],
  signal?: AbortSignal,
  options: AnalysisDeadline = {},
): Promise<boolean> {
  const reply = await supervise(captured, "verify", proposed, signal, options);
  return reply.kind === "verified" && reply.accepted;
}
