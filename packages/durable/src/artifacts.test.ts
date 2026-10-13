import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "../../analysis/src/identity.ts";
import { ArtifactError, ArtifactStore, ARTIFACT_LIMITS, type ArtifactRef } from "./artifacts.ts";

const base = resolve(".local/durable-cas-unit-tests");
const encoded = (value: string) => new TextEncoder().encode(value);
let directory: string;
let store: ArtifactStore;
beforeEach(async () => {
  await mkdir(base, { recursive: true });
  directory = await mkdtemp(join(base, "case-"));
  store = new ArtifactStore(join(directory, "store"));
  await store.initialize();
});
afterEach(async () => {
  if (dirname(resolve(directory)) !== base) throw new Error("UNSAFE_TEST_CLEANUP");
  await rm(directory, { recursive: true, force: true });
});

describe("private immutable artifact store", () => {
  it("copies caller bytes before asynchronous work, verifies readback and reuses intact content", async () => {
    const bytes = encoded("original immutable source");
    const pending = store.put(bytes);
    bytes.fill(0);
    const ref = await pending;
    expect(ref).toEqual({ sha256: sha256("original immutable source"), byteLength: 25 });
    expect(await store.read(ref)).toEqual(encoded("original immutable source"));
    const read = await store.read(ref);
    read.fill(0);
    expect(await store.read(ref)).toEqual(encoded("original immutable source"));
    expect(await store.put(encoded("original immutable source"))).toEqual(ref);
    expect(await store.list()).toEqual([{ ...ref, createdAtMs: expect.any(Number) }]);
  });

  it("serializes overlapping independent store instances without replacement or duplicate blobs", async () => {
    const other = new ArtifactStore(store.root);
    await other.initialize();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? store : other).put(encoded("one canonical byte string")),
      ),
    );
    expect(new Set(results.map((ref) => ref.sha256)).size).toBe(1);
    expect(await other.list()).toHaveLength(1);
    expect(await other.read(results[0]!)).toEqual(encoded("one canonical byte string"));
  });

  it("coordinates publication from separate trusted Node processes", async () => {
    const implementation = pathToFileURL(resolve("packages/durable/src/artifacts.ts")).href;
    const program = `import { ArtifactStore } from ${JSON.stringify(implementation)};
      const store = new ArtifactStore(process.argv[1]);
      await store.initialize();
      const ref = await store.put(new TextEncoder().encode('cross-process evidence'));
      process.stdout.write(JSON.stringify(ref));`;
    const child = () =>
      promisify(execFile)(process.execPath, ["--input-type=module", "-e", program, store.root], {
        timeout: 5000,
        maxBuffer: 4096,
      });
    const [first, second] = await Promise.all([child(), child()]);
    expect(first.stderr).toBe("");
    expect(second.stderr).toBe("");
    expect(JSON.parse(first.stdout)).toEqual(JSON.parse(second.stdout));
    expect(await store.list()).toHaveLength(1);
    expect(await store.read(JSON.parse(first.stdout) as ArtifactRef)).toEqual(
      encoded("cross-process evidence"),
    );
  });

  it.each(["short", "same-sized modified payload"])(
    "detects poisoned existing content and never repairs it: %s",
    async (poison) => {
      const ref = await store.put(encoded("original immutable source"));
      const path = join(store.root, "sha256", ref.sha256);
      await writeFile(path, poison);
      await expect(store.read(ref)).rejects.toThrow("CAS_INTEGRITY");
      await expect(store.put(encoded("original immutable source"))).rejects.toThrow(
        "CAS_INTEGRITY",
      );
      expect(await readFile(path, "utf8")).toBe(poison);
    },
  );

  it("detects missing data and mismatched declared length without source-path refresh", async () => {
    const ref = await store.put(encoded("evidence"));
    await expect(store.read({ ...ref, byteLength: 7 })).rejects.toThrow("CAS_INTEGRITY");
    await rm(join(store.root, "sha256", ref.sha256));
    await expect(store.read(ref)).rejects.toThrow("CAS_MISSING");
  });

  it.each(["../outside", "A:/outside", "a".repeat(63), "A".repeat(64)])(
    "rejects unsafe references without filesystem access: %s",
    async (digest) => {
      await expect(store.read({ sha256: digest, byteLength: 1 })).rejects.toThrow(
        "CAS_INVALID_REFERENCE",
      );
      await expect(store.remove({ sha256: digest, byteLength: 1 })).rejects.toThrow(
        "CAS_INVALID_REFERENCE",
      );
    },
  );

  it("does not evaluate reference accessors or accept shared mutable byte storage", async () => {
    let accessed = false;
    const ref = {
      get sha256() {
        accessed = true;
        return "a".repeat(64);
      },
      byteLength: 1,
    };
    await expect(store.read(ref)).rejects.toThrow("CAS_INVALID_REFERENCE");
    expect(accessed).toBe(false);
    await expect(store.put(new Uint8Array(new SharedArrayBuffer(4)))).rejects.toThrow(
      "CAS_BLOB_LIMIT",
    );
  });

  it("rejects hard-link substitution and leaves the external target intact", async () => {
    const outside = join(directory, "outside-private-data");
    await writeFile(outside, "private-canary");
    const ref = { sha256: sha256("private-canary"), byteLength: 14 };
    await link(outside, join(store.root, "sha256", ref.sha256));
    await expect(store.read(ref)).rejects.toThrow("CAS_UNSAFE_FILE");
    await expect(store.remove(ref)).rejects.toThrow("CAS_UNSAFE_FILE");
    expect(await readFile(outside, "utf8")).toBe("private-canary");
  });

  it("rejects symlink/junction ancestors before creating artifact files", async () => {
    const outside = join(directory, "outside");
    await mkdir(outside);
    const pointer = join(directory, "redirected");
    await symlink(outside, pointer, process.platform === "win32" ? "junction" : "dir");
    await expect(new ArtifactStore(join(pointer, "cas")).initialize()).rejects.toThrow(
      "CAS_UNSAFE_DIRECTORY",
    );
    await expect(readFile(join(outside, "cas", ".lock"))).rejects.toHaveProperty("code", "ENOENT");
  });

  it("rejects replacement of a checked directory even with another ordinary directory", async () => {
    await rename(join(store.root, "sha256"), join(store.root, "previous"));
    await mkdir(join(store.root, "sha256"));
    await expect(store.put(encoded("never publish"))).rejects.toThrow("CAS_DIRECTORY_CHANGED");
  });

  it("bounds blob bytes, store bytes and entries before another publication", async () => {
    await expect(store.put(new Uint8Array(ARTIFACT_LIMITS.blobBytes + 1))).rejects.toThrow(
      "CAS_BLOB_LIMIT",
    );
    const small = new ArtifactStore(join(directory, "small"), { bytes: 8, entries: 2 });
    await small.initialize();
    await small.put(encoded("12345678"));
    await expect(small.put(encoded("x"))).rejects.toThrow("CAS_STORE_LIMIT");
    expect(await small.list()).toHaveLength(1);
    const count = new ArtifactStore(join(directory, "count"), { entries: 1 });
    await count.initialize();
    await count.put(encoded("a"));
    await expect(count.put(encoded("b"))).rejects.toThrow("CAS_STORE_LIMIT");
  });

  it("counts crash-left staging toward quota and does not silently delete it", async () => {
    const small = new ArtifactStore(join(directory, "staged"), { bytes: 8 });
    await small.initialize();
    const staged = join(small.root, ".staging", `${randomUUID()}.tmp`);
    await writeFile(staged, "12345678");
    await expect(small.put(encoded("x"))).rejects.toThrow("CAS_STORE_LIMIT");
    expect(await readFile(staged, "utf8")).toBe("12345678");
  });

  it("fails busy on crash-left lock without guessing stale ownership", async () => {
    const locked = new ArtifactStore(store.root, { lockWaitMs: 0 });
    await locked.initialize();
    await writeFile(join(store.root, ".lock"), "operator must inspect");
    await expect(locked.put(encoded("x"))).rejects.toThrow("CAS_BUSY");
    expect(await readFile(join(store.root, ".lock"), "utf8")).toBe("operator must inspect");
  });

  it("redacts filesystem paths from public errors and denies unsafe roots", async () => {
    const missing: ArtifactRef = { sha256: "a".repeat(64), byteLength: 10 };
    try {
      await store.read(missing);
      throw new Error("EXPECTED_FAILURE");
    } catch (error) {
      expect(error).toBeInstanceOf(ArtifactError);
      expect((error as Error).message).toBe("CAS_MISSING");
    }
    expect(() => new ArtifactStore("\\\\host\\share")).toThrow("CAS_UNSAFE_ROOT");
    expect(() => new ArtifactStore("relative/cas")).toThrow("CAS_UNSAFE_ROOT");
  });

  it("removes a verified orphan only through the explicit removal method", async () => {
    const ref = await store.put(encoded("orphan"));
    expect(await store.list()).toHaveLength(1);
    await store.remove(ref);
    expect(await store.list()).toHaveLength(0);
    await expect(store.read(ref)).rejects.toThrow("CAS_MISSING");
  });
});
