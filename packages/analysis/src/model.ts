import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().max(4096);
export const SnapshotSchema = z.strictObject({
  schemaVersion: z.literal("2"),
  id: digest,
  path: z.string().min(1).max(500),
  sha256: digest,
  byteLength: z.number().int().nonnegative(),
  role: z.enum(["base-contract", "candidate-contract", "source", "mapping"]),
  originKind: z.literal("approved-local"),
  trustOrigin: z.literal("operator-selected-untrusted-content"),
  mediaType: z.enum(["application/json", "text/typescript", "text/javascript"]),
});
export type SourceSnapshot = z.infer<typeof SnapshotSchema>;
export const LocationSchema = z.strictObject({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  startLine: z.number().int().positive(),
  startColumn: z.number().int().positive(),
  endLine: z.number().int().positive(),
  endColumn: z.number().int().positive(),
  excerpt: text,
});
export const DeltaSchema = z.strictObject({
  id: digest,
  ruleId: text,
  kind: text,
  compatibility: z.enum(["breaking", "nonbreaking", "unknown"]),
  support: z.enum(["supported", "unsupported"]),
  method: text,
  path: text,
  oldPointer: text.optional(),
  newPointer: text.optional(),
  rationale: text,
  baseDigest: digest,
  candidateDigest: digest,
});
export const UsageSchema = z.strictObject({
  id: digest,
  sourceSnapshotId: digest,
  sourceDigest: digest,
  filePath: text,
  method: text,
  path: text,
  matchMethod: z.enum(["ast-static-request-object", "ast-fetch-literal"]),
  ruleId: text,
  symbol: text.optional(),
  location: LocationSchema,
  requestLocation: LocationSchema,
  bodyProperties: z.array(text).optional(),
  limitations: z.array(text),
  execution: z.literal("not-executed"),
});
export const CorrespondenceSchema = z.strictObject({
  id: text,
  kind: z.enum(["operation", "request-property"]),
  provenance: z.literal("curated"),
  basePointer: text,
  candidatePointer: text,
  mappingDigest: digest,
  baseDigest: digest,
  candidateDigest: digest,
});
export const EvidenceSchema = z.strictObject({
  id: digest,
  kind: z.enum(["structural", "usage", "curated"]),
  provenance: z.enum(["observed", "curated"]),
  subjectId: text,
  snapshotIds: z.array(digest),
  proof: z.literal("static-analysis-only"),
});
export const ImpactSchema = z.strictObject({
  id: digest,
  deltaId: digest,
  usageId: digest,
  ruleId: z.literal("impact.exact-method-path.v1"),
  confidence: z.literal("direct"),
  status: z.literal("POTENTIAL_IMPACT"),
  evidenceIds: z.array(digest),
  correspondenceIds: z.array(text),
  limitations: z.array(text),
});
export const UnresolvedSchema = z.strictObject({
  code: text,
  message: text,
  filePath: text.optional(),
  pointer: text.optional(),
});
export const AnalysisResultSchema = z.strictObject({
  schemaVersion: z.literal("2"),
  engine: z.strictObject({
    name: z.literal("driftreplay-openapi-subset"),
    version: z.literal("0.2.0"),
    typescript: z.literal("5.9.3"),
  }),
  policyId: z.literal("local-analysis-v2"),
  policyHash: digest,
  state: z.enum(["ANALYSIS_ONLY", "STOPPED", "INDETERMINATE"]),
  snapshots: z.array(SnapshotSchema),
  deltas: z.array(DeltaSchema),
  usages: z.array(UsageSchema),
  correspondences: z.array(CorrespondenceSchema),
  evidence: z.array(EvidenceSchema),
  links: z.array(ImpactSchema),
  assessments: z.array(
    z.strictObject({
      deltaId: digest,
      status: z.enum(["POTENTIAL_IMPACT", "NOT_APPLICABLE", "UNVERIFIED"]),
      reason: text,
    }),
  ),
  unresolved: z.array(UnresolvedSchema),
  scope: z.strictObject({
    sourcePaths: z.array(text),
    coverage: z.literal("explicit-files-only; lexical; no reachability proof"),
  }),
  replayExecuted: z.literal(false),
  repairExecuted: z.literal(false),
  modelInvocations: z.literal(0),
  runDigest: digest,
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type ImpactLink = z.infer<typeof ImpactSchema>;
