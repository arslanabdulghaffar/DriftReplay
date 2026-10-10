# Phase authorization and dependency gates

Phase 1 is published. Phase 2 is explicitly authorized on `phase/02-deterministic-analysis`
from reviewed main `0659e16936f4af63f7b5bd2220fecbafe8c1a17b`. Completion recommends
Phase 3 review; it does not authorize Phase 3 implementation or a merge to main.

| Phase | Work and acceptance boundary                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------- |
| 0     | Read-only architecture review; completed before implementation authorization                                           |
| 1     | Local workspace, evidence contracts, static fixtures, UI, docs and actual local checks                                 |
| 2     | Supported snapshot ingestion, deterministic diff adapter and exact TypeScript usage mapping; golden and negative tests |
| 3     | Durable state, bounded coordination, idempotency, cancellation and budgets; crash/retry evidence                       |
| 4     | Approved isolated fixture harness and reviewed reference patch; unchanged-oracle three-variant proof                   |
| 5     | Persisted proof UI and accessible investigation states; no invented runs                                               |
| 6     | Selected-repository GitHub read mode; authorization, revocation and webhook tests                                      |
| 7     | Bounded patch generation and verification; optional separately approved demo PR writer                                 |
| 8     | Comprehensive security, operational, retention, cost and recovery gates                                                |
| 9     | Explicitly approved deployment/publication with actual smoke tests, costs and license decision                         |
| 10    | Evidence-led narrow expansion ADR before implementation                                                                |

## Phase 2 decision and gates

The reviewed baseline, byte-pinned fixture and admission policy remain preserved. The adapter
decision is [ADR 0002](adr/0002-deterministic-analysis.md); the strict subset, AST patterns,
local resource limits and evidence predicates are documented separately. Both local validation
and branch GitHub Actions must pass before a completion claim. Runtime proof remains Phase 4+.

Normal publication of the authorized phase branch is allowed. Product GitHub integration,
external services, model keys, remote runners, PR writing and deployment remain excluded.
Every future phase requires its own authorization,
changed-file inventory, actual commands/results, limitations, and a go/no-go decision.

## Phase 3 review prerequisites

Review the Phase 2 report, pinned branch and honest unknown outcomes. Before durable coordination,
approve a storage/workflow ADR covering idempotency keys, immutable artifact references,
transaction boundaries, retries, cancellation, retention, costs and failure recovery. Specify
tests for duplicate delivery, crash/restart, partial writes and stale authorization. No database,
scheduler, account, cloud resource or replay runner is authorized by this document.
