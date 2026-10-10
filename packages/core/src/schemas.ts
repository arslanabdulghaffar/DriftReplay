import { z } from "zod";

export const SCHEMA_VERSION = "1" as const;

export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "Expected lowercase SHA-256 hex");
const IdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value === value.trim(), "Identifiers cannot have surrounding whitespace");

/** Paths identify workspace fixture artifacts, never URLs or executable inputs. */
export const ArtifactPathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !/[\\:%?#]/.test(path) &&
      !Array.from(path).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) &&
      path
        .split("/")
        .every(
          (part) =>
            part.length > 0 &&
            part !== "." &&
            part !== ".." &&
            part === part.trim() &&
            !part.endsWith(".") &&
            !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        ),
    "Expected a relative slash-separated path without escapes or traversal",
  );

export const ArtifactRefSchema = z
  .strictObject({
    id: IdentifierSchema,
    path: ArtifactPathSchema,
    sha256: Sha256Schema,
  })
  .readonly();
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const SnapshotIdentitySchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  sourceKind: z.enum([
    "openapi-contract",
    "provider-mock",
    "business-case",
    "expected-assertions",
    "migration-mapping",
  ]),
  resolvedVersion: IdentifierSchema,
  contentDigest: Sha256Schema,
  synthetic: z.literal(true),
  provenance: z.literal("curated-synthetic-ground-truth"),
});
export type SnapshotIdentity = z.infer<typeof SnapshotIdentitySchema>;

export const ObservationKindSchema = z.enum(["observed", "inferred", "curated"]);
export type ObservationKind = z.infer<typeof ObservationKindSchema>;

export const ClaimTypeSchema = z.enum([
  "fixture-content",
  "contract-shape",
  "curated-migration",
  "structural-difference",
  "consumer-usage",
  "potential-impact",
  "runtime-failure",
  "patch-verification",
  "unsupported-input",
]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

const EvidenceFields = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: IdentifierSchema,
  artifactDigest: Sha256Schema,
  claimType: ClaimTypeSchema,
  supportStatus: z.enum(["supported", "unsupported", "unknown"]),
  execution: z.enum(["not-applicable", "not-executed"]),
  location: z
    .strictObject({
      artifactPath: ArtifactPathSchema,
      jsonPointer: z
        .string()
        .max(1000)
        .refine((pointer) => /^(?:\/(?:[^~]|~[01])*)*$/.test(pointer), "Invalid JSON pointer")
        .optional(),
    })
    .readonly()
    .optional(),
};

/**
 * This schema validates reference shape and declared provenance, not truth.
 * Observed means a declared static observation, never a replay attestation.
 * Runtime evidence deliberately has no "executed" representation in Phase 1.
 */
export const EvidenceRefSchema = z
  .discriminatedUnion("observationKind", [
    z.strictObject({
      ...EvidenceFields,
      observationKind: z.literal("observed"),
      producerKind: z.enum(["fixture-validator", "deterministic-analysis"]),
    }),
    z.strictObject({
      ...EvidenceFields,
      observationKind: z.literal("inferred"),
      producerKind: z.enum(["model", "heuristic-analysis"]),
    }),
    z.strictObject({
      ...EvidenceFields,
      observationKind: z.literal("curated"),
      producerKind: z.literal("fixture-author"),
    }),
  ])
  .readonly();
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const FindingStatusSchema = z.enum([
  "STRUCTURAL_BREAK",
  "MATCHED_USAGE",
  "POTENTIAL_IMPACT",
  "REPRODUCED_FAILURE",
  "PATCH_VERIFIED",
  "UNVERIFIED",
  "NOT_APPLICABLE",
]);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

export const RunIdentitySchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  runId: IdentifierSchema,
  synthetic: z.literal(true),
  source: z.strictObject({
    kind: z.literal("pre-git-fixture"),
    treeDigest: Sha256Schema,
  }),
});
export type RunIdentity = z.infer<typeof RunIdentitySchema>;

export const RunPhaseSchema = z.enum(["NOT_STARTED", "ANALYSIS_ONLY", "STOPPED", "INDETERMINATE"]);
export type RunPhase = z.infer<typeof RunPhaseSchema>;

export const StopReasonSchema = z.enum([
  "UNSUPPORTED_INPUT",
  "INSUFFICIENT_EVIDENCE",
  "EXECUTION_NOT_IMPLEMENTED",
  "CAPABILITY_NOT_IMPLEMENTED",
  "FIXTURE_INVALID",
  "POLICY_BLOCKED",
  "CANCELLED",
  "BUDGET_EXHAUSTED",
  "INCONSISTENT_EVIDENCE",
]);
export type StopReason = z.infer<typeof StopReasonSchema>;

export const RunStateSchema = z.discriminatedUnion("phase", [
  z.strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    identity: RunIdentitySchema,
    phase: z.literal("NOT_STARTED"),
  }),
  z.strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    identity: RunIdentitySchema,
    phase: z.literal("ANALYSIS_ONLY"),
  }),
  z.strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    identity: RunIdentitySchema,
    phase: z.literal("STOPPED"),
    reason: StopReasonSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    identity: RunIdentitySchema,
    phase: z.literal("INDETERMINATE"),
    reason: StopReasonSchema,
  }),
]);
export type RunState = z.infer<typeof RunStateSchema>;

export const FIXTURE_DIGEST_POLICY = "sha256-raw-bytes;tree=sha256(sorted-path:sha256\\n)" as const;

export const FixtureManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    fixtureId: z.literal("mercurypay-synthetic-checkout"),
    synthetic: z.literal(true),
    provenance: z.literal("curated-synthetic-ground-truth"),
    description: z.string().trim().min(1),
    money: z.strictObject({ unit: z.literal("minor"), currency: z.literal("USD") }),
    contracts: z.strictObject({ v1: ArtifactRefSchema, v2: ArtifactRefSchema }),
    mocks: z.strictObject({ v1: ArtifactRefSchema, v2: ArtifactRefSchema }),
    businessCase: ArtifactRefSchema,
    assertions: ArtifactRefSchema,
    migrationMapping: ArtifactRefSchema,
    assertionIds: z.array(IdentifierSchema).min(1),
    treeDigest: Sha256Schema,
    digestPolicy: z.literal(FIXTURE_DIGEST_POLICY),
    testPolicy: z.strictObject({
      phase: z.literal("foundation-only"),
      execution: z.literal("not-started"),
      immutableInputs: z.array(ArtifactPathSchema).min(1),
      patchAllowedPaths: z.array(ArtifactPathSchema).min(1),
    }),
    phase4RequiredPins: z.tuple([
      z.literal("harness"),
      z.literal("runtime"),
      z.literal("dependencies"),
      z.literal("networkPolicy"),
    ]),
  })
  .superRefine((manifest, context) => {
    const refs = [
      manifest.contracts.v1,
      manifest.contracts.v2,
      manifest.mocks.v1,
      manifest.mocks.v2,
      manifest.businessCase,
      manifest.assertions,
      manifest.migrationMapping,
    ];
    for (const property of ["id", "path"] as const) {
      if (new Set(refs.map((ref) => ref[property])).size !== refs.length) {
        context.addIssue({ code: "custom", message: `Artifact ${property} values must be unique` });
      }
    }
    if (new Set(manifest.assertionIds).size !== manifest.assertionIds.length) {
      context.addIssue({
        code: "custom",
        message: "Assertion IDs must be unique",
        path: ["assertionIds"],
      });
    }
    const immutable = new Set(manifest.testPolicy.immutableInputs);
    if (immutable.size !== manifest.testPolicy.immutableInputs.length) {
      context.addIssue({ code: "custom", message: "Immutable input paths must be unique" });
    }
    if (refs.some((ref) => !immutable.has(ref.path))) {
      context.addIssue({ code: "custom", message: "Every artifact must be an immutable input" });
    }
    const patchPaths = manifest.testPolicy.patchAllowedPaths;
    if (
      new Set(patchPaths).size !== patchPaths.length ||
      patchPaths.some((path) => immutable.has(path))
    ) {
      context.addIssue({
        code: "custom",
        message: "Patch paths must be unique and exclude immutable inputs",
      });
    }
  });
export type FixtureManifest = z.infer<typeof FixtureManifestSchema>;
