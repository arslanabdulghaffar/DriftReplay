import type { AnalysisResult } from "./model.ts";

// Escape active HTML/Markdown syntax; report viewers may still auto-link plain URLs.
function literal(value: string): string {
  return value.replace(/[&<>`|[\]\\]/g, (c) => `&#${c.charCodeAt(0)};`).replace(/[\r\n]/g, " ");
}
export function renderMarkdown(result: AnalysisResult): string {
  const lines = [
    "# DriftReplay deterministic local analysis",
    "",
    `State: **${result.state}**. Logical digest: \`${result.runDigest}\`.`,
    "",
    "Static analysis only. replayExecuted=false; repairExecuted=false; modelInvocations=0.",
    "",
    "## Captured snapshots",
    "",
    "| Relative path | SHA-256 | Bytes |",
    "| --- | --- | ---: |",
    ...result.snapshots.map((s) => `| ${literal(s.path)} | ${s.sha256} | ${s.byteLength} |`),
    "",
    "## Declared structural changes",
    "",
    ...result.deltas
      .slice(0, 100)
      .map(
        (d) =>
          `- ${literal(d.ruleId)}: ${d.compatibility}/${d.support} — ${literal(d.method)} ${literal(d.path)}. ${literal(d.rationale)} Pointers: ${literal(d.oldPointer ?? "absent")} → ${literal(d.newPointer ?? "absent")}.`,
      ),
    "",
    "## Exact lexical source evidence",
    "",
    ...result.usages
      .slice(0, 100)
      .map(
        (u) =>
          `- ${literal(u.filePath)}:${u.location.startLine}:${u.location.startColumn}–${u.location.endLine}:${u.location.endColumn}; blob ${u.sourceDigest}; ${literal(u.matchMethod)} in ${literal(u.symbol ?? "unknown symbol")}. Literal: ${literal(u.location.excerpt)}. UTF-16 offsets [${u.location.start}, ${u.location.end}). Request span [${u.requestLocation.start}, ${u.requestLocation.end}).`,
      ),
    "",
    "## Curated correspondence (separate from structural facts)",
    "",
    ...result.correspondences.map(
      (c) =>
        `- ${literal(c.id)} (${c.provenance}): ${literal(c.basePointer)} → ${literal(c.candidatePointer)}; mapping ${c.mappingDigest}.`,
    ),
    "",
    "## Evidence graph and conditional impacts",
    "",
    ...result.links
      .slice(0, 100)
      .map(
        (l) =>
          `- ${l.status}: delta ${l.deltaId} → usage ${l.usageId}; rule ${l.ruleId}; confidence ${l.confidence}; evidence ${l.evidenceIds.join(", ")}.`,
      ),
    ...result.assessments
      .slice(0, 100)
      .map((a) => `- ${a.status}: ${a.deltaId}. ${literal(a.reason)}`),
    "",
    "## Unresolved cases and missing proof",
    "",
    ...result.unresolved
      .slice(0, 100)
      .map(
        (u) =>
          `- ${literal(u.code)}: ${literal(u.message)}${u.filePath ? ` (${literal(u.filePath)})` : ""}.`,
      ),
    "- Scope: explicitly listed files only. Lexical construction does not prove execution, reachability or an outage.",
    "- Method/path linking assumes these selected contracts describe this consumer's intended provider.",
    "- A removed path and added path do not prove a rename or provider retirement. Curated data supplies only the documented synthetic correspondence.",
    "- No baseline/changed/patched replay, patch digest, model or autonomous repair evidence exists.",
    "- Hashes establish byte identity, not signatures or provider authenticity.",
    "- Each human-readable section is capped at 100 records; the JSON contains the complete bounded result.",
    "",
  ];
  return lines.join("\n");
}
