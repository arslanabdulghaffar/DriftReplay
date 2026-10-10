import { z } from "zod";
import { captureLocalInputs, validateExperimentSelections } from "./ingestion.ts";
import type { CapturedInput, LocalSelection } from "./ingestion.ts";
import { parseBoundedJson, decodeUtf8 } from "./json.ts";
import { InputError } from "./errors.ts";
import { compareContracts, ContractError } from "./openapi.ts";
import { traceSource, TraceError } from "./trace.ts";
import { checkCorrespondence, resolvePointer } from "./correspondence.ts";
import { canonical, identity, ordered, sha256 } from "./identity.ts";
import { AnalysisResultSchema, SnapshotSchema } from "./model.ts";
import type { AnalysisResult, SourceSnapshot } from "./model.ts";
import { OptionsSchema, POLICY, POLICY_HASH, makeBudget } from "./policy.ts";
import type { AnalysisOptions } from "./policy.ts";

export { AnalysisResultSchema } from "./model.ts";
export type { AnalysisResult } from "./model.ts";

const BytesInputSchema = z
  .array(
    z.strictObject({
      path: z.string(),
      role: z.enum(["base-contract", "candidate-contract", "source", "mapping"]),
      bytes: z.instanceof(Uint8Array),
    }),
  )
  .max(POLICY.maxRequestedFiles);

function checkByteRecords(input: unknown): void {
  if (!Array.isArray(input) || input.length > POLICY.maxRequestedFiles)
    throw new InputError("INVALID_INPUT");
  const entries = Object.getOwnPropertyDescriptors(input);
  for (let index = 0; index < input.length; index++) {
    const entry = entries[String(index)];
    if (!entry || !("value" in entry) || entry.value === null || typeof entry.value !== "object")
      throw new InputError("INVALID_INPUT");
    const item: unknown = entry.value;
    if (![Object.prototype, null].includes(Object.getPrototypeOf(item) as object | null))
      throw new InputError("INVALID_INPUT");
    const fields = Object.getOwnPropertyDescriptors(item);
    if (
      Reflect.ownKeys(item as object).length !== 3 ||
      !["path", "role", "bytes"].every((key) => fields[key] && "value" in fields[key]!)
    )
      throw new InputError("INVALID_INPUT");
    const bytes: unknown = fields.bytes!.value;
    if (!(bytes instanceof Uint8Array) || !(bytes.buffer instanceof ArrayBuffer))
      throw new InputError("INVALID_BYTES");
  }
}

function emptyResult(): Omit<AnalysisResult, "runDigest"> {
  return {
    schemaVersion: "2",
    engine: { name: "driftreplay-openapi-subset", version: "0.2.0", typescript: "5.9.3" },
    policyId: "local-analysis-v2",
    policyHash: POLICY_HASH,
    state: "ANALYSIS_ONLY",
    snapshots: [],
    deltas: [],
    usages: [],
    correspondences: [],
    evidence: [],
    links: [],
    assessments: [],
    unresolved: [],
    scope: { sourcePaths: [], coverage: "explicit-files-only; lexical; no reachability proof" },
    replayExecuted: false,
    repairExecuted: false,
    modelInvocations: 0,
  };
}
function finish(result: Omit<AnalysisResult, "runDigest">): AnalysisResult {
  return AnalysisResultSchema.parse({ ...result, runDigest: identity(result) });
}
export function stoppedResult(
  code: string,
  indeterminate = false,
  pointer?: string,
): AnalysisResult {
  const result = emptyResult();
  result.state = indeterminate ? "INDETERMINATE" : "STOPPED";
  result.unresolved = [
    {
      code,
      message: "Analysis did not complete; no impact or runtime claims are admitted.",
      ...(pointer ? { pointer: pointer.slice(0, 4096) } : {}),
    },
  ];
  return finish(result);
}
function caught(error: unknown): AnalysisResult {
  if (error instanceof ContractError) return stoppedResult(error.code, false, error.pointer);
  if (error instanceof InputError || error instanceof ContractError || error instanceof TraceError)
    return stoppedResult(error.code);
  return stoppedResult("ENGINE_FAILURE", true);
}

function captureIdentity(item: CapturedInput): SourceSnapshot {
  const sha = sha256(item.bytes);
  return SnapshotSchema.parse({
    schemaVersion: "2",
    id: identity({ path: item.path, role: item.role, sha256: sha }),
    path: item.path,
    sha256: sha,
    byteLength: item.bytes.byteLength,
    role: item.role,
    originKind: "approved-local",
    trustOrigin: "operator-selected-untrusted-content",
    mediaType:
      item.role !== "source"
        ? "application/json"
        : /\.jsx?$/.test(item.path)
          ? "text/javascript"
          : "text/typescript",
  });
}

/** Pure investigation over captured bytes. Copies buffers; never opens a source path. */
export function analyzeSnapshots(
  input: unknown,
  options: AnalysisOptions = {},
  signal?: AbortSignal,
): AnalysisResult {
  try {
    const parsedOptions = OptionsSchema.safeParse(options);
    if (!parsedOptions.success) throw new InputError("INVALID_OPTIONS");
    const check = makeBudget(parsedOptions.data, signal);
    check();
    checkByteRecords(input);
    const parsed = BytesInputSchema.safeParse(input);
    if (!parsed.success) throw new InputError("INVALID_INPUT");
    validateExperimentSelections(parsed.data.map(({ path, role }) => ({ path, role })));
    let total = 0,
      sourceTotal = 0;
    const captured = parsed.data
      .map((item) => {
        const limit =
          item.role === "source"
            ? POLICY.maxSourceBytes
            : item.role === "mapping"
              ? POLICY.maxMappingBytes
              : POLICY.maxContractBytes;
        total += item.bytes.byteLength;
        if (item.role === "source") sourceTotal += item.bytes.byteLength;
        if (
          item.bytes.byteLength > limit ||
          total > POLICY.maxTotalBytes ||
          sourceTotal > POLICY.maxCombinedSourceBytes
        )
          throw new InputError("INPUT_SIZE_LIMIT");
        check();
        return { path: item.path, role: item.role, bytes: Uint8Array.from(item.bytes) };
      })
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const snapshots = captured.map(captureIdentity);
    const texts = captured.map((item) => decodeUtf8(item.bytes));
    const baseIndex = captured.findIndex((item) => item.role === "base-contract");
    const candidateIndex = captured.findIndex((item) => item.role === "candidate-contract");
    const base = snapshots[baseIndex],
      candidate = snapshots[candidateIndex];
    if (!base || !candidate) throw new InputError("MISSING_CONTRACTS");
    const baseDocument = parseBoundedJson(texts[baseIndex]!, check);
    const candidateDocument = parseBoundedJson(texts[candidateIndex]!, check);
    const comparison = compareContracts(baseDocument, candidateDocument, check);
    const result = emptyResult();
    result.snapshots = ordered(snapshots);
    result.scope.sourcePaths = captured
      .filter((item) => item.role === "source")
      .map((item) => item.path)
      .sort();
    // Incremental conservative output accounting stops before a large evidence join accumulates.
    let outputBytes = 2048;
    const consume = (value: unknown) => {
      check();
      outputBytes += Buffer.byteLength(canonical(value), "utf8") + 128;
      if (outputBytes > (options.maxOutputBytes ?? POLICY.maxOutputBytes))
        throw new InputError("OUTPUT_LIMIT");
    };
    consume(result.snapshots);
    consume(result.scope);
    result.deltas = ordered(
      comparison.deltas.map((delta) => {
        if (delta.oldPointer) resolvePointer(baseDocument, delta.oldPointer);
        if (delta.newPointer) resolvePointer(candidateDocument, delta.newPointer);
        const data = { ...delta, baseDigest: base.sha256, candidateDigest: candidate.sha256 };
        const bound = { ...data, id: identity(data) };
        consume(bound);
        return bound;
      }),
    );
    const mappingIndex = captured.findIndex((item) => item.role === "mapping");
    if (mappingIndex >= 0) {
      result.correspondences = ordered(
        checkCorrespondence(
          captured[mappingIndex]!.bytes,
          captured[baseIndex]!.bytes,
          captured[candidateIndex]!.bytes,
          check,
        ),
      );
      consume(result.correspondences);
    }
    for (let i = 0; i < captured.length; i++) {
      check();
      const item = captured[i]!,
        snapshot = snapshots[i]!,
        text = texts[i]!;
      if (item.role !== "source") continue;
      const trace = traceSource(item.path, text, check);
      for (const usage of trace.usages) {
        for (const location of [usage.location, usage.requestLocation]) {
          if (text.slice(location.start, location.end) !== location.excerpt)
            throw new InputError("INVALID_CITATION");
        }
        const data = {
          ...usage,
          sourceSnapshotId: snapshot.id,
          sourceDigest: snapshot.sha256,
          filePath: item.path,
          execution: "not-executed" as const,
        };
        const bound = { ...data, id: identity(data) };
        consume(bound);
        result.usages.push(bound);
      }
      for (const unresolved of trace.unresolved) {
        const bound = { code: unresolved.ruleId, message: unresolved.reason, filePath: item.path };
        consume(bound);
        result.unresolved.push(bound);
      }
    }
    result.usages = ordered(result.usages);
    result.unresolved = ordered(result.unresolved);
    for (const delta of result.deltas) {
      const data = {
        kind: "structural" as const,
        provenance: "observed" as const,
        subjectId: delta.id,
        snapshotIds: [base.id, candidate.id],
        proof: "static-analysis-only" as const,
      };
      const bound = { ...data, id: identity(data) };
      consume(bound);
      result.evidence.push(bound);
    }
    for (const usage of result.usages) {
      const data = {
        kind: "usage" as const,
        provenance: "observed" as const,
        subjectId: usage.id,
        snapshotIds: [usage.sourceSnapshotId],
        proof: "static-analysis-only" as const,
      };
      const bound = { ...data, id: identity(data) };
      consume(bound);
      result.evidence.push(bound);
    }
    for (const correspondence of result.correspondences) {
      const data = {
        kind: "curated" as const,
        provenance: "curated" as const,
        subjectId: correspondence.id,
        snapshotIds: [base.id, candidate.id, snapshots[mappingIndex]!.id],
        proof: "static-analysis-only" as const,
      };
      const bound = { ...data, id: identity(data) };
      consume(bound);
      result.evidence.push(bound);
    }
    for (const delta of result.deltas) {
      check();
      if (delta.compatibility === "unknown" || delta.support !== "supported") {
        result.assessments.push({
          deltaId: delta.id,
          status: "UNVERIFIED",
          reason:
            "Compatibility is unknown under the supported contract policy; no impact claim is admitted.",
        });
        continue;
      }
      if (delta.compatibility !== "breaking") continue;
      const usages = result.usages.filter(
        (usage) => usage.path === delta.path && usage.method === delta.method,
      );
      for (const usage of usages) {
        const correspondences = result.correspondences.filter(
          (c) => delta.oldPointer === c.basePointer,
        );
        const subjects = new Set([delta.id, usage.id, ...correspondences.map((c) => c.id)]);
        const data = {
          deltaId: delta.id,
          usageId: usage.id,
          ruleId: "impact.exact-method-path.v1" as const,
          confidence: "direct" as const,
          status: "POTENTIAL_IMPACT" as const,
          evidenceIds: result.evidence
            .filter((e) => subjects.has(e.subjectId))
            .map((e) => e.id)
            .sort(),
          correspondenceIds: correspondences.map((c) => c.id).sort(),
          limitations: [
            "Exact method/path correspondence is conditional on this contract describing the selected consumer's intended provider.",
            "Lexical construction/call does not prove execution, reachability, affected values, provider retirement, or runtime failure.",
          ],
        };
        const bound = { ...data, id: identity(data) };
        consume(bound);
        result.links.push(bound);
      }
      result.assessments.push({
        deltaId: delta.id,
        status: usages.length
          ? "POTENTIAL_IMPACT"
          : result.unresolved.length
            ? "UNVERIFIED"
            : "NOT_APPLICABLE",
        reason: usages.length
          ? "Supported structural change joined to exact method/path usage; conditional static impact only."
          : result.unresolved.length
            ? "Unresolved syntax prevents a scoped absence conclusion."
            : "No supported relevant usage in explicitly listed files; this is not global safety or proof of no breakage.",
      });
    }
    result.links = ordered(result.links);
    result.evidence = ordered(result.evidence);
    result.assessments = ordered(result.assessments);
    check();
    const completed = finish(result);
    if (
      Buffer.byteLength(canonical(completed), "utf8") >
      (options.maxOutputBytes ?? POLICY.maxOutputBytes)
    )
      throw new InputError("OUTPUT_LIMIT");
    check();
    return completed;
  } catch (error) {
    return caught(error);
  }
}

/** Filesystem adapter boundary; downstream modules receive captured bytes only. */
export async function analyzeLocalExperiment(
  root: string,
  selections: readonly LocalSelection[],
  options: AnalysisOptions = {},
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  try {
    const parsed = OptionsSchema.safeParse(options);
    if (!parsed.success) throw new InputError("INVALID_OPTIONS");
    const check = makeBudget(parsed.data, signal);
    const captured = await captureLocalInputs(root, validateExperimentSelections(selections), {
      check,
      ...(signal ? { signal } : {}),
    });
    check();
    const result = analyzeSnapshots(captured, parsed.data, signal);
    check();
    return result;
  } catch (error) {
    return caught(error);
  }
}

/** A digest/schema alone never grants proof. Recompute and compare every binding. */
export function verifyAnalysisResult(proposed: unknown, captured: unknown): boolean {
  const parsed = AnalysisResultSchema.safeParse(proposed);
  if (!parsed.success || parsed.data.state !== "ANALYSIS_ONLY") return false;
  const actual = analyzeSnapshots(captured);
  return actual.state === "ANALYSIS_ONLY" && canonical(parsed.data) === canonical(actual);
}

export function assessAnalysisClaim(
  claim: unknown,
  result: unknown,
  captured: unknown,
): { accepted: boolean; reason: string } {
  const parsed = z
    .strictObject({
      status: z.enum(["STRUCTURAL_BREAK", "MATCHED_USAGE", "POTENTIAL_IMPACT"]),
      subjectId: z.string(),
    })
    .safeParse(claim);
  if (!parsed.success || !verifyAnalysisResult(result, captured))
    return { accepted: false, reason: "INVALID_OR_UNBOUND_EVIDENCE" };
  const verified = AnalysisResultSchema.parse(result),
    { status, subjectId } = parsed.data;
  const accepted =
    status === "STRUCTURAL_BREAK"
      ? verified.deltas.some(
          (d) => d.id === subjectId && d.support === "supported" && d.compatibility === "breaking",
        )
      : status === "MATCHED_USAGE"
        ? verified.usages.some(
            (u) =>
              u.id === subjectId &&
              verified.deltas.some((d) => d.method === u.method && d.path === u.path),
          )
        : verified.links.some((link) => link.id === subjectId);
  return { accepted, reason: accepted ? "RECOMPUTED_STATIC_EVIDENCE" : "MISSING_SUBJECT" };
}
