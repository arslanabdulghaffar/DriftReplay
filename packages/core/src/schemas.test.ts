import { describe, expect, it } from "vitest";

import {
  ArtifactPathSchema,
  EvidenceRefSchema,
  FindingStatusSchema,
  FIXTURE_DIGEST_POLICY,
  FixtureManifestSchema,
  RunIdentitySchema,
  RunStateSchema,
  SnapshotIdentitySchema,
} from "./index.js";
import { sha256Bytes } from "./digests.js";

const testDigest = sha256Bytes(new TextEncoder().encode("schema-test-only-content"));

function manifestInput() {
  const artifact = (id: string) => ({ id, path: `test-artifacts/${id}.json`, sha256: testDigest });
  const refs = {
    contracts: { v1: artifact("contract-v1"), v2: artifact("contract-v2") },
    mocks: { v1: artifact("mock-v1"), v2: artifact("mock-v2") },
    businessCase: artifact("business-case"),
    assertions: artifact("assertions"),
    migrationMapping: artifact("mapping"),
  };
  return {
    schemaVersion: "1",
    fixtureId: "mercurypay-synthetic-checkout",
    synthetic: true,
    provenance: "curated-synthetic-ground-truth",
    description: "Schema test input only; not a validated fixture manifest.",
    money: { unit: "minor", currency: "USD" },
    ...refs,
    assertionIds: ["checkout-completes", "amount-preserved"],
    treeDigest: testDigest,
    digestPolicy: FIXTURE_DIGEST_POLICY,
    testPolicy: {
      phase: "foundation-only",
      execution: "not-started",
      immutableInputs: [
        refs.contracts.v1.path,
        refs.contracts.v2.path,
        refs.mocks.v1.path,
        refs.mocks.v2.path,
        refs.businessCase.path,
        refs.assertions.path,
        refs.migrationMapping.path,
      ],
      patchAllowedPaths: ["apps/demo-shop/src/provider-adapter.ts"],
    },
    phase4RequiredPins: ["harness", "runtime", "dependencies", "networkPolicy"],
  };
}

describe("versioned snapshot and evidence boundaries", () => {
  it("accepts explicitly synthetic snapshot metadata without pretending to verify its digest", () => {
    const input = {
      schemaVersion: "1",
      sourceKind: "openapi-contract",
      resolvedVersion: "v1",
      contentDigest: testDigest,
      synthetic: true,
      provenance: "curated-synthetic-ground-truth",
    };
    expect(SnapshotIdentitySchema.parse(input)).toEqual(input);
    expect(SnapshotIdentitySchema.safeParse({ ...input, schemaVersion: "2" }).success).toBe(false);
    expect(SnapshotIdentitySchema.safeParse({ ...input, synthetic: false }).success).toBe(false);
    expect(
      SnapshotIdentitySchema.safeParse({ ...input, contentDigest: "not-a-digest" }).success,
    ).toBe(false);
    expect(SnapshotIdentitySchema.safeParse({ ...input, gitSha: testDigest }).success).toBe(false);
  });

  it("keeps declared static observation separate from a model inference", () => {
    const input = {
      schemaVersion: "1",
      id: "test-observation",
      artifactDigest: testDigest,
      producerKind: "fixture-validator",
      observationKind: "observed",
      claimType: "contract-shape",
      supportStatus: "supported",
      execution: "not-applicable",
      location: { artifactPath: "contracts/v1.json", jsonPointer: "/paths/~1v1~1charges" },
    };
    const evidence = EvidenceRefSchema.parse(input);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.location)).toBe(true);
    expect(EvidenceRefSchema.safeParse({ ...input, producerKind: "model" }).success).toBe(false);
    expect(
      EvidenceRefSchema.safeParse({ ...input, producerKind: "model", observationKind: "inferred" })
        .success,
    ).toBe(true);
    expect(EvidenceRefSchema.safeParse({ ...input, execution: "executed" }).success).toBe(false);
    expect(EvidenceRefSchema.safeParse({ ...input, verified: true }).success).toBe(false);
    expect(
      EvidenceRefSchema.safeParse({
        ...input,
        location: { artifactPath: "contracts/v1.json", jsonPointer: "/invalid~2escape" },
      }).success,
    ).toBe(false);
  });

  it("defines exactly the seven accepted finding status names", () => {
    expect(FindingStatusSchema.options).toEqual([
      "STRUCTURAL_BREAK",
      "MATCHED_USAGE",
      "POTENTIAL_IMPACT",
      "REPRODUCED_FAILURE",
      "PATCH_VERIFIED",
      "UNVERIFIED",
      "NOT_APPLICABLE",
    ]);
    expect(FindingStatusSchema.safeParse("SUCCESS").success).toBe(false);
  });

  it("uses a pre-Git tree digest and requires a reason for stopped or indeterminate states", () => {
    const identity = {
      schemaVersion: "1",
      runId: "test-run-not-executed",
      synthetic: true,
      source: { kind: "pre-git-fixture", treeDigest: testDigest },
    };
    expect(RunIdentitySchema.safeParse(identity).success).toBe(true);
    expect(
      RunIdentitySchema.safeParse({ ...identity, source: { kind: "git", commitSha: testDigest } })
        .success,
    ).toBe(false);
    const state = { schemaVersion: "1", identity, phase: "NOT_STARTED" };
    expect(RunStateSchema.safeParse(state).success).toBe(true);
    expect(RunStateSchema.safeParse({ ...state, phase: "STOPPED" }).success).toBe(false);
    expect(
      RunStateSchema.safeParse({
        ...state,
        phase: "INDETERMINATE",
        reason: "INSUFFICIENT_EVIDENCE",
      }).success,
    ).toBe(true);
    expect(RunStateSchema.safeParse({ ...state, phase: "PATCH_VERIFIED" }).success).toBe(false);
  });
});

describe("fixture manifest metadata", () => {
  it("accepts the foundation policy while leaving byte verification to fixture validation", () => {
    expect(FixtureManifestSchema.safeParse(manifestInput()).success).toBe(true);
  });

  it("rejects unknown fields, schema versions, and implied completed executions", () => {
    const input = manifestInput();
    expect(FixtureManifestSchema.safeParse({ ...input, schemaVersion: "2" }).success).toBe(false);
    expect(FixtureManifestSchema.safeParse({ ...input, baseline: "PASS" }).success).toBe(false);
    expect(
      FixtureManifestSchema.safeParse({
        ...input,
        testPolicy: { ...input.testPolicy, execution: "passed" },
      }).success,
    ).toBe(false);
  });

  it("rejects aliases or missing immutable inputs and duplicate assertion IDs", () => {
    const input = manifestInput();
    expect(
      FixtureManifestSchema.safeParse({
        ...input,
        contracts: { v1: input.contracts.v1, v2: input.contracts.v1 },
      }).success,
    ).toBe(false);
    expect(
      FixtureManifestSchema.safeParse({
        ...input,
        testPolicy: { ...input.testPolicy, immutableInputs: [input.businessCase.path] },
      }).success,
    ).toBe(false);
    expect(
      FixtureManifestSchema.safeParse({ ...input, assertionIds: ["duplicate", "duplicate"] })
        .success,
    ).toBe(false);
  });

  it("rejects a policy that allows patching a fixture artifact", () => {
    const input = manifestInput();
    expect(
      FixtureManifestSchema.safeParse({
        ...input,
        testPolicy: { ...input.testPolicy, patchAllowedPaths: [input.assertions.path] },
      }).success,
    ).toBe(false);
  });
});

describe("artifact paths", () => {
  it.each([
    "../secret",
    "/absolute/path",
    "A:/absolute/path",
    "nested/../secret",
    "nested/./file",
    "nested//file",
    "nested\\file",
    "https://example.invalid/spec.json",
    "nested/%2e%2e/secret",
    "file.json?query",
    "file.json\n",
    "nested/file.",
    "nested/file ",
    "nested/CON.json",
  ])("rejects unsafe reference %j", (path) => {
    expect(ArtifactPathSchema.safeParse(path).success).toBe(false);
  });

  it("accepts the relative slash representation on Windows and POSIX", () => {
    expect(ArtifactPathSchema.parse("examples/fixtures/mercurypay/contracts/v1.openapi.json")).toBe(
      "examples/fixtures/mercurypay/contracts/v1.openapi.json",
    );
  });
});
