import { writeFileSync } from "node:fs";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, parse, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureLocalInputs,
  INGESTION_LIMITS,
  InputError,
  type LocalSelection,
  validateExperimentSelections,
  validatePath,
  validateRoot,
  validateSelections,
} from "./ingestion.ts";

describe("portable explicit selection policy", () => {
  it.each([
    "relative-root",
    "\\\\server\\share",
    "//server/share",
    "\\\\?\\C:\\root",
    "https://host/root",
  ])("rejects network namespaces and nonabsolute approved roots %j", (root) => {
    expect(() => validateRoot(root)).toThrow(new InputError("INVALID_ROOT"));
  });
  it("keeps slash paths and Unicode intact, returning sorted immutable identities", () => {
    const selected = validateSelections([
      { path: "src/雪.ts", role: "source" },
      { path: "contracts/base.json", role: "base-contract" },
    ]);
    expect(selected.map((entry) => entry.path)).toEqual(["contracts/base.json", "src/雪.ts"]);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected[0])).toBe(true);
  });

  it.each([
    "../outside.ts",
    "src/../outside.ts",
    "/outside.ts",
    "C:/outside.ts",
    "C:\\outside.ts",
    "\\\\server\\outside.ts",
    "//server/outside.ts",
    "src\\file.ts",
    "src/%2e%2e/outside.ts",
    "src/%252e%252e/outside.ts",
    "src/a.ts:stream",
    "src/a\0.ts",
    "src/CON.ts",
    "src/lpt1.json",
    "src/ hidden.ts",
    "src/space.ts ",
    "src/name./x.ts",
    "src//x.ts",
    "src/./x.ts",
    "src/x?.ts",
    ".hidden/x.ts",
    "src/.nested/x.ts",
    "node_modules/x.ts",
    "src/NoDe_MoDuLeS/x.ts",
    "src/.git/x.ts",
    "src/.next/x.ts",
    "src/out/x.ts",
    "src/dist/x.ts",
    "src/build/x.ts",
    "src/generated/x.ts",
    "src/coverage/x.ts",
    "src/e\u0301.ts",
    "src/\ud800.ts",
    "src/\u202eevil.ts",
  ])("rejects unsafe or excluded path %j", (path) => {
    expect(() => validatePath(path)).toThrow(new InputError("UNSAFE_PATH"));
  });

  it("rejects case aliases, wrong extensions and generated source", () => {
    expect(() =>
      validateSelections([
        { path: "src/a.ts", role: "source" },
        { path: "src/A.ts", role: "source" },
      ]),
    ).toThrow(new InputError("DUPLICATE_PATH"));
    for (const path of [
      "src/a.yaml",
      "src/a.TS",
      "src/a.d.ts",
      "src/a.min.js",
      "src/a.generated.ts",
    ]) {
      expect(() => validateSelections([{ path, role: "source" }])).toThrow(
        new InputError("UNSUPPORTED_EXTENSION"),
      );
    }
    expect(() => validateSelections([{ path: "src/a.ts", role: "base-contract" }])).toThrow(
      new InputError("UNSUPPORTED_EXTENSION"),
    );
  });

  it("rejects forged metadata, caller accessors and invalid selection shapes", () => {
    for (const entry of [
      { path: "a.ts", role: "source", sha256: "forged" },
      { path: "a.ts", role: "source", provenance: "curated" },
      { path: "a.ts", role: "source", status: "PATCH_VERIFIED" },
      { path: "a.ts" },
      null,
      "a.ts",
    ]) {
      expect(() => validateSelections([entry])).toThrow(new InputError("INVALID_SELECTION"));
    }
    let read = false;
    const entry = {
      get path() {
        read = true;
        return "a.ts";
      },
      role: "source",
    };
    expect(() => validateSelections([entry])).toThrow(new InputError("INVALID_SELECTION"));
    expect(read).toBe(false);
  });

  it("bounds source and total request counts before file access", () => {
    expect(() =>
      validateSelections(
        Array.from({ length: 257 }, (_, i) => ({ path: `${i}.ts`, role: "source" })),
      ),
    ).toThrow(new InputError("SOURCE_COUNT_LIMIT"));
    expect(() =>
      validateSelections(
        Array.from({ length: 2_001 }, (_, i) => ({ path: `${i}.json`, role: "mapping" })),
      ),
    ).toThrow(new InputError("FILE_COUNT_LIMIT"));
  });

  it("requires exactly two contract roles, a source, and at most one mapping for experiments", () => {
    const complete = [
      { path: "base.json", role: "base-contract" },
      { path: "candidate.json", role: "candidate-contract" },
      { path: "source.ts", role: "source" },
    ];
    expect(validateExperimentSelections(complete)).toHaveLength(3);
    for (const incomplete of [
      complete.slice(0, 2),
      complete.slice(1),
      [...complete, { path: "another.json", role: "base-contract" }],
      [...complete, { path: "map1.json", role: "mapping" }, { path: "map2.json", role: "mapping" }],
    ]) {
      expect(() => validateExperimentSelections(incomplete)).toThrow(
        new InputError("INVALID_EXPERIMENT_SELECTIONS"),
      );
    }
  });
});

describe("read-only bounded local capture", () => {
  let root: string;
  const temporaryParent = resolve(".local");
  beforeEach(async () => {
    await mkdir(temporaryParent, { recursive: true });
    root = await mkdtemp(join(temporaryParent, "test-ingestion-"));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    const target = resolve(root);
    if (dirname(target) !== temporaryParent || !basename(target).startsWith("test-ingestion-")) {
      throw new Error("Unsafe temporary cleanup target");
    }
    await rm(target, { recursive: true, force: true });
  });
  const source: LocalSelection = { path: "source.ts", role: "source" };

  it("reads exact bytes in deterministic path order without executing source or loading configs", async () => {
    const code = 'throw new Error("This module must never execute");\r\n// 雪 😀';
    await writeFile(join(root, "source.ts"), code);
    await writeFile(join(root, "base.json"), '{ "a":1 }\r\n');
    await writeFile(join(root, "tsconfig.json"), '{"extends":"https://invalid.invalid/execute"}');
    const selections: LocalSelection[] = [source, { path: "base.json", role: "base-contract" }];
    const first = await captureLocalInputs(root, selections);
    const second = await captureLocalInputs(root, [...selections].reverse());
    expect(first).toEqual(second);
    expect(first.map((entry) => entry.path)).toEqual(["base.json", "source.ts"]);
    expect(first[1]?.bytes).toEqual(new TextEncoder().encode(code));
    expect(await readFile(join(root, "source.ts"), "utf8")).toBe(code);
  });

  it("never exposes private absolute paths on failed reads", async () => {
    await expect(captureLocalInputs(root, [source])).rejects.toThrow(
      new InputError("LOCAL_READ_FAILED"),
    );
    await expect(captureLocalInputs("relative-root", [source])).rejects.toThrow(
      new InputError("INVALID_ROOT"),
    );
    await expect(captureLocalInputs("\\\\server\\share", [source])).rejects.toThrow(
      new InputError("INVALID_ROOT"),
    );
  });

  it("rejects unsafe encodings and nonregular selected files", async () => {
    await writeFile(join(root, "source.ts"), new Uint8Array([0xff]));
    await expect(captureLocalInputs(root, [source])).rejects.toThrow(
      new InputError("INVALID_UTF8"),
    );
    await rm(join(root, "source.ts"));
    await mkdir(join(root, "source.ts"));
    await expect(captureLocalInputs(root, [source])).rejects.toThrow(
      new InputError("NOT_REGULAR_FILE"),
    );
  });

  it("rejects per-file size limits before allocating input buffers", async () => {
    await writeFile(join(root, "source.ts"), "x".repeat(INGESTION_LIMITS.sourceFileBytes + 1));
    await expect(captureLocalInputs(root, [source])).rejects.toThrow(
      new InputError("FILE_SIZE_LIMIT"),
    );
    await writeFile(join(root, "base.json"), " ".repeat(INGESTION_LIMITS.contractBytes + 1));
    await expect(
      captureLocalInputs(root, [{ path: "base.json", role: "base-contract" }]),
    ).rejects.toThrow(new InputError("FILE_SIZE_LIMIT"));
  });

  it("bounds aggregate source bytes and total snapshot bytes", async () => {
    const sources: LocalSelection[] = [];
    for (let i = 0; i < 41; i++) {
      const path = `${i.toString().padStart(2, "0")}.ts`;
      sources.push({ path, role: "source" });
      await writeFile(join(root, path), " ".repeat(INGESTION_LIMITS.sourceFileBytes));
    }
    await expect(captureLocalInputs(root, sources)).rejects.toThrow(
      new InputError("SOURCE_SIZE_LIMIT"),
    );
    const contracts: LocalSelection[] = [];
    for (let i = 0; i < 13; i++) {
      const path = `${i.toString().padStart(2, "0")}.json`;
      contracts.push({ path, role: "base-contract" });
      await writeFile(join(root, path), " ".repeat(INGESTION_LIMITS.contractBytes));
    }
    await expect(captureLocalInputs(root, contracts)).rejects.toThrow(
      new InputError("SNAPSHOT_SIZE_LIMIT"),
    );
  });

  it("rejects directory symlinks/junctions including a symlinked approved root", async () => {
    const target = join(root, "real");
    await mkdir(target);
    await writeFile(join(target, "source.ts"), "const x = 1;");
    const alias = join(root, "alias");
    await symlink(target, alias, process.platform === "win32" ? "junction" : "dir");
    await expect(
      captureLocalInputs(root, [{ path: "alias/source.ts", role: "source" }]),
    ).rejects.toThrow(new InputError("SYMLINK_DENIED"));
    await expect(captureLocalInputs(alias, [source])).rejects.toThrow(
      new InputError("SYMLINK_DENIED"),
    );
  });

  it("rejects duplicate hard-link identities even under different approved names", async () => {
    await writeFile(join(root, "source.ts"), "const x = 1;");
    await link(join(root, "source.ts"), join(root, "alias.ts"));
    await expect(
      captureLocalInputs(root, [source, { path: "alias.ts", role: "source" }]),
    ).rejects.toThrow(new InputError("DUPLICATE_FILE_IDENTITY"));
  });

  it("stops on cancellation and checks elapsed budget before file access", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(captureLocalInputs(root, [source], { signal: abort.signal })).rejects.toThrow(
      new InputError("CANCELLED"),
    );
    vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(30_001);
    await expect(captureLocalInputs(root, [source])).rejects.toThrow(new InputError("TIME_LIMIT"));
  });

  it("detects mutation after metadata checks without returning partial snapshots", async () => {
    await writeFile(join(root, "source.ts"), "const x = 1;");
    let checks = 0;
    // The callback simulates a host race only; captured source is never evaluated.
    await expect(
      captureLocalInputs(root, [source], {
        check: () => {
          const ancestorCount = root
            .slice(parse(root).root.length)
            .split(/[/\\]/)
            .filter(Boolean).length;
          if (++checks === ancestorCount + 3) {
            writeFileSync(join(root, "source.ts"), "const x = 1000000;");
          }
        },
      }),
    ).rejects.toThrow(new InputError("FILE_MUTATED"));
  });
});
