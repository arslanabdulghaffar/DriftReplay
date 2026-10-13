import { randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { link, lstat, mkdir, open, opendir, unlink, type FileHandle } from "node:fs/promises";
import { join, parse } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { sha256 } from "../../analysis/src/identity.ts";
import { validateRoot } from "../../analysis/src/ingestion.ts";

export interface ArtifactRef {
  readonly sha256: string;
  readonly byteLength: number;
}
export interface StoredArtifact extends ArtifactRef {
  readonly createdAtMs: number;
}
export const ARTIFACT_LIMITS = Object.freeze({
  bytes: 128 * 1024 * 1024,
  entries: 4096,
  blobBytes: 4 * 1024 * 1024,
});
export class ArtifactError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ArtifactError";
    this.code = code;
  }
}
interface Ancestor {
  path: string;
  info: BigIntStats;
}
interface Limits {
  bytes?: number;
  entries?: number;
  lockWaitMs?: number;
}
const isCode = (error: unknown, code: string) =>
  typeof error === "object" && error !== null && "code" in error && error.code === code;
const sameIdentity = (a: BigIntStats, b: BigIntStats) =>
  a.dev === b.dev && a.ino === b.ino && a.mode === b.mode;
const sameFile = (a: BigIntStats, b: BigIntStats) =>
  sameIdentity(a, b) &&
  a.size === b.size &&
  a.mtimeNs === b.mtimeNs &&
  a.ctimeNs === b.ctimeNs &&
  a.nlink === b.nlink;
const digestPattern = /^[a-f0-9]{64}$/;

/** Private single-owner filesystem CAS. PostgreSQL references/authorization belong to its caller. */
export class ArtifactStore {
  readonly root: string;
  readonly #limits: Required<Limits>;
  #ancestors: Ancestor[] = [];
  constructor(root: string, limits: Limits = {}) {
    try {
      this.root = validateRoot(root);
    } catch {
      throw new ArtifactError("CAS_UNSAFE_ROOT");
    }
    this.#limits = {
      bytes: limits.bytes ?? ARTIFACT_LIMITS.bytes,
      entries: limits.entries ?? ARTIFACT_LIMITS.entries,
      lockWaitMs: limits.lockWaitMs ?? 5000,
    };
    if (
      !Number.isInteger(this.#limits.bytes) ||
      this.#limits.bytes < 1 ||
      this.#limits.bytes > ARTIFACT_LIMITS.bytes ||
      !Number.isInteger(this.#limits.entries) ||
      this.#limits.entries < 1 ||
      this.#limits.entries > ARTIFACT_LIMITS.entries ||
      !Number.isInteger(this.#limits.lockWaitMs) ||
      this.#limits.lockWaitMs < 0 ||
      this.#limits.lockWaitMs > 5000
    )
      throw new ArtifactError("CAS_INVALID_LIMITS");
  }

  async initialize(): Promise<void> {
    await this.#safe(async () => {
      if (this.#ancestors.length) {
        await this.#checkAncestors();
        return;
      }
      let path = parse(this.root).root;
      const ancestors: Ancestor[] = [{ path, info: await this.#directory(path) }];
      for (const part of this.root.slice(path.length).split(/[/\\]/).filter(Boolean)) {
        path = join(path, part);
        try {
          await mkdir(path, { mode: 0o700 });
        } catch (error) {
          if (!isCode(error, "EEXIST")) throw error;
        }
        ancestors.push({ path, info: await this.#directory(path) });
      }
      for (const name of ["sha256", ".staging"]) {
        path = join(this.root, name);
        try {
          await mkdir(path, { mode: 0o700 });
        } catch (error) {
          if (!isCode(error, "EEXIST")) throw error;
        }
        ancestors.push({ path, info: await this.#directory(path) });
      }
      this.#ancestors = ancestors;
      await this.#checkAncestors();
    });
  }

  async put(value: Uint8Array): Promise<ArtifactRef> {
    if (
      !(value instanceof Uint8Array) ||
      !(value.buffer instanceof ArrayBuffer) ||
      value.byteLength > ARTIFACT_LIMITS.blobBytes
    )
      throw new ArtifactError("CAS_BLOB_LIMIT");
    const bytes = new Uint8Array(value);
    const ref = Object.freeze({ sha256: sha256(bytes), byteLength: bytes.byteLength });
    return this.#locked(async () => {
      const target = this.#path(ref.sha256);
      try {
        await lstat(target);
        await this.#read(target, ref);
        return ref;
      } catch (error) {
        if (!isCode(error, "ENOENT")) throw error;
      }
      const inventory = await this.#inventory();
      if (
        inventory.bytes + bytes.byteLength > this.#limits.bytes ||
        inventory.entries + 1 > this.#limits.entries
      )
        throw new ArtifactError("CAS_STORE_LIMIT");
      const temporary = join(this.root, ".staging", `${randomUUID()}.tmp`);
      const handle = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.#read(temporary, ref);
      await this.#checkAncestors();
      // link is an atomic no-replace publish. The temporary second hard link exists only under
      // the process-independent lock; readers acquire that lock before enforcing nlink === 1.
      await link(temporary, target);
      await unlink(temporary);
      await this.#syncDirectory(join(this.root, "sha256"));
      await this.#syncDirectory(join(this.root, ".staging"));
      await this.#read(target, ref);
      return ref;
    });
  }

  async read(ref: ArtifactRef): Promise<Uint8Array> {
    this.#validateRef(ref);
    return this.#locked(() => this.#read(this.#path(ref.sha256), ref));
  }

  async list(): Promise<StoredArtifact[]> {
    return this.#locked(async () => (await this.#inventory()).blobs);
  }

  /** Caller must hold the coordinator's retention lock and prove no live DB reference exists. */
  async remove(ref: ArtifactRef): Promise<void> {
    this.#validateRef(ref);
    await this.#locked(async () => {
      const path = this.#path(ref.sha256);
      await this.#read(path, ref);
      await this.#checkAncestors();
      await unlink(path);
      await this.#syncDirectory(join(this.root, "sha256"));
    });
  }

  #validateRef(value: ArtifactRef): void {
    if (
      value === null ||
      typeof value !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)
    )
      throw new ArtifactError("CAS_INVALID_REFERENCE");
    const fields = Object.getOwnPropertyDescriptors(value);
    if (
      !fields.sha256 ||
      !("value" in fields.sha256) ||
      !fields.byteLength ||
      !("value" in fields.byteLength) ||
      typeof fields.sha256.value !== "string" ||
      !digestPattern.test(fields.sha256.value) ||
      !Number.isSafeInteger(fields.byteLength.value) ||
      (fields.byteLength.value as number) < 0 ||
      (fields.byteLength.value as number) > ARTIFACT_LIMITS.blobBytes
    )
      throw new ArtifactError("CAS_INVALID_REFERENCE");
  }
  #path(digest: string): string {
    if (!digestPattern.test(digest)) throw new ArtifactError("CAS_INVALID_REFERENCE");
    return join(this.root, "sha256", digest);
  }
  async #directory(path: string): Promise<BigIntStats> {
    const info = await lstat(path, { bigint: true });
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new ArtifactError("CAS_UNSAFE_DIRECTORY");
    return info;
  }
  async #checkAncestors(): Promise<void> {
    if (!this.#ancestors.length) throw new ArtifactError("CAS_NOT_INITIALIZED");
    for (const ancestor of this.#ancestors) {
      if (!sameIdentity(ancestor.info, await this.#directory(ancestor.path)))
        throw new ArtifactError("CAS_DIRECTORY_CHANGED");
    }
    const root = this.#ancestors.find((entry) => entry.path === this.root)!.info;
    if (this.#ancestors.slice(-2).some((entry) => entry.info.dev !== root.dev))
      throw new ArtifactError("CAS_UNSAFE_DIRECTORY");
  }
  async #read(path: string, expected?: ArtifactRef): Promise<Uint8Array> {
    const before = await lstat(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n)
      throw new ArtifactError("CAS_UNSAFE_FILE");
    if (before.size > BigInt(ARTIFACT_LIMITS.blobBytes)) throw new ArtifactError("CAS_BLOB_LIMIT");
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (!sameFile(before, await handle.stat({ bigint: true })))
        throw new ArtifactError("CAS_FILE_CHANGED");
      const buffer = new Uint8Array(Number(before.size) + 1);
      let offset = 0;
      while (offset < buffer.byteLength) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      const after = await lstat(path, { bigint: true });
      if (
        offset !== Number(before.size) ||
        !sameFile(before, after) ||
        !sameFile(before, await handle.stat({ bigint: true })) ||
        after.isSymbolicLink()
      )
        throw new ArtifactError("CAS_FILE_CHANGED");
      const bytes = buffer.slice(0, offset);
      if (
        expected &&
        (bytes.byteLength !== expected.byteLength || sha256(bytes) !== expected.sha256)
      )
        throw new ArtifactError("CAS_INTEGRITY");
      await this.#checkAncestors();
      return bytes;
    } finally {
      await handle.close();
    }
  }
  async #inventory(): Promise<{ bytes: number; entries: number; blobs: StoredArtifact[] }> {
    let bytes = 0,
      entries = 0;
    const blobs: StoredArtifact[] = [];
    for (const directory of ["sha256", ".staging"]) {
      const iterator = await opendir(join(this.root, directory));
      for await (const item of iterator) {
        if (++entries > this.#limits.entries) throw new ArtifactError("CAS_STORE_LIMIT");
        if (
          !item.isFile() ||
          (directory === "sha256"
            ? !digestPattern.test(item.name)
            : !/^[a-f0-9-]{36}\.tmp$/.test(item.name))
        )
          throw new ArtifactError("CAS_UNSAFE_FILE");
        const path = join(this.root, directory, item.name);
        const info = await lstat(path, { bigint: true });
        bytes += Number(info.size);
        if (bytes > this.#limits.bytes) throw new ArtifactError("CAS_STORE_LIMIT");
        const ref =
          directory === "sha256" ? { sha256: item.name, byteLength: Number(info.size) } : undefined;
        await this.#read(path, ref);
        if (ref) blobs.push({ ...ref, createdAtMs: Number(info.birthtimeMs) });
      }
    }
    return {
      bytes,
      entries,
      blobs: blobs.sort((a, b) => (a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0)),
    };
  }
  async #syncDirectory(path: string): Promise<void> {
    // Windows does not support opening a directory for fsync through this Node API.
    if (process.platform === "win32") return;
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  async #locked<T>(operation: () => Promise<T>): Promise<T> {
    return this.#safe(async () => {
      await this.#checkAncestors();
      const path = join(this.root, ".lock");
      const deadline = performance.now() + this.#limits.lockWaitMs;
      let handle: FileHandle;
      for (;;) {
        try {
          handle = await open(
            path,
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
            0o600,
          );
          break;
        } catch (error) {
          if (!isCode(error, "EEXIST")) throw error;
          let existing: BigIntStats;
          try {
            existing = await lstat(path, { bigint: true });
          } catch (inspectionError) {
            if (isCode(inspectionError, "ENOENT")) continue;
            throw inspectionError;
          }
          if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1n)
            throw new ArtifactError("CAS_UNSAFE_LOCK");
          if (performance.now() >= deadline) throw new ArtifactError("CAS_BUSY");
          await delay(10);
          await this.#checkAncestors();
        }
      }
      const own = await handle.stat({ bigint: true });
      try {
        await this.#checkAncestors();
        return await operation();
      } finally {
        await this.#releaseLock(handle, path, own);
      }
    });
  }
  async #releaseLock(handle: FileHandle, path: string, own: BigIntStats): Promise<void> {
    await handle.close();
    const current = await lstat(path, { bigint: true });
    if (!sameIdentity(own, current) || current.nlink !== 1n || current.isSymbolicLink())
      throw new ArtifactError("CAS_LOCK_CHANGED");
    await this.#checkAncestors();
    await unlink(path);
  }
  async #safe<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ArtifactError) throw error;
      if (isCode(error, "ENOENT")) throw new ArtifactError("CAS_MISSING");
      throw new ArtifactError("CAS_IO_FAILED");
    }
  }
}
