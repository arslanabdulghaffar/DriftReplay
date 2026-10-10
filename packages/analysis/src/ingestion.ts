import { constants, type BigIntStats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, join, parse, resolve } from "node:path";

import { InputError } from "./errors.ts";
import { decodeUtf8 } from "./json.ts";

export { InputError } from "./errors.ts";

export const INGESTION_LIMITS = Object.freeze({
  requestedFiles: 2_000,
  sourceFiles: 256,
  contractBytes: 2 * 1024 * 1024,
  sourceFileBytes: 256 * 1024,
  sourceBytes: 10 * 1024 * 1024,
  mappingBytes: 256 * 1024,
  aggregateBytes: 25 * 1024 * 1024,
  timeMs: 30_000,
});

export type InputRole = "base-contract" | "candidate-contract" | "source" | "mapping";
export interface LocalSelection {
  readonly path: string;
  readonly role: InputRole;
}
export interface CapturedInput extends LocalSelection {
  readonly bytes: Uint8Array;
}
export interface CaptureOptions {
  readonly signal?: AbortSignal;
  readonly check?: () => void;
}

const rejectedDirectories = new Set([
  "node_modules",
  "out",
  "dist",
  "build",
  "generated",
  "coverage",
  "vendor",
]);
const roles = new Set<InputRole>(["base-contract", "candidate-contract", "source", "mapping"]);
const hasControl = (text: string): boolean =>
  Array.from(text).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );

/** Portable, normalized identity: slash-separated, case-preserved; case aliases are denied. */
export function validatePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 500 ||
    /[\\:%?#*<>|"]/.test(value) ||
    hasControl(value) ||
    /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value) ||
    new TextDecoder().decode(new TextEncoder().encode(value)) !== value ||
    value.normalize("NFC") !== value ||
    value
      .split("/")
      .some(
        (part) =>
          !part ||
          part.startsWith(".") ||
          part.endsWith(".") ||
          part !== part.trim() ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
          rejectedDirectories.has(part.toLowerCase()),
      )
  ) {
    throw new InputError("UNSAFE_PATH");
  }
  return value;
}

/** No user-declared digests, provenance, trust, or computed accessors cross this boundary. */
export function validateSelections(value: unknown): readonly LocalSelection[] {
  if (!Array.isArray(value) || value.length === 0) throw new InputError("INVALID_SELECTIONS");
  if (value.length > INGESTION_LIMITS.requestedFiles) throw new InputError("FILE_COUNT_LIMIT");
  let sources = 0;
  const paths = new Set<string>();
  const selections: LocalSelection[] = [];
  for (const entry of value as unknown[]) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(entry) as object | null)
    ) {
      throw new InputError("INVALID_SELECTION");
    }
    const fields = Object.getOwnPropertyDescriptors(entry);
    if (
      Reflect.ownKeys(entry).length !== 2 ||
      !fields.path ||
      !fields.role ||
      !("value" in fields.path) ||
      !("value" in fields.role)
    ) {
      throw new InputError("INVALID_SELECTION");
    }
    const path = validatePath(fields.path.value as unknown);
    const role: unknown = fields.role.value;
    if (typeof role !== "string" || !roles.has(role as InputRole)) {
      throw new InputError("INVALID_ROLE");
    }
    if (
      !(role === "source" ? /\.(?:ts|tsx|js|jsx)$/.test(path) : /\.json$/.test(path)) ||
      /(?:^|\/)[^/]*(?:\.generated|\.min|\.d)\.(?:ts|tsx|js|jsx)$/.test(path)
    ) {
      throw new InputError("UNSUPPORTED_EXTENSION");
    }
    const key = path.toLowerCase();
    if (paths.has(key)) throw new InputError("DUPLICATE_PATH");
    paths.add(key);
    if (role === "source" && ++sources > INGESTION_LIMITS.sourceFiles) {
      throw new InputError("SOURCE_COUNT_LIMIT");
    }
    selections.push(Object.freeze({ path, role: role as InputRole }));
  }
  return Object.freeze(selections.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
}

/** Experiment cardinality is stricter than the reusable explicit-file capture adapter. */
export function validateExperimentSelections(value: unknown): readonly LocalSelection[] {
  const selected = validateSelections(value);
  for (const role of ["base-contract", "candidate-contract"] as const) {
    if (selected.filter((entry) => entry.role === role).length !== 1) {
      throw new InputError("INVALID_EXPERIMENT_SELECTIONS");
    }
  }
  if (
    !selected.some((entry) => entry.role === "source") ||
    selected.filter((entry) => entry.role === "mapping").length > 1
  ) {
    throw new InputError("INVALID_EXPERIMENT_SELECTIONS");
  }
  return selected;
}

function sameIdentity(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode;
}

function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return (
    sameIdentity(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs
  );
}

/** Shared by readers and report writers; reject network namespaces before any filesystem call. */
export function validateRoot(root: unknown): string {
  if (
    typeof root !== "string" ||
    root.length > 4096 ||
    !isAbsolute(root) ||
    hasControl(root) ||
    /^[/\\]{2}/.test(root)
  ) {
    throw new InputError("INVALID_ROOT");
  }
  return resolve(root);
}

async function checkedDirectory(path: string): Promise<BigIntStats> {
  const info = await lstat(path, { bigint: true });
  if (info.isSymbolicLink()) throw new InputError("SYMLINK_DENIED");
  if (!info.isDirectory()) throw new InputError("NOT_DIRECTORY");
  return info;
}

/**
 * Explicit local files only. The root is a host-approved boundary, not hostile-tenant isolation.
 * Metadata and no-follow checks narrow TOCTOU races; the OS cannot make the whole walk atomic.
 * Byte arrays are owned copies; downstream public APIs must copy before trusting mutable callers.
 */
export async function captureLocalInputs(
  root: string,
  selections: readonly LocalSelection[],
  options: CaptureOptions = {},
): Promise<readonly CapturedInput[]> {
  const selected = validateSelections(selections);
  const approvedRoot = validateRoot(root);
  const deadline = performance.now() + INGESTION_LIMITS.timeMs;
  const check = () => {
    if (options.signal?.aborted) throw new InputError("CANCELLED");
    if (performance.now() > deadline) throw new InputError("TIME_LIMIT");
    options.check?.();
  };
  try {
    check();
    const ancestors: { path: string; info: BigIntStats }[] = [];
    let ancestor = parse(approvedRoot).root;
    ancestors.push({ path: ancestor, info: await checkedDirectory(ancestor) });
    for (const part of approvedRoot.slice(ancestor.length).split(/[/\\]/).filter(Boolean)) {
      check();
      ancestor = join(ancestor, part);
      ancestors.push({ path: ancestor, info: await checkedDirectory(ancestor) });
    }
    const rootInfo = ancestors.at(-1)!.info;
    const captured: CapturedInput[] = [];
    const identities = new Set<string>();
    let aggregate = 0;
    let sourceBytes = 0;
    for (const selection of selected) {
      check();
      const parts = selection.path.split("/");
      const directories = [...ancestors];
      let directory = approvedRoot;
      for (const part of parts.slice(0, -1)) {
        check();
        directory = join(directory, part);
        const info = await checkedDirectory(directory);
        if (info.dev !== rootInfo.dev) throw new InputError("NESTED_MOUNT_DENIED");
        directories.push({ path: directory, info });
      }
      const path = join(approvedRoot, ...parts);
      const before = await lstat(path, { bigint: true });
      if (before.isSymbolicLink()) throw new InputError("SYMLINK_DENIED");
      if (!before.isFile()) throw new InputError("NOT_REGULAR_FILE");
      if (before.dev !== rootInfo.dev) throw new InputError("NESTED_MOUNT_DENIED");
      const identity = `${before.dev}:${before.ino}`;
      if (identities.has(identity)) throw new InputError("DUPLICATE_FILE_IDENTITY");
      identities.add(identity);
      const max =
        selection.role === "source"
          ? INGESTION_LIMITS.sourceFileBytes
          : selection.role === "mapping"
            ? INGESTION_LIMITS.mappingBytes
            : INGESTION_LIMITS.contractBytes;
      if (before.size > BigInt(max)) throw new InputError("FILE_SIZE_LIMIT");
      aggregate += Number(before.size);
      if (aggregate > INGESTION_LIMITS.aggregateBytes) throw new InputError("SNAPSHOT_SIZE_LIMIT");
      if (selection.role === "source") {
        sourceBytes += Number(before.size);
        if (sourceBytes > INGESTION_LIMITS.sourceBytes) throw new InputError("SOURCE_SIZE_LIMIT");
      }
      const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const opened = await handle.stat({ bigint: true });
        if (!opened.isFile() || !sameFile(before, opened)) throw new InputError("FILE_MUTATED");
        // Read no more than the checked size plus one: growth is detected without unbounded I/O.
        const buffer = new Uint8Array(Number(before.size) + 1);
        let length = 0;
        while (length < buffer.length) {
          check();
          const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
          if (!bytesRead) break;
          length += bytesRead;
        }
        check();
        const after = await handle.stat({ bigint: true });
        const afterPath = await lstat(path, { bigint: true });
        if (
          length !== Number(before.size) ||
          !sameFile(before, after) ||
          !sameFile(before, afterPath) ||
          !afterPath.isFile() ||
          afterPath.isSymbolicLink()
        ) {
          throw new InputError("FILE_MUTATED");
        }
        for (const parent of directories) {
          check();
          const current = await checkedDirectory(parent.path);
          if (!sameIdentity(parent.info, current)) throw new InputError("DIRECTORY_MUTATED");
        }
        const bytes = buffer.slice(0, length);
        decodeUtf8(bytes);
        captured.push(Object.freeze({ ...selection, bytes }));
      } finally {
        await handle.close();
      }
    }
    check();
    return Object.freeze(captured);
  } catch (error) {
    if (error instanceof InputError) throw error;
    // Node errors contain absolute private paths. Expose only a reviewed, stable code.
    throw new InputError("LOCAL_READ_FAILED");
  }
}
