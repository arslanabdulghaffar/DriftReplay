import { mkdir, mkdtemp, writeFile, readFile, rm, access, symlink } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { analyzeSnapshots, analyzeLocalExperiment } from "../../packages/analysis/src/analysis.ts";
import { captureLocalInputs } from "../../packages/analysis/src/ingestion.ts";
import { FIXTURE_SELECTIONS } from "../../packages/analysis/src/fixture.ts";
import { runSupervised, validateWorkerReply } from "../../packages/analysis/src/supervisor.ts";
import { writeReports } from "../../packages/analysis/src/output.ts";

const root = process.cwd();
async function removeTestDirectory(local: string, directory: string) {
  const path = relative(local, resolve(directory));
  if (!path || path.startsWith("..") || isAbsolute(path)) throw new Error("UNSAFE_CLEANUP");
  await rm(directory, { recursive: true, force: true });
}
async function withDirectory(fn: (path: string) => Promise<void>) {
  const local = resolve(root, ".local");
  await mkdir(local, { recursive: true });
  const directory = await mkdtemp(join(local, "test-analysis-"));
  try {
    await fn(directory);
  } finally {
    await removeTestDirectory(local, directory);
  }
}
async function fixture() {
  return captureLocalInputs(root, FIXTURE_SELECTIONS);
}

describe("Phase 2 negative security gates", () => {
  it("T12: poisoned reference values are rejected without fetching any resource", async () => {
    const bytes = (await fixture()).filter((i) => i.role !== "mapping");
    for (const ref of [
      "https://127.0.0.1/private",
      "file:///private.json",
      "../external.json",
      "#/components/schemas/loop",
    ]) {
      const input = bytes.map((b) => {
        if (b.role !== "base-contract") return b;
        const doc = JSON.parse(Buffer.from(b.bytes).toString());
        doc.paths["/v1/charges"].post.requestBody.content["application/json"].schema = {
          $ref: ref,
        };
        return { ...b, bytes: Buffer.from(JSON.stringify(doc)) };
      });
      const result = analyzeSnapshots(input);
      expect(result.state).toBe("STOPPED");
      expect(result.deltas).toEqual([]);
      expect(result.links).toEqual([]);
    }
  });
  it("T13: malformed contract/source fails closed instead of retaining confident evidence", async () => {
    for (const [role, text] of [
      ["base-contract", '{"openapi":'],
      ["source", "function broken( {"],
    ] as const) {
      const result = analyzeSnapshots(
        (await fixture()).map((b) => (b.role === role ? { ...b, bytes: Buffer.from(text) } : b)),
      );
      expect(result.state).toBe("STOPPED");
      expect(result.usages).toEqual([]);
      expect(result.links).toEqual([]);
    }
  });
  it("source, package scripts and tsconfig are data; none execute or grant new inputs", async () =>
    withDirectory(async (directory) => {
      const bytes = (await fixture()).filter((i) => i.role !== "mapping");
      const marker = join(directory, "executed.txt");
      await writeFile(
        join(directory, "source.ts"),
        `import {writeFileSync} from "node:fs"; writeFileSync(${JSON.stringify(marker)},"unsafe"); fetch("/v1/charges",{method:"POST"});`,
      );
      await writeFile(
        join(directory, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { plugins: [{ name: "execute-attacker" }] } }),
      );
      await writeFile(
        join(directory, "package.json"),
        JSON.stringify({ scripts: { postinstall: "execute-attacker" } }),
      );
      for (const b of bytes.filter((i) => i.role !== "source"))
        await writeFile(join(directory, b.role + ".json"), b.bytes);
      const result = await analyzeLocalExperiment(directory, [
        { path: "base-contract.json", role: "base-contract" },
        { path: "candidate-contract.json", role: "candidate-contract" },
        { path: "source.ts", role: "source" },
      ]);
      expect(result.state).toBe("ANALYSIS_ONLY");
      expect(result.links).toHaveLength(1);
      await expect(access(marker)).rejects.toThrow();
    }));
  it("T15: worker enforces a real deadline and honors cancellation", async () => {
    const timed = await runSupervised(root, FIXTURE_SELECTIONS, { budgetMs: 1 });
    expect(timed.state).toBe("STOPPED");
    expect(timed.unresolved[0]!.code).toBe("TIME_LIMIT");
    const controller = new AbortController();
    controller.abort();
    expect(
      (await runSupervised(root, FIXTURE_SELECTIONS, {}, controller.signal)).unresolved[0]!.code,
    ).toBe("CANCELLED");
  });
  it("T18: malformed engine response cannot be interpreted as a valid finding", () => {
    for (const output of [
      "not json",
      { state: "ANALYSIS_ONLY", links: [{ status: "REPRODUCED_FAILURE" }] },
      null,
    ]) {
      const result = validateWorkerReply(output);
      expect(result.state).toBe("INDETERMINATE");
      expect(result.links).toEqual([]);
    }
  });
  it(
    "CLI actual Node worker writes bounded local JSON/Markdown; invalid arguments do not start analysis",
    async () =>
      withDirectory(async (directory) => {
        const bytes = await fixture(),
          selections = bytes.map((b, index) => ({
            path: `input-${index}.${b.role === "source" ? "ts" : "json"}`,
            role: b.role,
            bytes: b.bytes,
          }));
        for (const selection of selections)
          await writeFile(join(directory, selection.path), selection.bytes);
        const args = selections.flatMap((s) => [
          s.role === "source"
            ? "--source"
            : s.role === "base-contract"
              ? "--base"
              : s.role === "candidate-contract"
                ? "--candidate"
                : "--mapping",
          s.path,
        ]);
        const invocation = spawnSync(
          process.execPath,
          ["packages/analysis/src/cli.ts", "--root", directory, ...args],
          { cwd: root, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 },
        );
        expect(invocation.status, invocation.stderr).toBe(0);
        const message = JSON.parse(invocation.stdout);
        expect(message.state).toBe("ANALYSIS_ONLY");
        expect(message.links).toBe(1);
        expect(invocation.stdout).not.toContain(directory);
        const report = JSON.parse(
          await readFile(join(directory, ".local/phase-2/analysis.json"), "utf8"),
        );
        expect(report.runDigest).toBe(message.runDigest);
        expect(await readFile(join(directory, ".local/phase-2/analysis.md"), "utf8")).toContain(
          "POTENTIAL_IMPACT",
        );
        const invalid = spawnSync(
          process.execPath,
          ["packages/analysis/src/cli.ts", "--upload", "https://example.invalid"],
          { cwd: root, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 },
        );
        expect(invalid.status).toBe(64);
        expect(JSON.parse(invalid.stderr).code).toBe("INVALID_ARGUMENTS");
      }),
    30000,
  );
  it("output refuses junction/symlink directories and never writes outside the approved report folder", async () =>
    withDirectory(async (directory) => {
      const outside = join(directory, "outside");
      await mkdir(outside);
      await symlink(
        outside,
        join(directory, ".local"),
        process.platform === "win32" ? "junction" : "dir",
      );
      await expect(writeReports(directory, analyzeSnapshots(await fixture()))).rejects.toThrow(
        "UNSAFE_OUTPUT_DIRECTORY",
      );
      await expect(access(join(outside, "phase-2/analysis.json"))).rejects.toThrow();
    }));
});
