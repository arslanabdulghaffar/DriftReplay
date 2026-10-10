# ADR 0002: bounded local deterministic analysis

Status: selected for the explicitly authorized Phase 2 branch. Phase 3 is not authorized.

## Decision before implementation

Use a project-owned strict-subset comparator, `driftreplay-openapi-subset@0.2.0`,
and the already pinned TypeScript 5.9.3 syntax parser. Keep ingestion, comparison,
AST inspection, evidence composition and CLI modules together in one private
`packages/analysis` package. Separate packages would add packaging boundaries
without independent consumers at this stage. No dependency binary is downloaded.

The preferred alternative, oasdiff, has broader established coverage and JSON
output. Its official documentation describes external reference handling and
optional upload/browser features. A production adapter would require an exact
release, verified checksums, platform testing, bounded subprocesses, safe input
preflight and output normalization. `Get-Command oasdiff -ErrorAction
SilentlyContinue` found no executable on this Windows host. No release binary
was installed or run, and no Linux binary behavior is claimed. For this narrow
local experiment, avoiding a new executable/resolution boundary is preferable
to pretending that an untested external adapter is ready. This is the prompt's
explicit option B, not a general OpenAPI compatibility engine or new algorithm.

## Actual capability spike

Before implementation, `node --input-type=module -e` with `typescript.createSourceFile`
on the existing adapter returned:

```json
{
  "typescript": "5.9.3",
  "parseDiagnostics": 0,
  "returnedObjects": [{ "kind": "ObjectLiteralExpression", "line": 17 }]
}
```

A second Node spike parsed both existing contracts and compared only their path/method
sets. It returned removed `POST /v1/charges` and added `POST /v2/payments`.
This spike establishes feasibility, not validation or semantic coverage. Full tests
must validate the comparator before publication. Neither spike executed consumer code.

## Scope and trust

Only explicitly listed local UTF-8 inputs beneath one trusted root are ingested.
No network provider, external resolver, consumer import, tsconfig/plugin evaluation,
replay, model, patch or writer is present. All downstream stages consume captured
bytes/text. OpenAPI 3.0.3 JSON inline schemas are supported only as enumerated in
the support matrix. Unknown constructs stop analysis rather than disappearing.

The input adapter rejects symlinks, unsafe paths and nonregular files, checks
metadata around reads, and applies resource limits. It does not provide hostile
multi-tenant filesystem isolation; local race and synchronous-parser limits remain
documented. The CLI is supervised in a worker with a deadline and heap ceiling.

## Evidence contract

Version 2 snapshots identify exact raw bytes, local relative origin and media kind.
The analysis result binds engine/policy identities, sorted deltas, source citations,
curated correspondences, usages, impact links and unresolved cases into a stable
digest. Locations use one-based lines/columns and UTF-16 half-open offsets.
Public claim verification recomputes the result from captured input bytes.
Hashes identify content, not authenticity, authority or runtime execution.

Lexical request construction can establish `MATCHED_USAGE`; supported structural
changes can establish `STRUCTURAL_BREAK`; their verified join can establish only
`POTENTIAL_IMPACT`. Unsupported or ambiguous evidence remains `UNVERIFIED`.
Scoped absence is never global safety. The Phase 1 foundation policy stays intact.
Curated correspondence requires the reviewed mapping and contract byte pins; a
document cannot grant itself trusted provenance. Removed/added endpoints do not
prove a rename or provider retirement. Processing metadata is separate from the
deterministic result. No runtime failure or patch-verification status is admitted.

## Sources actually consulted

- [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html)
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [oasdiff repository](https://github.com/oasdiff/oasdiff)
- [oasdiff comparison options](https://github.com/oasdiff/oasdiff/blob/main/docs/DIFF.md)
- [oasdiff breaking change behavior](https://github.com/oasdiff/oasdiff/blob/main/docs/BREAKING-CHANGES.md)
- [oasdiff quick start](https://www.oasdiff.com/docs/getting-started)

These are documentation comparisons; they are not evidence of a pinned oasdiff run.
