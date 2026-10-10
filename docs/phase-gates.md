# Phase authorization and dependency gates

Only Phase 1 is authorized. Completion recommends review; it does not authorize Phase 2.

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

## Phase 2 prerequisites

Review the Phase 1 report, exact dependency selection, fixture artifacts/digests, admission-policy
limitations, and static validator coverage. Select an OpenAPI diff adapter in a separate reviewed
dependency decision; none is installed now. Define support and unknown outcomes before implementing
ingestion or AST mapping. Decide source allowlists and safe resource bounds. Continue using real
pre-Git tree digests until Git is explicitly authorized; never invent commit identities.

External services, Git initialization, repository access, model keys, remote runners, PR writing,
and deployment each remain outside this phase. Every future phase requires its own authorization,
changed-file inventory, actual commands/results, limitations, and a go/no-go decision.
