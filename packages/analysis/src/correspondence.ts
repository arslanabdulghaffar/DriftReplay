import { z } from "zod";
import { InputError } from "./errors.ts";
import { CorrespondenceSchema } from "./model.ts";
import { sha256 } from "./identity.ts";
import { decodeUtf8, parseBoundedJson } from "./json.ts";

export const CURATED_PINS = Object.freeze({
  base: "d07ccd275971286eb7b702b2f0a8c86c2f69a502370e3a84e0f6997b66fbd164",
  candidate: "8d9d56cfaafef102a4064cd0a44fbeaf17a6a8f2ed196f5d7f953c7a1d57531e",
  mapping: "e1494197b575503c48681ea4188a2b70c8631e9742eeee343136f1741db5456f",
});
const endpoint = z.strictObject({ contractId: z.string(), pointer: z.string().max(4096) });
const MappingSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  synthetic: z.literal(true),
  provenance: z.literal("curated-synthetic-ground-truth"),
  description: z.string(),
  mappings: z
    .array(
      z.strictObject({
        id: z.string(),
        kind: z.enum(["operation", "request-property"]),
        from: endpoint,
        to: endpoint,
      }),
    )
    .max(32),
});

export function resolvePointer(document: unknown, pointer: string): unknown {
  if (!pointer.startsWith("/") || /~(?![01])/.test(pointer))
    throw new InputError("INVALID_POINTER");
  let node = document;
  for (const part of pointer.slice(1).split("/")) {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
    if (node === null || typeof node !== "object" || !Object.hasOwn(node, key))
      throw new InputError("INVALID_POINTER");
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

export function checkCorrespondence(
  mappingBytes: Uint8Array,
  baseBytes: Uint8Array,
  candidateBytes: Uint8Array,
  check: () => void = () => {},
) {
  const hashes = {
    mapping: sha256(mappingBytes),
    base: sha256(baseBytes),
    candidate: sha256(candidateBytes),
  };
  if (
    hashes.base !== CURATED_PINS.base ||
    hashes.candidate !== CURATED_PINS.candidate ||
    hashes.mapping !== CURATED_PINS.mapping
  ) {
    throw new InputError("UNAPPROVED_CURATED_MAPPING");
  }
  const value = parseBoundedJson(decodeUtf8(mappingBytes), check);
  const base = parseBoundedJson(decodeUtf8(baseBytes), check);
  const candidate = parseBoundedJson(decodeUtf8(candidateBytes), check);
  const parsed = MappingSchema.safeParse(value);
  if (!parsed.success) throw new InputError("INVALID_MAPPING");
  const ids = new Set<string>();
  return parsed.data.mappings.map((item) => {
    if (
      ids.has(item.id) ||
      item.from.contractId !== "mercurypay-synthetic-contract-v1" ||
      item.to.contractId !== "mercurypay-synthetic-contract-v2"
    )
      throw new InputError("INVALID_MAPPING");
    ids.add(item.id);
    resolvePointer(base, item.from.pointer);
    resolvePointer(candidate, item.to.pointer);
    return CorrespondenceSchema.parse({
      id: item.id,
      kind: item.kind,
      provenance: "curated",
      basePointer: item.from.pointer,
      candidatePointer: item.to.pointer,
      mappingDigest: hashes.mapping,
      baseDigest: hashes.base,
      candidateDigest: hashes.candidate,
    });
  });
}
