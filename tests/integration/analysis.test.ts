import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  analyzeLocalExperiment,
  analyzeSnapshots,
  assessAnalysisClaim,
  verifyAnalysisResult,
} from "../../packages/analysis/src/analysis.ts";
import { captureLocalInputs } from "../../packages/analysis/src/ingestion.ts";
import { FIXTURE_SELECTIONS } from "../../packages/analysis/src/fixture.ts";
import { canonical, identity, sha256 } from "../../packages/analysis/src/identity.ts";
import { resolvePointer } from "../../packages/analysis/src/correspondence.ts";
import { renderMarkdown } from "../../packages/analysis/src/report.ts";

const root = process.cwd();
async function fixture() {
  return captureLocalInputs(root, FIXTURE_SELECTIONS);
}
describe("Phase 2 real MercuryPay static investigation", () => {
  it("T01–T04: exact immutable artifacts, independent deltas, source span, curated edges and potential impact", async () => {
    const bytes = await fixture(),
      result = analyzeSnapshots(bytes);
    expect(result.state).toBe("ANALYSIS_ONLY");
    expect(result.unresolved).toMatchObject([{ code: "ast.opaque-call.v1" }]);
    expect(result.deltas).toHaveLength(2);
    expect(result.deltas.map((d) => [d.method, d.path, d.compatibility]).sort()).toEqual([
      ["POST", "/v1/charges", "breaking"],
      ["POST", "/v2/payments", "nonbreaking"],
    ]);
    expect(result.correspondences).toHaveLength(2);
    expect(result.correspondences.every((c) => c.provenance === "curated")).toBe(true);
    expect(result.usages).toHaveLength(1);
    const usage = result.usages[0]!;
    expect(usage).toMatchObject({
      method: "POST",
      path: "/v1/charges",
      filePath: "apps/demo-shop/src/v1-adapter.ts",
      symbol: "buildV1CheckoutRequest",
      matchMethod: "ast-static-request-object",
      execution: "not-executed",
    });
    const source = await readFile(usage.filePath, "utf8");
    expect(source.slice(usage.location.start, usage.location.end)).toBe(usage.location.excerpt);
    expect(usage.location.excerpt).toContain("/v1/charges");
    expect(usage.sourceDigest).toBe(sha256(await readFile(usage.filePath)));
    expect(result.links).toHaveLength(1);
    expect(result.links[0]!.status).toBe("POTENTIAL_IMPACT");
    expect(result).toMatchObject({
      replayExecuted: false,
      repairExecuted: false,
      modelInvocations: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(/REPRODUCED_FAILURE|PATCH_VERIFIED|patchDigest/);
    expect(
      assessAnalysisClaim(
        {
          status: "STRUCTURAL_BREAK",
          subjectId: result.deltas.find((d) => d.compatibility === "breaking")!.id,
        },
        result,
        bytes,
      ).accepted,
    ).toBe(true);
    expect(
      assessAnalysisClaim({ status: "MATCHED_USAGE", subjectId: usage.id }, result, bytes).accepted,
    ).toBe(true);
    expect(
      assessAnalysisClaim(
        { status: "POTENTIAL_IMPACT", subjectId: result.links[0]!.id },
        result,
        bytes,
      ).accepted,
    ).toBe(true);
  });
  it("T19: byte-identical normalized results through pure and filesystem APIs", async () => {
    const first = analyzeSnapshots(await fixture()),
      second = await analyzeLocalExperiment(root, FIXTURE_SELECTIONS);
    expect(canonical(second)).toBe(canonical(first));
    const { runDigest, ...payload } = first;
    expect(runDigest).toBe(identity(payload));
    expect(verifyAnalysisResult(first, await fixture())).toBe(true);
  });
  it("without curated data still finds removed/added operations and exact usage", async () => {
    const result = analyzeSnapshots((await fixture()).filter((f) => f.role !== "mapping"));
    expect(result.state).toBe("ANALYSIS_ONLY");
    expect(result.correspondences).toEqual([]);
    expect(result.links).toHaveLength(1);
    expect(result.links[0]!.correspondenceIds).toEqual([]);
    expect(result.deltas.map((d) => d.kind).join(" ")).not.toMatch(/rename/i);
  });
  it("T08: identical/whitespace contract bytes preserve zero deltas with honest identities", async () => {
    const input = (await fixture()).filter((f) => f.role !== "mapping");
    const base = input.find((f) => f.role === "base-contract")!;
    const identical = input.map((f) =>
      f.role === "candidate-contract" ? { ...f, bytes: base.bytes } : f,
    );
    const first = analyzeSnapshots(identical);
    expect(first.state).toBe("ANALYSIS_ONLY");
    expect(first.deltas).toEqual([]);
    const white = identical.map((f) =>
      f.role === "candidate-contract"
        ? {
            ...f,
            bytes: Buffer.from(JSON.stringify(JSON.parse(Buffer.from(base.bytes).toString()))),
          }
        : f,
    );
    const second = analyzeSnapshots(white);
    expect(second.deltas).toEqual([]);
    expect(second.state).toBe("ANALYSIS_ONLY");
    expect(second.snapshots.find((s) => s.role === "candidate-contract")!.sha256).not.toBe(
      base.bytes && sha256(base.bytes),
    );
    expect(second.runDigest).not.toBe(first.runDigest);
  });
  it("multiple files keep relevant/nonrelevant evidence and unknown SDK calls distinct", async () => {
    const input = (await fixture()).filter((f) => f.role !== "mapping");
    const result = analyzeSnapshots([
      ...input,
      {
        path: "src/other.ts",
        role: "source",
        bytes: Buffer.from('fetch("/unused",{method:"GET"}); gateway.payments.create(data);'),
      },
    ]);
    expect(result.state).toBe("ANALYSIS_ONLY");
    expect(result.usages).toHaveLength(2);
    expect(result.links).toHaveLength(1);
    expect(result.unresolved.some((u) => u.filePath === "src/other.ts")).toBe(true);
    const sdkOnly = input.map((f) =>
      f.role === "source" ? { ...f, bytes: Buffer.from("transport.charge(payload);") } : f,
    );
    expect(analyzeSnapshots(sdkOnly).assessments[0]!.status).toBe("UNVERIFIED");
  });
  it("T02/T13: stale curated bytes and invalid pointers cannot self-authorize", async () => {
    const input = await fixture();
    const forged = input.map((f) =>
      f.role === "mapping"
        ? {
            ...f,
            bytes: Buffer.from(
              Buffer.from(f.bytes).toString().replace("curated-synthetic-ground-truth", "observed"),
            ),
          }
        : f,
    );
    const result = analyzeSnapshots(forged);
    expect(result.state).toBe("STOPPED");
    expect(result.links).toEqual([]);
    expect(() => resolvePointer({ paths: {} }, "/paths/~2oops")).toThrow("INVALID_POINTER");
    expect(() => resolvePointer({ paths: {} }, "/missing")).toThrow("INVALID_POINTER");
  });
  it("T09/T10: scoped unused and wrong-method routes make no global safety claim", async () => {
    for (const source of [
      '// /v1/charges\nconst route="/v1/charges";',
      'fetch("/v1/charges",{method:"GET"});',
    ]) {
      const input = (await fixture())
        .filter((f) => f.role !== "mapping")
        .map((f) => (f.role === "source" ? { ...f, bytes: Buffer.from(source) } : f));
      const result = analyzeSnapshots(input);
      expect(result.links).toEqual([]);
      expect(result.assessments[0]).toMatchObject({ status: "NOT_APPLICABLE" });
      expect(result.assessments[0]!.reason).toContain("not global safety");
    }
  });
  it("T11: unsupported dynamic calls prevent scoped absence conclusion", async () => {
    const input = (await fixture())
      .filter((f) => f.role !== "mapping")
      .map((f) =>
        f.role === "source"
          ? { ...f, bytes: Buffer.from('fetch(dynamicUrl,{method:"POST"});') }
          : f,
      );
    const result = analyzeSnapshots(input);
    expect(result.state).toBe("ANALYSIS_ONLY");
    expect(result.links).toEqual([]);
    expect(result.assessments[0]!.status).toBe("UNVERIFIED");
    expect(result.unresolved.length).toBeGreaterThan(0);
  });
  it("T16: status, graph, digest, source and provenance forgeries rejected even with recomputed report hash", async () => {
    const bytes = await fixture(),
      result = analyzeSnapshots(bytes);
    const altered = structuredClone(result);
    altered.usages[0]!.sourceDigest = "0".repeat(64);
    const { runDigest: ignored, ...payload } = altered;
    expect(ignored).toHaveLength(64);
    altered.runDigest = identity(payload);
    expect(verifyAnalysisResult(altered, bytes)).toBe(false);
    expect(verifyAnalysisResult({ ...result, state: "PATCH_VERIFIED" }, bytes)).toBe(false);
    expect(
      verifyAnalysisResult(
        {
          ...result,
          snapshots: result.snapshots.map((s) => ({ ...s, trustOrigin: "provider-authenticated" })),
        },
        bytes,
      ),
    ).toBe(false);
    expect(
      assessAnalysisClaim(
        { status: "REPRODUCED_FAILURE", subjectId: result.links[0]!.id },
        result,
        bytes,
      ).accepted,
    ).toBe(false);
    expect(
      assessAnalysisClaim({ status: "POTENTIAL_IMPACT", subjectId: "forged" }, result, bytes)
        .accepted,
    ).toBe(false);
    expect(analyzeSnapshots(bytes.map((b) => ({ ...b, sha256: "0".repeat(64) }))).state).toBe(
      "STOPPED",
    );
    let called = false;
    const accessor = {
      path: "source.ts",
      role: "source",
      get bytes() {
        called = true;
        return Buffer.from("unsafe");
      },
    };
    expect(analyzeSnapshots([accessor]).state).toBe("STOPPED");
    expect(called).toBe(false);
  });
  it("T15: cancellation and output limits remove all confident partial findings", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = analyzeSnapshots(await fixture(), {}, controller.signal);
    expect(result.state).toBe("STOPPED");
    expect(result.links).toEqual([]);
    const output = analyzeSnapshots(await fixture(), { maxOutputBytes: 4096 });
    expect(output.unresolved[0]!.code).toBe("OUTPUT_LIMIT");
    expect(output.deltas).toEqual([]);
    expect(analyzeSnapshots(await fixture(), { budgetMs: 30001 }).state).toBe("STOPPED");
  });
  it("Markdown renders source as escaped text with explicit missing proof", async () => {
    const result = analyzeSnapshots(await fixture());
    const markdown = renderMarkdown(result);
    expect(markdown).toContain("POTENTIAL_IMPACT");
    expect(markdown).toContain("replayExecuted=false");
    result.unresolved.push({
      code: "input",
      message: "<script>alert(1)</script> [click](https://attacker.invalid)",
    });
    expect(renderMarkdown(result)).not.toContain("<script>");
    expect(renderMarkdown(result)).not.toContain("[click]");
  });
});
