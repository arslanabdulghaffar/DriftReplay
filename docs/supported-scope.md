# Supported scope

The preserved Phase 1 validator checks one reviewed MercuryPay synthetic fixture. Its contracts use OpenAPI
3.0.3 JSON with inline object, string, and integer schemas; required fields, bounded integer
amounts, fixed currency/status enums, email annotation, and explicit additional-property rejection.
They contain one POST operation each and success/validation-error response descriptions.

The validator checks the reviewed shape, references, semantics, and byte digests. It is not
a general OpenAPI validator, compatibility diff, JSON Schema engine, or arbitrary-input parser
service. References, composition, callbacks, remote documents, other dialects, and general YAML
are unsupported. An email format annotation does not contact or verify an email service.

## Claim boundaries

| Material                 | Meaning now                                           |
| ------------------------ | ----------------------------------------------------- |
| Contract JSON            | Authored synthetic source content                     |
| Migration mapping        | Curated synthetic correspondence, not inferred rename |
| Static validation result | Fixture consistency and selected schema constraints   |
| Demo consumer            | Unmigrated pure v1 request construction               |
| Behavior definitions     | Unexecuted intended synthetic behavior                |
| Business assertions      | Unexecuted provider-independent oracle definitions    |
| UI proof chain           | Future evidence requirements; static dashboard only   |

STRUCTURAL_BREAK, MATCHED_USAGE, POTENTIAL_IMPACT, REPRODUCED_FAILURE, PATCH_VERIFIED,
UNVERIFIED, and NOT_APPLICABLE have distinct types. The Phase 1 foundation guard still admits
no active analysis/replay claim. Core schemas cannot represent an executed runtime attestation. The admission
guard refuses claims that need later capabilities, even if caller-authored references look valid.

Phase 2 adds a separate local analyzer and recomputation-based evidence predicate. Supported
structural changes and lexical matches can justify conditional `POTENTIAL_IMPACT`; they cannot
justify runtime failure or patch verification. Read the [OpenAPI matrix](openapi-support-matrix.md),
[AST patterns](typescript-analysis-patterns.md), [evidence policy](analysis-evidence-policy.md),
and [operational limits](phase-2-operational-limits.md). The static dashboard does not ingest
these local reports or scan arbitrary repositories.

## Phase 3 local durable investigations

The local CLI can submit explicitly selected approved-local files, capture and hash their
bytes, create or reuse a canonical investigation, and persist its reservation, outbox intent
and audit history in PostgreSQL. Trusted workers analyze the recorded CAS inputs, verify
the Phase 2 result by recomputation and store separate machine JSON and human Markdown
artifacts. Operators can inspect, cancel, verify and reconcile durable work. The analyzer's
OpenAPI subset, lexical evidence limits and curated MercuryPay mapping remain unchanged.

`ANALYSIS_COMPLETE` means that a persisted static result passed the local verification
boundary. Its output still states `replayExecuted: false`, `repairExecuted: false` and
`modelInvocations: 0`. `STOPPED`, `INDETERMINATE` and `CANCELLED` remain explicit outcomes;
an input-free diagnostic digest never replaces input-bound request identity.

This is one trusted local owner's database and artifact store. There is no public submission
endpoint, live dashboard/database integration, authenticated tenant system, GitHub App,
remote repository discovery or selected-source execution. The durable CLI does not install
consumer dependencies, run consumer tests, fetch provider releases, invoke payment services,
call models, generate patches or write PRs. Publishing reviewed project source to an authorized
phase branch is a separate development workflow.

Initial operation is deliberately finite: at most two active workers, three attempts per run,
a 120-second run deadline, a 120,000 ms reserved elapsed-work allowance per run, and an 8 MiB
combined output reservation. CAS allows 4 MiB per blob, 128 MiB total and 4,096 files, including
abandoned staging. Workspace reservations/charges also have finite run, byte and work ceilings.
Retries use persisted scheduling; `worker --until-idle` drains currently ready work and exits,
so later-ready retries require another invocation. There is no automatic history purge or
quota reset. See [operations](durable-operations.md) and [storage/retention](durable-storage-and-retention.md).

Crash recovery is coordination recovery, not business-runtime replay. Repeated analysis can
occur after interruption; only a current fenced owner may publish authoritative completion.
Missing/tampered artifacts fail closed. Filesystem writes and PostgreSQL are not one atomic
transaction, and an interrupted CAS lock may require quiesced operator recovery. These controls
do not prove hostile-host isolation, multi-tenant security, signed evidence or power-loss safety.
The Phase 3 report records actual validation/publication outcomes; this scope description does
not claim all final tests or CI have passed.

Static fixture test success does not demonstrate baseline PASS / changed FAIL / patched PASS.
It does not establish actual-provider behavior, automatic repair, complete API support,
business adoption, false-positive rates, or production security.
