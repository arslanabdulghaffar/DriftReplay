import { z } from "zod";

import { EvidenceRefSchema, FindingStatusSchema, type FindingStatus } from "./schemas.js";

export const FoundationClaimSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  requestedStatus: FindingStatusSchema,
  evidence: z.array(EvidenceRefSchema).max(100),
});

export type FoundationClaimDecision =
  | { decision: "admissible"; status: "UNVERIFIED"; evidenceIds: string[] }
  | {
      decision: "denied";
      status: "UNVERIFIED";
      requestedStatus?: FindingStatus;
      reason:
        | "INVALID_INPUT"
        | "EXECUTION_NOT_IMPLEMENTED"
        | "MODEL_CANNOT_ESTABLISH_STATUS"
        | "INSUFFICIENT_EVIDENCE"
        | "CAPABILITY_NOT_IMPLEMENTED";
    };

/**
 * An intentionally restrictive Phase 1 guard, not a verification engine.
 * Syntactically valid references are not authenticated observations. No active
 * finding can be established until later deterministic predicates exist.
 */
export function assessFoundationClaim(input: unknown): FoundationClaimDecision {
  const parsed = FoundationClaimSchema.safeParse(input);
  if (!parsed.success) {
    return { decision: "denied", status: "UNVERIFIED", reason: "INVALID_INPUT" };
  }

  const { requestedStatus, evidence } = parsed.data;
  if (requestedStatus === "UNVERIFIED") {
    return {
      decision: "admissible",
      status: "UNVERIFIED",
      evidenceIds: evidence.map((item) => item.id),
    };
  }

  const denied = (reason: Exclude<FoundationClaimDecision, { decision: "admissible" }>["reason"]) =>
    ({ decision: "denied", status: "UNVERIFIED", requestedStatus, reason }) as const;

  if (requestedStatus === "REPRODUCED_FAILURE" || requestedStatus === "PATCH_VERIFIED") {
    return denied("EXECUTION_NOT_IMPLEMENTED");
  }
  if (evidence.length === 0 || evidence.every((item) => item.supportStatus !== "supported")) {
    return denied("INSUFFICIENT_EVIDENCE");
  }
  if (evidence.every((item) => item.producerKind === "model")) {
    return denied("MODEL_CANNOT_ESTABLISH_STATUS");
  }
  return denied("CAPABILITY_NOT_IMPLEMENTED");
}
