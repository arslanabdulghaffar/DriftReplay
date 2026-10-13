# Phase authorization and dependency gates

Phase 1 is published on `main`. Phase 2 was published on `phase/02-deterministic-analysis`;
its reviewed final commit is `6a67eb871fcebd015acccb5fdce63d04c95d0097`. The owner separately
authorized Phase 3 on `phase/03-durable-investigations` from that exact commit, followed by
verified workspace-local PostgreSQL setup. `main` remains at the Phase 1 commit
`0659e16936f4af63f7b5bd2220fecbafe8c1a17b`. Neither a phase authorization nor its publication
authorizes a merge, deployment or implementation of the next phase.

| Phase | Work and acceptance boundary                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------ |
| 0     | Read-only architecture review; completed before implementation authorization                                             |
| 1     | Local workspace, evidence contracts, static fixtures, UI, docs and actual local checks                                   |
| 2     | Supported snapshot ingestion, deterministic diff adapter and exact TypeScript usage mapping; golden and negative tests   |
| 3     | Local PostgreSQL, captured-byte CAS, durable outbox/inbox, fenced workers, cancellation and budgets; real DB/crash tests |
| 4     | Approved isolated fixture harness and reviewed reference patch; unchanged-oracle three-variant proof                     |
| 5     | Persisted proof UI and accessible investigation states; no invented runs                                                 |
| 6     | Selected-repository GitHub read mode; authorization, revocation and webhook tests                                        |
| 7     | Bounded patch generation and verification; optional separately approved demo PR writer                                   |
| 8     | Comprehensive security, operational, retention, cost and recovery gates                                                  |
| 9     | Explicitly approved deployment/publication with actual smoke tests, costs and license decision                           |
| 10    | Evidence-led narrow expansion ADR before implementation                                                                  |

## Phase 2 decision and gates

The reviewed baseline, byte-pinned fixture and admission policy remain preserved. The adapter
decision is [ADR 0002](adr/0002-deterministic-analysis.md); the strict subset, AST patterns,
local resource limits and evidence predicates are documented separately. Both local validation
and branch GitHub Actions must pass before a completion claim. Runtime proof remains Phase 4+.

Normal publication of the authorized phase branch is allowed. Product GitHub integration,
external services, model keys, remote runners, PR writing and deployment remain excluded.
Every future phase requires its own authorization,
changed-file inventory, actual commands/results, limitations, and a go/no-go decision.

## Phase 3 implementation and completion gates

[ADR 0003](adr/0003-durable-coordination.md) selects a local PostgreSQL queue/outbox with a thin
SQL driver, private content-addressed artifacts and trusted Node workers. Inngest remains a
possible later transport. Phase 3 preserves the deterministic Phase 2 analyzer; inspected source
is data, and completed durable runs contain static evidence only.

The environment authorization permits verified EDB PostgreSQL 17 Windows binaries and a
disposable `127.0.0.1` test database under ignored `.local`. It does not permit Windows services,
system PATH changes, Docker/WSL installation, cloud provisioning or public listeners. Runtime
and migration credentials stay private and separate. This document records the scope already
authorized by the owner; it does not grant additional infrastructure permissions.

Completion requires all of the following, with executed results in `PHASE_3_REPORT.md`:

- Exact reviewed Phase 2 ancestry and an unchanged `main`.
- Real PostgreSQL migrations, constraints, rollback and runtime-permission checks.
- Frozen input manifests, verified CAS reads, independent request identities and recomputed
  Phase 2 results. Missing or modified evidence must fail closed.
- Real overlapping submissions, claims and cancellation/completion races; bounded retry,
  lease fencing and atomic budget settlement; duplicate-delivery checks.
- Actual killed-process recovery at the submission and result-publication crash windows,
  process restart readback, and reference-protected retention/tombstone recovery.
- D01–D30 evidence, the original 404 Phase 1/2 tests, `check`, `test:analysis`, `analyze:fixture`
  and the separate real-PostgreSQL `test:durable` gate. Mocks or Ubuntu CI alone cannot substitute
  for local PostgreSQL validation.
- Reviewed publication to the authorized phase branch, remote commit/tree verification and
  inspected final GitHub Actions outcomes. A pending run is not success.

Implementation of these boundaries is separate from completion evidence. This phase map does
not assert that all final tests, security review, publication or CI have passed. See the report
for actual commands, failures, fixes, remaining limits and GO/NO-GO.

## Phase 4 dependency gate

Successful Phase 3 validation can recommend **Phase 4 review only**. Phase 4 still requires its
own explicit authorization and an approved isolated execution harness, fixed business input
and oracle, reviewed reference patch, and baseline PASS / changed FAIL / patched PASS proof.
PostgreSQL persistence and static `ANALYSIS_COMPLETE` are not runtime reproduction. No replay
runner, arbitrary repository execution, model, repair, GitHub App or PR-writing capability is
authorized by this document.
