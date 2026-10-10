import { lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { analyzeSnapshots, stoppedResult } from "../../packages/analysis/src/analysis.ts";
import { FIXTURE_SELECTIONS } from "../../packages/analysis/src/fixture.ts";
import { writeReports } from "../../packages/analysis/src/output.ts";

// Denied roots must be rejected before the first filesystem call. Mocked operations cannot
// reach a real UNC share even if this security regression fails.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const denied = () => Promise.reject(new Error("UNEXPECTED_FILESYSTEM_ACCESS"));
  return {
    ...actual,
    lstat: vi.fn(denied),
    mkdir: vi.fn(denied),
    open: vi.fn(denied),
    realpath: vi.fn(denied),
  };
});

describe("global resource and namespace limits", () => {
  it("T15: a combined source output budget stops amplification that per-file limits allow", async () => {
    const contracts = await Promise.all(
      FIXTURE_SELECTIONS.filter((selection) =>
        ["base-contract", "candidate-contract"].includes(selection.role),
      ).map(async (selection) => ({ ...selection, bytes: await readFile(selection.path) })),
    );
    const sources = Array.from({ length: 10 }, (_, index) => ({
      path: `src/consumer-${index}.ts`,
      role: "source" as const,
      bytes: Buffer.from('fetch("/v1/charges", { method: "POST" });\n'.repeat(10)),
    }));
    const options = { maxOutputBytes: 65_536 };
    const single = analyzeSnapshots([...contracts, sources[0]!], options);
    expect(single.state).toBe("ANALYSIS_ONLY");
    expect(single.usages).toHaveLength(10);
    const combined = analyzeSnapshots([...contracts, ...sources], options);
    expect(combined.state).toBe("STOPPED");
    expect(combined.unresolved[0]?.code).toBe("OUTPUT_LIMIT");
    expect(combined.deltas).toEqual([]);
    expect(combined.usages).toEqual([]);
    expect(combined.links).toEqual([]);
  });

  it.each(["\\\\server\\share", "//server/share", "\\\\?\\C:\\root", "relative-root"])(
    "report output rejects invalid root %j before filesystem access",
    async (root) => {
      vi.clearAllMocks();
      await expect(writeReports(root, stoppedResult("INVALID_ROOT"))).rejects.toThrow(
        "INVALID_ROOT",
      );
      expect(lstat).not.toHaveBeenCalled();
      expect(mkdir).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
      expect(realpath).not.toHaveBeenCalled();
    },
  );
});
