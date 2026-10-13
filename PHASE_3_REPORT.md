# Phase 3 completion report

## A. PHASE 3 STATUS

**COMPLETE — GO for Phase 4 review only.** Local implementation, comprehensive validation,
normal phase-branch publication and Ubuntu CI passed on the corrected implementation commit.
The final documentation receipt is verified separately in the chat handoff.
Phase 3 provides **local PostgreSQL durable static analysis only**. It does not run consumer
code, reproduce a provider failure, generate a repair, call a model or operate a hosted service.

## B. AUTHORIZATION AND BRANCH BASE

The owner explicitly authorized Phase 3 and subsequently approved verified official EDB
PostgreSQL 17 Windows x64 binaries under ignored `.local`, a disposable IPv4-loopback database,
and dedicated least-privilege roles. No Windows service, system PATH change, Docker/WSL,
cloud provisioning, deployment, PR, merge, release or Phase 4 was authorized or performed.

Working branch: `phase/03-durable-investigations`, created from exactly
`6a67eb871fcebd015acccb5fdce63d04c95d0097` after fetching and checking the published Phase 2 head.
The original working tree was clean. Local and remote `main` remain
`0659e16936f4af63f7b5bd2220fecbafe8c1a17b`. The remote Phase 3 branch was absent at preflight.
The existing baseline passed `check` (404 tests, fixtures, build and six smoke checks),
`test:analysis` (327 tests), and the actual fixture CLI before implementation.

## C. ARCHITECTURE DECISION

[ADR 0003](docs/adr/0003-durable-coordination.md) was written before major implementation.
PostgreSQL owns runs, canonical deduplication, reservations, queue delivery, leases and audit.
Explicit SQL through `pg@8.23.1` was selected over Drizzle ORM/Kit: the critical invariants
still require reviewed transactions, locks, conditional updates and database constraints.
A local Inngest server was deferred because it would add a second delivery boundary without
replacing these invariants. No ORM, workflow service or cloud dependency was installed.

The unchanged Phase 2 analyzer runs in a bounded project-authored worker thread. Selected
consumer TypeScript is parsed as data. A filesystem CAS holds exact immutable bytes; PostgreSQL
references them only after verification. CAS writes and database commits are separate effects,
so explicit orphan reconciliation and conservative retention handle their crash windows.

The implementation combines related SQL transitions in `coordinator.ts` and composition in
`service.ts`, rather than adding empty per-feature modules. Future hosted workflow transport
and object-store adapters must preserve stable event identity, fencing, reference verification
and conditional publication; no such adapter is represented as implemented.

Observed limits: one trusted local workspace, two active workers, 1,000 retained runs,
128 MiB aggregate reservation/store limits, 1,200,000 ms workspace compute allowance;
default run ceiling three attempts, 120,000 ms compute/deadline and 8 MiB output reservation.
The analyzer has a maximum 30-second supervised operation, 256 MiB V8 old-generation heap
and 4 MiB stack. These are not OS process isolation or total RSS guarantees.

## D. CHANGED FILES

Full proposed inventory (48 files):

| Repository path                                             | Purpose                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `.env.example`                                              | Comments-only configuration inventory                            |
| `.github/workflows/ci.yml`                                  | Real ephemeral PostgreSQL CI gate                                |
| `AGENTS.md`                                                 | Permanent workflow plus authorized Phase 3 boundary              |
| `PHASE_3_REPORT.md`                                         | Phase completion and publication report                          |
| `README.md`                                                 | Local use and phase boundaries                                   |
| `apps/web/app/status/page.tsx`                              | Truthful static status text                                      |
| `docs/adr/0003-durable-coordination.md`                     | Architecture, operation or scope documentation                   |
| `docs/dependencies.md`                                      | Architecture, operation or scope documentation                   |
| `docs/durable-operations.md`                                | Architecture, operation or scope documentation                   |
| `docs/durable-state-machine.md`                             | Architecture, operation or scope documentation                   |
| `docs/durable-storage-and-retention.md`                     | Architecture, operation or scope documentation                   |
| `docs/durable-threat-failure-matrix.md`                     | Architecture, operation or scope documentation                   |
| `docs/phase-gates.md`                                       | Architecture, operation or scope documentation                   |
| `docs/security-boundaries.md`                               | Architecture, operation or scope documentation                   |
| `docs/supported-scope.md`                                   | Architecture, operation or scope documentation                   |
| `docs/validation/phase-3-verification.json`                 | Sanitized actual verification observations                       |
| `package.json`                                              | Workspace tooling, exact dependencies or typecheck configuration |
| `packages/durable/package.json`                             | Workspace tooling, exact dependencies or typecheck configuration |
| `packages/durable/src/analysis-adapter.test.ts`             | Executable regression/security tests                             |
| `packages/durable/src/analysis-adapter.ts`                  | Bounded unchanged analyzer adapter/worker                        |
| `packages/durable/src/analysis-worker.ts`                   | Bounded unchanged analyzer adapter/worker                        |
| `packages/durable/src/artifacts.test.ts`                    | Executable regression/security tests                             |
| `packages/durable/src/artifacts.ts`                         | Immutable local CAS                                              |
| `packages/durable/src/ci-bootstrap.ts`                      | Ephemeral synthetic CI role setup                                |
| `packages/durable/src/cli.ts`                               | Local durable commands                                           |
| `packages/durable/src/config.test.ts`                       | Executable regression/security tests                             |
| `packages/durable/src/config.ts`                            | Strict private loopback configuration                            |
| `packages/durable/src/contracts.ts`                         | Typed states, limits and guarded transitions                     |
| `packages/durable/src/coordinator.ts`                       | Transactional queue, leases, retries, cancellation and budgets   |
| `packages/durable/src/db/client.ts`                         | PostgreSQL connection, migration or readiness boundary           |
| `packages/durable/src/db/database.test.ts`                  | Executable regression/security tests                             |
| `packages/durable/src/db/migrate.ts`                        | PostgreSQL connection, migration or readiness boundary           |
| `packages/durable/src/db/migration-status.test.ts`          | Executable regression/security tests                             |
| `packages/durable/src/db/migration-status.ts`               | PostgreSQL connection, migration or readiness boundary           |
| `packages/durable/src/db/migrations/001_initial.sql`        | Forward SQL constraints and guards                               |
| `packages/durable/src/db/migrations/002_accounting.sql`     | Forward SQL constraints and guards                               |
| `packages/durable/src/db/migrations/003_storage_guards.sql` | Forward SQL constraints and guards                               |
| `packages/durable/src/identity.test.ts`                     | Executable regression/security tests                             |
| `packages/durable/src/identity.ts`                          | Input-bound request identities                                   |
| `packages/durable/src/service.ts`                           | CAS capture, verified analysis and retention composition         |
| `packages/durable/tsconfig.json`                            | Workspace tooling, exact dependencies or typecheck configuration |
| `pnpm-lock.yaml`                                            | Workspace tooling, exact dependencies or typecheck configuration |
| `scripts/local-postgres.ps1`                                | Verified approved local PostgreSQL control helper                |
| `tests/durable/cli.test.ts`                                 | Executable regression/security tests                             |
| `tests/durable/helpers.ts`                                  | Real DB/process test harness                                     |
| `tests/durable/integration.test.ts`                         | Executable regression/security tests                             |
| `tests/durable/process-harness.ts`                          | Real DB/process test harness                                     |
| `tests/durable/process.test.ts`                             | Executable regression/security tests                             |

Existing analyzer/core/fixture/demo sources, schemas, fixture inputs/oracle, tests/goldens and completion reports
are byte-unchanged relative to the approved parent. The status-page text is the only web change;
it still serves a static export and makes no live persistence claim.

## E. PERSISTENCE MODEL

Three forward migrations are checked in; applied SQL checksums are immutable:

- `001_initial.sql`: workspace, input blobs, runs/inputs, steps and lease columns,
  outbox/inbox, limits/reservations, artifacts, audit and storage events; scoped foreign keys,
  unique identities, bounded counters, transition and append-only guards.
- `002_accounting.sql`: claimed-at timing and distinct measured/estimated compute accounting.
- `003_storage_guards.sql`: immutable storage identity and reference/retention guards.

`schema_migrations` is created by the migrator and records version, SHA-256 and DB timestamp.
Migrations use an advisory lock and one transaction per version; repeat application checks
checksums. A failed migration rolls back. `doctor` verifies exact versions 1/2/3 and their
checked-in checksums read-only; missing, older, modified or unknown future versions fail.
It does not reconstruct all live DDL against a hostile database owner.

Submission holds the workspace quota row and atomically creates/reuses the canonical run,
input references, reservation, step, outbox intent and initial audit. Request-key uniqueness
and token binding prevent concurrent duplication or wrong-input cache hits. Manifest cardinality
and completion evidence/audit requirements are also checked at commit. Partial indexes and
readiness/expiry indexes support dispatch, claims and recovery; nullable result/lease fields
are legal only in their defined pre-result or inactive states.

States: `QUEUED`, `CLAIMED`, `ANALYZING`, `CANCEL_REQUESTED`, `CANCELLED`,
`ANALYSIS_COMPLETE`, `STOPPED`, `INDETERMINATE`. Terminal states cannot transition.
The state version and event sequence increase with authoritative transitions. Dispatch persists
receipt, readiness and acknowledgement in one transaction. Claims use database time and
`SKIP LOCKED`; every replacement increments the lease generation and changes attempt/owner IDs.
Finalization and retry recheck owner, generation, attempt and unexpired lease in the conditional
lease-clearing write. Expiry during a delayed transaction rolls back its artifacts, audit and
settlement. Cancellation and completion serialize; a persisted cancellation wins over later
completion, while an already committed terminal result remains terminal.

`requestKey`, input-set digest, run UUID, attempt UUID, fencing generation, artifact raw SHA-256,
and Phase 2 logical result digest are separate identities. Failure diagnostics never replace
input-bound request identity. Runtime credentials cannot migrate, rewrite audit, alter captured
inputs/artifact references, increase quota ceilings or change blob identity. This is a trusted
single-owner local boundary; scoped SQL keys do not provide authenticated SaaS tenancy.

CAS writes use private exclusive staging, file flush, non-replacing publication and verified
reuse. Reads check digest, size, regular-file/link and ancestor properties. Worker reads use
only captured CAS inputs; missing/tampered evidence never refreshes from original paths.
Store capacity includes staging; blobs have a 4 MiB bound and the store a 4,096-entry bound.
Retention is dry-run by default, protects references, gives orphans a seven-day delay and
records `DELETE_PENDING` then `DELETED` tombstones. Interrupted pending deletion resumes.
A tombstoned digest is not silently resurrected. Referenced evidence/history has no automatic
purge or quota reset in this phase. A crash inside a CAS lock operation can require quiesced
operator inspection; there is no automatic stale-lock theft.

## F. IMPLEMENTED END-TO-END WORKFLOW

Executed CLI commands include:

```powershell
corepack pnpm durable:migrate
corepack pnpm durable:doctor
corepack pnpm durable:submit --fixture
corepack pnpm durable:worker --until-idle
corepack pnpm durable:status --run-id 960b9a75-080b-40e7-a387-7bd85883ae5e
corepack pnpm durable:events --run-id 960b9a75-080b-40e7-a387-7bd85883ae5e
corepack pnpm durable:verify --run-id 960b9a75-080b-40e7-a387-7bd85883ae5e
corepack pnpm durable:reconcile --dry-run
corepack pnpm durable:gc --dry-run
```

Doctor reports real PostgreSQL `17.11`, IPv4 loopback, nonsuperuser runtime and migration
versions `[1,2,3]`. The persisted demonstration run above has request key
`2638b7fab6615c6ac723768c72cfc2bec8baa188ce9aa5be0721b35eeb91633c` and input-set digest
`82d0dc62ede395f8219d72dc6b7609fb58029e6030fd1e7329d4484e6307e206`.
It moved through versions 0/1/2/3: QUEUED, CLAIMED, ANALYZING, ANALYSIS_COMPLETE, with one
attempt/generation and one settlement. Creation was `2026-10-12T14:33:02.327Z`; completion
was `2026-10-12T14:33:04.056Z`. A separate fresh-schema measurement records its own workspace
and request identities in the verification JSON; workspace-bound request identities differ
while the Phase 2 evidence digest remains identical.

Actual read-back independently recomputes the unchanged logical result:

```json
{
  "runDigest": "1926cf8adad96f725e1ff13196e25913e9adaf77bae9c9d5747381ba1d4c127c",
  "deltas": 2,
  "usages": 1,
  "impacts": 1,
  "unresolved": 1,
  "replayExecuted": false,
  "repairExecuted": false,
  "modelInvocations": 0
}
```

The evidence remains one conditional lexical impact, not runtime failure proof. The source
adapter, two contracts and curated mapping contribute 7,303 captured bytes; canonical JSON is
8,732 bytes and the escaped report is 3,697 bytes, totaling 19,732 retained bytes for that run.
JSON raw artifact SHA-256 is
`8b70620e0b9d259831d727fa6cf9f9a92abef299e7dd49dfbad763642a940f81`;
report SHA-256 is `c8a5cb9ecf81f09a9b1b5517871a3d6553fa9f729a98cdb4430c61d57a494d75`.

At `2026-10-13T08:48:42.959Z`, one fresh isolated investigation measured 145.90 ms submission,
937.73 ms submission-to-completion and 365.97 ms additional verification. Its parent RSS sample
was 149,852,160 bytes; OS process maximum-RSS counter was 200,128 KiB. These do not isolate
worker memory or establish a load benchmark. The measured schema occupied 589,824 bytes;
the disposable test database was 16,324,275 bytes at that observation. A separate filesystem
sample counted 107,497,497 bytes for the entire cluster and six PostgreSQL processes totaling
32,653,312 bytes of working sets; shared pages may be counted more than once. The verified
EDB archive is 381,531,864 bytes and extracted distribution 1,002,085,601 bytes. No monetary
hosting estimate or external service charge is asserted.

## G. FAULT INJECTION AND DURABILITY PROOF

All local rows below were executed against real PostgreSQL; CAS/identity/adapter unit tests
supplement the database tests. No durability test was replaced by an in-memory database.

| Gate | Executed evidence / result                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D01  | Fresh isolated migrations, repeat/checksum checks, read-only readiness; PASS                                                                                       |
| D02  | Failed migration rolls back DDL and migration-ledger version; submission constraints also prevent partial reservations; PASS                                       |
| D03  | Captured MercuryPay bytes independently match raw source hashes; PASS                                                                                              |
| D04  | Remove all selected originals after capture; persisted analysis still verifies; PASS                                                                               |
| D05  | Tampered captured input stops with integrity failure, no source refresh; PASS                                                                                      |
| D06  | Six genuinely concurrent SQL submissions plus six service/artifact-lock submissions produce one run/reservation/intent; PASS                                       |
| D07  | Reused token with changed inputs conflicts; PASS                                                                                                                   |
| D08  | Different invalid input sets with equal diagnostics retain different request identities; PASS                                                                      |
| D09  | Actual producer process killed after commit before acknowledgement; committed outbox recovered; PASS                                                               |
| D10  | Duplicate dispatch deduplicates; test-only PG trigger fails after receipt/readiness before acknowledgement, entire transaction rolls back then delivers once; PASS |
| D11  | Real overlapping claims yield one active owner; PASS                                                                                                               |
| D12  | Expired/replaced owner cannot finalize; delayed result insertion expires inside finalization and rolls back refs/audit/budget; PASS                                |
| D13  | Actual process killed while trusted analysis promise is in flight; recovery completes attempt/generation 2; PASS                                                   |
| D14  | Actual process killed after real result/report staging before DB commit; two orphans, no false completion, bounded retry; PASS                                     |
| D15  | Cancellation before claim prevents execution and settles once; PASS                                                                                                |
| D16  | Concurrent cancellation/completion, cancellation before start, and cancellation followed by crash/expiry settle once; interrupted usage explicitly estimated; PASS |
| D17  | Unsupported OpenAPI and malformed TypeScript stop without retry or claim promotion; PASS                                                                           |
| D18  | Transient retry/backoff plus injected heartbeat ECONNRESET during actual verification requeues, then real attempt 2 succeeds; PASS                                 |
| D19  | Attempt, remaining-compute and persisted deadline exhaustion terminate without leaked reservation; PASS                                                            |
| D20  | Concurrent admission enforces quota without negative/oversubscribed counters; PASS                                                                                 |
| D21  | Self-rehashed forged result rejected by independent CAS-based recomputation; PASS                                                                                  |
| D22  | Malformed/cross-scope identifiers, immutable fields and runtime privilege violations rejected; PASS within local trust boundary                                    |
| D23  | Invalid terminal transitions rejected in pure guard and SQL; PASS                                                                                                  |
| D24  | Missing/tampered blobs, links/junctions and forged artifact paths fail closed; PASS                                                                                |
| D25  | Hostile comments stay inert, escaped report/public summaries omit canary; CLI does not echo injected credentials/commands; PASS                                    |
| D26  | Exact unchanged Phase 2 digest and 2/1/1/1 counts; PASS                                                                                                            |
| D27  | Fresh DB clients and independent processes preserve event order, settlement and verified evidence; PASS                                                            |
| D28  | Dry-run nonmutation, protected references, interrupted pending deletion and audited tombstone; PASS                                                                |
| D29  | Windows filesystem/link tests and explicit literal IPv4 policy; unsupported hostname/IPv6/socket configuration rejected; PASS locally                              |
| D30  | All 404 prior tests plus 92 new tests pass locally and on Ubuntu CI; PASS                                                                                          |

The SQL-only coordinator tests intentionally use synthetic artifact metadata to isolate
transaction enforcement. They do not prove real analysis; service and process suites run the
actual unchanged analyzer and independent verifier. The D18 connection fault is injected at
the heartbeat method while real verification/DB transitions run; it is not a network outage
benchmark. D13/D14 kill actual Node processes. Event timestamps, generations and budgets are
asserted/recorded in test evidence. No power-loss or arbitrary-host isolation proof is claimed.

A separate actual PostgreSQL server interruption ran from `2026-10-13T16:16:47.631Z` to
`2026-10-13T16:16:49.179Z`: immediate shutdown while a transaction held an uncommitted marker,
then restart with explicit loopback/port overrides. The committed marker survived, the
uncommitted marker rolled back, and the existing demonstration run, events and budgets were
byte-identical on read-back. CAS-based recomputation returned the unchanged digest. The server
log explicitly reported interrupted shutdown, WAL recovery and readiness. Settings verified
fsync/synchronous_commit/full_page_writes=on. This is server-process recovery, not power-loss
testing. Probe schemas were removed only after their known synthetic contents were checked.

## H. VALIDATION

Windows PowerShell 7.6, Node 24.21.0, Corepack 0.36.0, pnpm 11.25.0, native PostgreSQL 17.11.
Actual structured observations are in [phase-3-verification.json](docs/validation/phase-3-verification.json).
Raw outputs/credentials remain ignored under `.local`.

| Command/check                                              | Actual local result                                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile --ignore-scripts` | Exit 0; lockfile unchanged, lifecycle scripts disabled                                  |
| `corepack pnpm check`                                      | Exit 0; all constituent gates completed                                                 |
| Strict TypeScript / ESLint / Prettier                      | PASS; zero lint warnings                                                                |
| Full `vitest run`                                          | **496/496**, **23/23 files**, 27.82 s; zero skipped                                     |
| `test:fixtures`                                            | **37/37**, 466 ms                                                                       |
| `test:analysis`                                            | **327/327**, **10 files**, 2.62 s                                                       |
| `test:durable`                                             | **92/92**, **9 files**, 29.71 s                                                         |
| `analyze:fixture`                                          | Exit 0; unchanged digest/counts; observed processing 430 ms                             |
| Production static build                                    | PASS; four application routes and static not-found                                      |
| HTTP smoke                                                 | **6/6**, including 404 and unsupported-method 405                                       |
| `durable:migrate` / `durable:doctor`                       | Exit 0; real migrated PG17.11, versions 1/2/3, runtime nonsuperuser                     |
| `corepack pnpm audit --json`                               | Exit 0; zero info/low/moderate/high/critical advisories across 257 entries              |
| Resolved new dependency manifests                          | 15 packages: 13 MIT, 2 ISC; no install/prepare hooks                                    |
| Phase 1/2 preservation                                     | No diff in original analysis/core/fixtures/demo/tests/reports                           |
| Publication scan and whitespace                            | No credential/private-path/binary/unwanted-artifact findings; `git diff --check` passes |
| Hosted Ubuntu CI                                           | PASS on corrected implementation SHA; every job step succeeded (details below)          |

Failures encountered and fixed are retained: initial initdb password argument parsing; initial
TypeScript row/readonly/IPC callback typing and lint issues; PostgreSQL `42P08` parameter inference
fixed with an explicit integer cast; a D28 query used `sequence` instead of `event_id`; doctor
initially compared an inet text value containing `/32` instead of `host(inet_server_addr())`.
The new GC regression initially passed 13/14 because returned pending count stayed 1 after
successful deletion; refreshing inventory fixed it and 14/14 passed. A dependency inventory
probe initially missed pnpm's peer-suffixed directory, then resolved the installed manifests.
The first full-runtime helper verification was interrupted for excessive command overhead;
its path inspection was changed to native .NET attributes before rerunning. No downloaded
executable was invoked by that interrupted check. The final helper verified all **20,489**
extracted files and the sole loopback listener. The extra server-crash harness first blocked
on inherited output handles; using ignored child stdio corrected that. Its next attempt failed
`CAS_NOT_INITIALIZED` because the harness omitted store initialization. After correction, all
committed/uncommitted recovery and evidence assertions passed. These were harness failures,
not successful first attempts or suppressed product failures.

Review additionally fixed query-pool starvation by advisory-lock waiters, in-transaction lease
expiry, pending-GC recovery, remaining compute budgets, measured versus estimated accounting,
interrupted-cancellation charge and heartbeat error classification. The added regression tests
passed before the comprehensive final suite. No oracle or security guard was weakened.

The initial Ubuntu CI run [38429621727](https://github.com/arslanabdulghaffar/DriftReplay/actions/runs/38429621727)
passed setup/migration/type/lint/format, then failed **1/496** tests (495 passed): doctor
reported DATABASE_PERMISSION_DENIED because it confused PostgreSQL's backend address behind
a container port mapping with the client's literal loopback destination. Later gates were
skipped. The correction preserves literal-127.0.0.1 configuration and role checks, and reports
serverAddressIsLoopback separately. No CI-only permission bypass was added. The version
assertion now permits a distribution suffix after the pinned 17.11 version. This follows
[GitHub's documented service-container port mapping](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).

The corrected [Actions run 38430520989](https://github.com/arslanabdulghaffar/DriftReplay/actions/runs/38430520989)
ran on Ubuntu 24.04 from `2026-10-13T16:26:34Z` through `16:28:11Z` and succeeded for
`eca08b149b353e55f33ce905bdef6c8187f0d510`. All 22 job steps succeeded, including setup,
frozen install, role bootstrap, migration, doctor, typecheck, lint, formatting, every test
gate, actual analysis CLI, production build, six smoke checks and cleanup. Retrieved job logs
confirm **496/496** tests across 23 files (18.97 s), fixtures **37/37** (258 ms), analysis
**327/327** (2.41 s), and durable **92/92** (17.21 s). No test gate was skipped. Actual server
version was `17.11 (Debian 17.11-1.pgdg12+2)`; doctor reported the constrained loopback client
and a non-loopback container backend separately, with the runtime role unprivileged.

## I. SECURITY AND PRIVACY

Archive authenticity/integrity was established before execution using the official EDB binary
listing and its publisher checksum. SHA-256:
`80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f`.
Sources actually consulted: [EDB distribution](https://www.enterprisedb.com/download-postgresql-binaries)
and [publisher checksum comment](https://github.com/EnterpriseDB/edb-installers/issues/731#issuecomment-6014410619).
The publisher account's authority was corroborated by recorded closure of others' issues in
EDB's repository; this is an inference of delegated authority, not a signed checksum manifest.
The inspected PostgreSQL utilities reported unsigned. No Authenticode success is claimed.

The helper verifies extracted bytes against that verified ZIP before execution and rejects
changed/unexpected files or reparse paths. The disposable server uses `127.0.0.1:54329`, SCRAM,
fsync/synchronous_commit/full_page_writes enabled and max_connections 30. Bootstrap is used
only for environment setup; separate nonsuperuser runtime/migrator roles have no create-role,
create-database or replication rights. PUBLIC database/schema permissions are revoked.
Credentials and raw evidence are ignored local files; local runtime/data/credential directories
have ACL inheritance disabled and access limited to the operator, SYSTEM and Administrators.
No credentials, archives or extracted binaries are published.

The new dependency inventory has no install lifecycle hooks. `pg-int8@1.0.1` and `split2@4.2.0`
are ISC; the other 13 additions are MIT. pg-cloudflare is an unused optional transitive package,
not a provisioned integration. Existing binary/license flags and the unselected project license
remain future redistribution concerns; the EDB bundle is not redistributed.

CI retains immutable action pins, `contents: read`, disabled checkout credential persistence,
frozen installs and disabled dependency scripts. Its PG17.11 image digest was retrieved from
the registry, not invented. Loopback port mapping and three clearly synthetic CI passwords
serve the ephemeral test database only; no production secret, cloud token or deploy step exists.

Publication scanning covers all tracked and proposed untracked files, UTF-8/binary checks,
credential patterns, private paths and exact local runtime/migration password values without
printing them. The comments-only `.env.example` is intentional. `.gitignore` excludes local
data, binaries, keys, credentials, node_modules, generated builds, caches and actual env files.
An empty scan/advisory result is not proof that every possible vulnerability or secret is absent.

Consumer comments/spec descriptions are inert data. No network ingestion, reference fetch,
consumer import/eval, custom worker command, shell-derived source execution, model call,
provider request or product GitHub writer exists. Selected source can legitimately remain
in private evidence; public CLI summaries are not a blanket redaction guarantee for all CAS.

## J. LIMITATIONS AND TECHNICAL DEBT

- Single-owner local trust only: runtime SQL credentials and the database/machine owner are
  trusted. Scoped keys are not authentication, revocation, RLS or hostile-tenant isolation.
- Filesystem TOCTOU and same-device mount races remain; Windows file flush does not establish
  directory-fsync or power-loss safety. Abrupt CAS-lock interruption can require manual review.
- PostgreSQL and CAS are not one transaction. Reconciliation and retention handle tested
  windows; full automatic recovery from every filesystem failure is not claimed.
- Referenced history has no automatic pruning or workspace quota reset. Shared blobs may be
  conservatively charged per run; tombstoned digest resurrection is deliberately blocked.
- Compute is elapsed time rather than CPU billing. Interrupted attempts use separately marked
  DB-time estimates; process heap bounds do not cap all native memory or RSS.
- `worker --until-idle` processes currently ready work and can exit while a backoff is pending.
  Another invocation is needed; no installed background daemon or scheduler exists.
- `reconcile --dry-run` inventories storage only; `--apply` also performs expired-lease recovery.
- Current migration ledger readiness does not attest arbitrary owner-mutated DDL. Migration
  and readiness catalogs must remain synchronized; a real fresh-migration test guards this.
- The deterministic OpenAPI/TypeScript subset and conservative helper unknowns remain exactly
  Phase 2's limits. No integration availability, runtime reachability or patch claim follows.
- Dashboard persistence/authentication, hosted services, immutable object storage, stronger
  isolation, signed evidence and production retention are later separately approved work.

## K. PUBLICATION

Target branch: [phase/03-durable-investigations](https://github.com/arslanabdulghaffar/DriftReplay/tree/phase/03-durable-investigations).
Initial implementation commit: `97ee0d56a55a10c5d8cf0e49c71e4063adf3fb52`, directly parented by
the approved Phase 2 SHA. Its CI failure is retained in H. Corrected implementation commit:
**`eca08b149b353e55f33ce905bdef6c8187f0d510`**,
[GitHub commit](https://github.com/arslanabdulghaffar/DriftReplay/commit/eca08b149b353e55f33ce905bdef6c8187f0d510).
Normal push succeeded. `git ls-remote` matched the exact local SHA; GitHub's recursive tree
`c65fe5220e6aff70046d49a3fdede9f5105fff5b` and all **158 tracked files** matched the local tree.
A verification probe initially supplied a commit identifier where the tree identity was needed;
querying the commit's actual tree confirmed equality. No history conflict existed.

The corrected implementation's CI succeeded as detailed in H. The working tree was clean
after its push and before this documentation receipt. Local and remote main remain
`0659e16936f4af63f7b5bd2220fecbafe8c1a17b`. No merge, PR, force push, deployment or release
was performed. Permanent phase-end publishing instructions remain in `AGENTS.md` and
`docs/development-workflow.md`.

This documentation receipt records the corrected implementation SHA and its CI outcome.
That receipt cannot contain its own containing commit hash. The final chat handoff will provide
the final pushed HEAD, exact remote equality, CI outcome and working-tree status.

## L. PHASE 4 DEPENDENCY GATE

GO means readiness for **Phase 4 review only**. It does not authorize Phase 4 implementation.
Before runtime proof, the owner must approve an isolated fixed fixture harness, exact runtime
and dependency provenance, network/secret restrictions, CPU/memory/time/output limits, immutable
business inputs/oracle and safe interruption/cleanup. It must independently demonstrate
baseline PASS / changed-version FAIL / patched PASS with unchanged fixture inputs/assertions,
and distinguish fixture-only proof from real-provider compatibility. Repair generation and
arbitrary repository execution remain unauthorized. Phase 3 adds persistence, not that proof.

## M. FINAL STATUS

PHASE 3 COMPLETE — LOCAL POSTGRES DURABLE ANALYSIS ONLY — NO REPLAY/MODELS/CLOUD/PR WRITES — PHASE BRANCH PUSHED — AWAITING PHASE 4 REVIEW
