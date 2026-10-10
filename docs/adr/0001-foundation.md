# ADR 0001 Local TypeScript foundation

Status: implemented for Phase 1 only; future service choices remain proposals.

## Decision

Use a lean pnpm workspace containing a Next.js static dashboard, a pure unmigrated checkout
adapter, runtime-validated core schemas, and a private fixture package. Use exact direct
dependency versions and a frozen lockfile. Use TypeScript 5.9.3 because the current reviewed
TypeScript ESLint peer range excludes TypeScript 7; do not select versions solely by recency.

The dashboard imports JSON at build time, emits a static export, and has no application API,
database, authentication, remote reads, model connection, or runtime runner. Node-only digest
utilities have their own package export so browser schema consumers do not import filesystem
or crypto modules accidentally.

The core admission guard can admit only UNVERIFIED in this phase. It defines the future
status vocabulary without implementing future analysis or verification predicates. The guard
validates declared reference shape, not the authenticity of evidence supplied by an adversary.

## Accepted Phase 0 corrections

1. Public MVP remains read-only with patch export. A demo-repository writer is separately gated.
2. Candidate verification precedes exact-digest-bound publication approval.
3. New API versions do not prove old endpoints are retired. MercuryPay explicitly declares retirement.
4. Removal/addition does not prove correspondence. Synthetic migration ground truth is curated.
5. Business inputs, assertions, harness, and environment must stay fixed during later comparisons.
6. A reviewed reference patch establishes the full proof harness in Phase 4 before repair automation.
7. Security applies from each boundary's introduction, not only during Phase 8 hardening.
8. Hashes establish byte identity, not authority, signatures, execution, or real-provider compatibility.

## Deliberate tree additions

`examples/fixtures/mercurypay/package.json` exposes immutable JSON using workspace imports.
Its `validation.ts` is a fixture-specific static validator, not a general OpenAPI implementation.
`scripts` contains small project-authored local helpers. `.gitattributes` records LF handling
for future Git use so Windows checkout conversion does not silently change fixture digests.
No Git initialization is implied. `docs/validation` preserves actual command/advisory evidence.

## Consequences

The foundation is inspectable without service credentials or external data. Source packages
are private and consumed by TypeScript/Next/Vitest, not published compiled libraries. There is
no compatibility guarantee for unsupported schema constructs. Generalized ingestion/diff/AST
analysis requires a separately authorized Phase 2; nothing here runs those operations.
