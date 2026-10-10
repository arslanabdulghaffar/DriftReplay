import { describe, expect, it } from "vitest";

import { assessFoundationClaim, type EvidenceRef } from "./index.js";
import { sha256Bytes } from "./digests.js";

const baseEvidence: EvidenceRef = {
  schemaVersion: "1",
  id: "test-only-hypothesis",
  artifactDigest: sha256Bytes(new TextEncoder().encode("policy-test-content")),
  producerKind: "model",
  observationKind: "inferred",
  claimType: "potential-impact",
  supportStatus: "unknown",
  execution: "not-executed",
};

describe("foundation claim guard, not a runtime verification engine", () => {
  it.each(["REPRODUCED_FAILURE", "PATCH_VERIFIED"])("never establishes %s", (requestedStatus) => {
    const cases = [
      [],
      [baseEvidence],
      [{ ...baseEvidence, supportStatus: "unsupported" }],
      [
        {
          ...baseEvidence,
          producerKind: "fixture-validator",
          observationKind: "observed",
          supportStatus: "supported",
        },
      ],
      [
        {
          ...baseEvidence,
          producerKind: "fixture-author",
          observationKind: "curated",
          supportStatus: "supported",
        },
      ],
    ];
    for (const evidence of cases) {
      expect(assessFoundationClaim({ schemaVersion: "1", requestedStatus, evidence })).toEqual({
        decision: "denied",
        status: "UNVERIFIED",
        requestedStatus,
        reason: "EXECUTION_NOT_IMPLEMENTED",
      });
    }
  });

  it("does not accept a model-authored operational status on its own", () => {
    expect(
      assessFoundationClaim({
        schemaVersion: "1",
        requestedStatus: "POTENTIAL_IMPACT",
        evidence: [{ ...baseEvidence, supportStatus: "supported" }],
      }),
    ).toMatchObject({
      decision: "denied",
      status: "UNVERIFIED",
      reason: "MODEL_CANNOT_ESTABLISH_STATUS",
    });
  });

  it("does not equate a declared static observation with an implemented analysis", () => {
    expect(
      assessFoundationClaim({
        schemaVersion: "1",
        requestedStatus: "STRUCTURAL_BREAK",
        evidence: [
          {
            ...baseEvidence,
            producerKind: "deterministic-analysis",
            observationKind: "observed",
            supportStatus: "supported",
            claimType: "structural-difference",
          },
        ],
      }),
    ).toMatchObject({
      decision: "denied",
      status: "UNVERIFIED",
      reason: "CAPABILITY_NOT_IMPLEMENTED",
    });
  });

  it.each(["MATCHED_USAGE", "POTENTIAL_IMPACT", "NOT_APPLICABLE"])(
    "rejects unsupported evidence for %s",
    (requestedStatus) => {
      expect(
        assessFoundationClaim({ schemaVersion: "1", requestedStatus, evidence: [baseEvidence] }),
      ).toMatchObject({
        decision: "denied",
        status: "UNVERIFIED",
        reason: "INSUFFICIENT_EVIDENCE",
      });
    },
  );

  it.each([null, {}, { schemaVersion: "2" }, { status: "PATCH_VERIFIED" }])(
    "fails closed for malformed input %j",
    (input) => {
      expect(assessFoundationClaim(input)).toEqual({
        decision: "denied",
        status: "UNVERIFIED",
        reason: "INVALID_INPUT",
      });
    },
  );

  it("admits an explicitly unverified report without fabricating supporting evidence", () => {
    expect(
      assessFoundationClaim({ schemaVersion: "1", requestedStatus: "UNVERIFIED", evidence: [] }),
    ).toEqual({ decision: "admissible", status: "UNVERIFIED", evidenceIds: [] });
  });
});
