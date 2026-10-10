import { createHash } from "node:crypto";

import { ArtifactPathSchema, Sha256Schema } from "./schemas.js";

/** Node-only: hash exact file bytes without parsing or newline normalization. */
export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Hash sorted relative-path:lowercase-sha256 records, each ending in one LF.
 * Paths use code-unit ordering, not locale-dependent sorting. This digest does
 * not authenticate an author, and callers must hash artifact bytes themselves.
 * Do not include the manifest in its own artifact tree.
 */
export function treeDigest(artifacts: ReadonlyArray<{ path: string; sha256: string }>): string {
  const entries = artifacts.map((artifact) => ({
    path: ArtifactPathSchema.parse(artifact.path),
    sha256: Sha256Schema.parse(artifact.sha256),
  }));
  if (entries.length === 0) {
    throw new Error("An artifact tree must contain at least one artifact");
  }
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    throw new Error("An artifact tree cannot contain duplicate paths");
  }
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const serialized = entries.map((entry) => `${entry.path}:${entry.sha256}\n`).join("");
  return sha256Bytes(new TextEncoder().encode(serialized));
}
