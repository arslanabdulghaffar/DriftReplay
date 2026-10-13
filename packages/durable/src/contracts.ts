import type { InputRole } from "../../analysis/src/ingestion.ts";

export const RUN_STATES = [
  "QUEUED",
  "CLAIMED",
  "ANALYZING",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "ANALYSIS_COMPLETE",
  "STOPPED",
  "INDETERMINATE",
] as const;
export type RunState = (typeof RUN_STATES)[number];
export const TERMINAL_STATES: readonly RunState[] = [
  "CANCELLED",
  "ANALYSIS_COMPLETE",
  "STOPPED",
  "INDETERMINATE",
];
export interface ManifestEntry {
  path: string;
  role: InputRole;
  sha256: string;
  byteLength: number;
}
export interface ArtifactRef {
  sha256: string;
  byteLength: number;
}
export interface RunLimits {
  maxAttempts: number;
  computeMs: number;
  outputBytes: number;
  durationMs: number;
  leaseMs: number;
}
export const DEFAULT_LIMITS: Readonly<RunLimits> = Object.freeze({
  maxAttempts: 3,
  computeMs: 120_000,
  outputBytes: 8 * 1024 * 1024,
  durationMs: 120_000,
  leaseMs: 5_000,
});
export interface SubmitRequest {
  manifest: readonly ManifestEntry[];
  inputSetDigest: string;
  requestKey: string;
  engine: { name: string; version: string; typescript: string };
  policyId: string;
  policyHash: string;
  limits?: Partial<RunLimits>;
  idempotencyToken?: string;
}
export interface RunRecord {
  runId: string;
  workspaceId: string;
  requestKey: string;
  inputSetDigest: string;
  state: RunState;
  stateVersion: number;
  engine: { name: string; version: string; typescript: string };
  policyId: string;
  policyHash: string;
  limits: RunLimits;
  createdAt: string;
  updatedAt: string;
  deadline: string;
  finishedAt: string | null;
  cancelRequestedAt: string | null;
  resultDigest: string | null;
  failureCode: string | null;
  attempts: number;
  generation: number;
}
export interface LeaseClaim {
  runId: string;
  workspaceId: string;
  ownerToken: string;
  generation: number;
  attemptId: string;
  stateVersion: number;
  expiresAt: string;
  limits: RunLimits;
}
export interface StoredArtifact extends ArtifactRef {
  role: "result" | "report" | "diagnostic";
}
export interface AuditEvent {
  sequence: number;
  previousState: RunState | null;
  state: RunState;
  stateVersion: number;
  actor: "operator" | "worker" | "coordinator";
  reason: string;
  at: string;
  generation: number | null;
}
export interface BudgetRecord {
  maxRuns: number;
  maxWorkers: number;
  maxBytes: number;
  maxComputeMs: number;
  runCount: number;
  activeWorkers: number;
  reservedBytes: number;
  consumedBytes: number;
  reservedComputeMs: number;
  consumedComputeMs: number;
}
export class DurableError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "DurableError";
    this.code = /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : "DURABLE_FAILURE";
    this.message = this.code;
  }
}
export function validateRunId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    throw new DurableError("INVALID_RUN_ID");
  return value;
}
export function validateDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value))
    throw new DurableError("INVALID_DIGEST");
  return value;
}
export function checkedLimits(input: Partial<RunLimits> = {}): RunLimits {
  if (Object.keys(input).some((key) => !(key in DEFAULT_LIMITS)))
    throw new DurableError("INVALID_LIMITS");
  const result = { ...DEFAULT_LIMITS, ...input };
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof RunLimits)[]) {
    if (!Number.isSafeInteger(result[key]) || result[key] < 1 || result[key] > DEFAULT_LIMITS[key])
      throw new DurableError("INVALID_LIMITS");
  }
  return result;
}
export const TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
  QUEUED: ["CLAIMED", "CANCELLED", "STOPPED", "INDETERMINATE"],
  CLAIMED: ["ANALYZING", "CANCEL_REQUESTED", "QUEUED", "STOPPED", "INDETERMINATE"],
  ANALYZING: ["ANALYSIS_COMPLETE", "CANCEL_REQUESTED", "QUEUED", "STOPPED", "INDETERMINATE"],
  CANCEL_REQUESTED: ["CANCELLED"],
  CANCELLED: [],
  ANALYSIS_COMPLETE: [],
  STOPPED: [],
  INDETERMINATE: [],
};
export function transition(from: RunState, to: RunState): RunState {
  if (!TRANSITIONS[from].includes(to)) throw new DurableError("INVALID_TRANSITION");
  return to;
}
