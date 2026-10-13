import { z } from "zod";
import { canonical, identity, sha256 } from "../../analysis/src/identity.ts";
import { validateExperimentSelections, type CapturedInput } from "../../analysis/src/ingestion.ts";
import { POLICY, POLICY_HASH } from "../../analysis/src/policy.ts";

export const DURABLE_ENGINE = Object.freeze({
  name: "driftreplay-openapi-subset" as const,
  version: "0.2.0" as const,
  typescript: "5.9.3" as const,
});

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const workspace = z
  .string()
  .uuid()
  .regex(/^[a-f0-9-]+$/);
const entry = z.strictObject({
  path: z.string().min(1).max(500),
  role: z.enum(["base-contract", "candidate-contract", "source", "mapping"]),
  sha256: digest,
  byteLength: z.number().int().min(0).max(POLICY.maxContractBytes),
});
const manifestSchema = z.strictObject({
  workspaceId: workspace,
  manifest: z
    .array(entry)
    .min(3)
    .max(POLICY.maxSourceFiles + 3),
  engine: z.strictObject({
    name: z.literal(DURABLE_ENGINE.name),
    version: z.literal(DURABLE_ENGINE.version),
    typescript: z.literal(DURABLE_ENGINE.typescript),
  }),
  policyId: z.literal("local-analysis-v2"),
  policyHash: z.literal(POLICY_HASH),
  inputSetDigest: digest,
  requestKey: digest,
});
export type InputManifest = z.infer<typeof manifestSchema>;
export type ManifestEntry = InputManifest["manifest"][number];

export class ManifestError extends Error {
  readonly code = "INVALID_MANIFEST";
  constructor() {
    super("INVALID_MANIFEST");
    this.name = "ManifestError";
  }
}

// Reject accessors before schema evaluation. This API accepts data, never caller behavior.
function plainData(value: unknown, depth = 0): void {
  if (depth > 6) throw new ManifestError();
  if (value === null || typeof value !== "object") return;
  if (
    !Array.isArray(value) &&
    ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)
  )
    throw new ManifestError();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length > POLICY.maxSourceFiles + 4) throw new ManifestError();
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") throw new ManifestError();
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor)) throw new ManifestError();
    plainData(descriptor.value as unknown, depth + 1);
  }
}

function validateEntries(entries: readonly ManifestEntry[]): void {
  const selected = validateExperimentSelections(entries.map(({ path, role }) => ({ path, role })));
  if (selected.some((item, index) => item.path !== entries[index]!.path)) throw new ManifestError();
  let total = 0,
    sourceTotal = 0;
  for (const item of entries) {
    const limit =
      item.role === "source"
        ? POLICY.maxSourceBytes
        : item.role === "mapping"
          ? POLICY.maxMappingBytes
          : POLICY.maxContractBytes;
    if (item.byteLength > limit) throw new ManifestError();
    total += item.byteLength;
    if (item.role === "source") sourceTotal += item.byteLength;
  }
  if (total > POLICY.maxTotalBytes || sourceTotal > POLICY.maxCombinedSourceBytes) {
    throw new ManifestError();
  }
}

function identities(workspaceId: string, manifest: readonly ManifestEntry[]) {
  const scope = {
    schemaVersion: "durable-input-v1",
    workspaceId,
    mode: "local-static-analysis",
    authority: "single-owner-approved-local",
    engine: DURABLE_ENGINE,
    policyId: POLICY.id,
    policyHash: POLICY_HASH,
    manifest,
  };
  const inputSetDigest = identity(scope);
  return {
    inputSetDigest,
    requestKey: identity({ ...scope, schemaVersion: "durable-request-v1", inputSetDigest }),
  };
}

/** The workspace comes from the local coordinator; this function is not authorization. */
export function makeManifest(
  workspaceId: string,
  captured: readonly CapturedInput[],
): InputManifest {
  try {
    workspace.parse(workspaceId);
    if (!Array.isArray(captured) || captured.length > POLICY.maxSourceFiles + 3)
      throw new ManifestError();
    const descriptors = Object.getOwnPropertyDescriptors(captured);
    const manifest: ManifestEntry[] = [];
    for (let index = 0; index < captured.length; index++) {
      const value = descriptors[String(index)];
      if (!value || !("value" in value)) throw new ManifestError();
      const item: unknown = value.value;
      if (
        item === null ||
        typeof item !== "object" ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(item) as object | null)
      )
        throw new ManifestError();
      const fields = Object.getOwnPropertyDescriptors(item);
      if (
        Reflect.ownKeys(item).length !== 3 ||
        !["path", "role", "bytes"].every((key) => fields[key] && "value" in fields[key]!)
      )
        throw new ManifestError();
      const bytes: unknown = fields.bytes!.value;
      if (
        !(bytes instanceof Uint8Array) ||
        !(bytes.buffer instanceof ArrayBuffer) ||
        bytes.byteLength > POLICY.maxContractBytes
      )
        throw new ManifestError();
      const copy = new Uint8Array(bytes);
      manifest.push(
        entry.parse({
          path: fields.path!.value,
          role: fields.role!.value,
          sha256: sha256(copy),
          byteLength: copy.byteLength,
        }),
      );
    }
    manifest.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    validateEntries(manifest);
    return verifyManifest({
      workspaceId,
      manifest,
      engine: DURABLE_ENGINE,
      policyId: POLICY.id,
      policyHash: POLICY_HASH,
      ...identities(workspaceId, manifest),
    });
  } catch {
    throw new ManifestError();
  }
}

/** Validates metadata and recomputes identities. Blob bytes must separately pass CAS reads. */
export function verifyManifest(value: unknown, expectedWorkspaceId?: string): InputManifest {
  try {
    plainData(value);
    const result = manifestSchema.parse(value);
    if (expectedWorkspaceId !== undefined && result.workspaceId !== expectedWorkspaceId)
      throw new ManifestError();
    validateEntries(result.manifest);
    const expected = identities(result.workspaceId, result.manifest);
    if (
      expected.inputSetDigest !== result.inputSetDigest ||
      expected.requestKey !== result.requestKey
    )
      throw new ManifestError();
    // Return an independent, deeply frozen JSON value; no mutable caller arrays are retained.
    const frozen = JSON.parse(canonical(result)) as InputManifest;
    frozen.manifest.forEach(Object.freeze);
    Object.freeze(frozen.manifest);
    Object.freeze(frozen.engine);
    return Object.freeze(frozen);
  } catch {
    throw new ManifestError();
  }
}
