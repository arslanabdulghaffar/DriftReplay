# Phase 3 threat and failure matrix

The trust boundary is a single approved local operator controlling the workspace and
private PostgreSQL configuration. Source/contract bytes remain untrusted data. There is
no public API, tenant authentication, hosted service or arbitrary consumer execution in
this phase. PostgreSQL privileges and filesystem checks reduce accidental or input-driven
harm; they do not isolate the operator from their own database administrator privileges.

Each D-number below is an acceptance obligation, not a declaration of a passed test.
`PHASE_3_REPORT.md` records the actual named test, environment, observed outcome and any
remaining limitation for every obligation. Tests using mocks do not replace a real database
where a row explicitly requires one.

| ID  | Threat or failure                                                               | Control and observable acceptance proof                                                                                          |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| D01 | Empty database lacks durable constraints                                        | Real PostgreSQL fresh migration creates expected tables, indexes, triggers and checksum/version row                              |
| D02 | Partial upgrade or mutated migration silently changes semantics                 | Repeat migration is stable; deliberately failed migration rolls back; checksum mismatch is rejected                              |
| D03 | Submitted input identity differs from actual bytes                              | Capture MercuryPay into CAS; compare every stored digest/length and source SHA against unchanged Phase 2 bytes                   |
| D04 | Mutable checkout changes an already queued investigation                        | Mutate original source after submit; worker still uses recorded CAS bytes and preserves expected result                          |
| D05 | Truncated or modified evidence becomes authoritative                            | Modify a referenced CAS blob; integrity failure produces explicit stop and no completed result                                   |
| D06 | Concurrent identical submissions double reserve or enqueue                      | Overlapping real database submissions yield one logical run, reservation and canonical intent                                    |
| D07 | Idempotency token returns another input set's result                            | Same token with changed bytes is a conflict; request/input identities remain distinguishable                                     |
| D08 | Shared stopped diagnostic digest collapses different requests                   | Different invalid input sets retain distinct input-bound request/run identities despite equal diagnostic code                    |
| D09 | Process exits after commit but before notification                              | Committed outbox intent is found and delivered after restart; no in-memory notification is required                              |
| D10 | At-least-once delivery repeats an effect                                        | Duplicate event delivery/inbox attempts preserve one handler effect and expected audit count                                     |
| D11 | Two workers execute with simultaneous authority                                 | Overlapping real claims admit one current fenced owner of a step; active-worker quota stays bounded                              |
| D12 | Expired worker overwrites replacement worker                                    | After real expiry and takeover, stale generation cannot finalize artifacts, settle/refund budget or append completion audit      |
| D13 | Worker dies while analysis is underway                                          | Terminate a real trusted worker process; restart after expiry yields bounded recovery or truthful terminal outcome               |
| D14 | Staged result blob is mistaken for committed completion                         | Kill after staging and before result commit; run stays incomplete and orphan reconciliation identifies the blob                  |
| D15 | Cancellation before claim still runs analysis                                   | Persist cancellation first; no execution claim, one terminal cancellation and one settlement                                     |
| D16 | Cancellation races successful completion                                        | Overlapping cancellation/finalization leaves one consistent terminal outcome, audit and budget settlement                        |
| D17 | Unsupported or malformed input retries forever or becomes impact proof          | Deterministic analyzer `STOPPED` remains nonretryable and has no promoted findings                                               |
| D18 | Transient infrastructure error duplicates success                               | Reviewed transient classification uses bounded persisted backoff; retries preserve one accepted completion                       |
| D19 | Deadline/retry exhaustion leaks active work indefinitely                        | Exhaust attempts/deadline; terminal state is truthful and reservations cannot remain permanently active after recovery           |
| D20 | Concurrent admission bypasses quotas                                            | Overlapping reservations hit atomic SQL limits without negative counters or oversubscription                                     |
| D21 | Self-consistent forged evidence bypasses verification                           | Forged digest, altered source citation, promoted claims or mismatched policy fail independent recomputation from exact CAS bytes |
| D22 | Caller supplies forged run/workspace/audit authority                            | Reject malformed/scoped identities and malformed audit binding; retain explicit local-only trust claim                           |
| D23 | Terminal run becomes active again                                               | Pure transition function and real SQL update both reject terminal-to-active changes                                              |
| D24 | Missing artifact, path traversal, symlink or poisoned blob causes arbitrary I/O | Validated digest paths, ancestor/file checks, bounded reads and integrity checks fail closed without consumer execution          |
| D25 | Source prompt/log/report injection leaks a secret canary                        | Treat instructions as source data; escape human output and keep default logs/publication free of the seeded canary               |
| D26 | Coordination changes deterministic analysis identity                            | Identical captured bytes and policy produce the unchanged Phase 2 digest and static-only execution flags                         |
| D27 | Restart loses state, evidence or event order                                    | Independent process reconnects to the same real database and verifies persisted state, artifacts and ordered audit               |
| D28 | Maintenance deletes referenced evidence or hides deletion                       | Default dry-run changes nothing; live references protect blobs; eligible deletion has auditable intent/tombstone                 |
| D29 | Windows/Linux differences are silently treated as equivalent                    | Exercise supported Windows path/loopback behavior; explicitly report unavailable symlink/directory-sync/socket behavior          |
| D30 | New durability layer breaks existing product or skips DB tests in CI            | Preserve original 404 tests and all prior gates; execute new real PostgreSQL tests locally and inspect final Ubuntu CI steps     |

## Test locations

The test names retain their D-number so an execution log can be joined to this matrix:

- [Database tests](../packages/durable/src/db/database.test.ts): migrations/privileges,
  D06–D07, D10–D12, D15–D16, D18–D20 and D22–D23 with real PostgreSQL.
- [Service integration tests](../tests/durable/integration.test.ts): frozen MercuryPay input,
  changed originals, corrupt/missing artifacts, pool-pressure submissions, stopped identities,
  forged evidence, secret canary, fresh-client readback and retention.
- [Process tests](../tests/durable/process.test.ts): D09 kills the producer after commit;
  D13 kills a process with supervised analysis in flight; D14 kills after verified blob
  staging; D27 compares independent process readbacks. Their
  [IPC harness](../tests/durable/process-harness.ts) is test-only and exposes no production
  fault flag, arbitrary worker path or shell command.
- [Analysis adapter tests](../packages/durable/src/analysis-adapter.test.ts): actual trusted
  threads, cancellation/deadline, exact digest preservation and forged-output rejection.
- [CAS tests](../packages/durable/src/artifacts.test.ts),
  [manifest tests](../packages/durable/src/identity.test.ts),
  [configuration tests](../packages/durable/src/config.test.ts) and
  [CLI tests](../tests/durable/cli.test.ts): negative filesystem/identity/configuration
  boundaries and local-output privacy.
- D30 combines the unchanged Phase 1/2 regression suites, the explicit durable gate,
  build/smoke checks and inspection of the final GitHub Actions run. Source files and
  workflow configuration alone are not execution evidence.

## Cross-cutting security boundaries

**Prompt injection and malicious consumer code.** Input annotations are data. The analysis
adapter starts only a fixed project-owned worker and never imports selected source,
evaluates tsconfig/plugins, invokes consumer scripts or accepts arbitrary worker paths.
The runtime has no model, repair, provider-request or PR-writing capability to redirect.
This is capability exclusion, not a claim that prompt text can be perfectly classified.

**SSRF and database exposure.** No remote ingestion or OpenAPI reference resolution exists.
Database configuration permits only literal `127.0.0.1` with a bounded port and restricted
identifiers. There is no caller-supplied connection URL, URL fetcher, hostname resolution or
Unix-socket escape in the CLI contract. Configuring the actual PostgreSQL listener and host
authentication remains an environment responsibility verified separately.

**Credentials and private data.** Real credentials, database data, downloaded binaries and
raw artifacts live beneath ignored `.local`. The runtime account has no migration/grant
authority. Stable error codes replace raw database/OS error text in default CLI output.
Selected source excerpts can legitimately exist in private machine evidence; do not claim
that all CAS content is secret-free. Review proposed publication bytes independently.

**Scope and audit integrity.** Workspace IDs are established by the database. Scoped keys,
foreign keys, immutable identity rows and transition audit checks stop accidental cross-run
mixing. They are not authenticated multi-tenant authorization. Audit is append-only under
runtime permissions, not signed, tamper-proof or immune to the database owner.

**Resource abuse.** Admission reserves finite byte/compute capacity before queueing. SQL
constraints and short locked transactions protect counters under concurrency. Analyzer
input/output limits, a bounded trusted thread, CAS capacity, attempt ceilings and elapsed
deadlines bound local work. Worker V8 limits do not cap every native allocation or total
RSS, and a hostile machine owner is outside this boundary.

**GitHub and webhooks.** Product webhook ingestion, GitHub App tokens, repository cloning
and external writes are absent. CI must retain pinned actions, `contents: read`, disabled
checkout credential persistence, frozen installs and disabled lifecycle hooks. Ephemeral
PostgreSQL test credentials are synthetic; there are no production/cloud tokens or deploy
steps. Forged-webhook defenses become meaningful only when webhook ingestion is separately
authorized and implemented.

## Residual risks and future gates

Local filesystem checks cannot eliminate every TOCTOU race or same-device mount substitution.
Abrupt failure while holding the CAS lock intentionally requires operator review rather than
automatic lock theft. Directory flushing differs on Windows; process-crash tests do not
prove power-loss safety. A stolen runtime credential can exercise its local SQL privileges;
the application is not a hostile-client SQL gateway. Finite retention protects referenced
evidence and can fill local quotas without a separately reviewed archive policy.

Phase 4 must separately provide an approved isolated fixture harness and fixed-input,
fixed-oracle baseline PASS / changed-version FAIL / patched PASS execution evidence.
Phase 3 persistence cannot establish that chain. Later hosted use also requires real identity,
authorization/revocation, network isolation, external-effect policy and stronger storage
assurance. None is authorized merely by satisfying this matrix.
