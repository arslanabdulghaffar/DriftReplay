# ADR 0003: local PostgreSQL durable investigations

Status: selected before implementation, 2026-10-11. Phase 3 only.

## Authority and baseline

The owner authorized Phase 3 from `6a67eb871fcebd015acccb5fdce63d04c95d0097`,
then explicitly authorized verified EDB PostgreSQL 17 Windows binaries beneath ignored
`.local`, a disposable localhost database and least-privilege local credentials.
No services, system PATH changes, Docker/WSL, cloud resources, deployment, merge or Phase 4.
The baseline passed `check` (404 tests, 37 explicit fixture tests, build and six smoke
checks), `test:analysis` (327 tests) and `analyze:fixture` before source changes.

## Decision and alternatives

Use PostgreSQL as the authoritative state/queue/budget store, with explicit SQL transactions
through pinned `pg@8.23.1` and `@types/pg@8.23.1` (both MIT). Registry metadata reviewed
before installation declares Node >=16 for pg and no install lifecycle hooks for either.
Retain disabled dependency scripts and review the resolved transitive inventory/advisories.
Use versioned SQL migrations with a migration lock, per-migration transaction and checksum.

Drizzle ORM 0.45.4 (Apache-2.0) and drizzle-kit 0.31.11 (MIT) were evaluated using actual
registry metadata. They are not selected: the central invariants require explicit locking,
fenced conditional updates and triggers regardless of an ORM. Kit adds an esbuild/loader
toolchain without removing that SQL review burden. Do not install either package.

The local Inngest developer server offers workflow inspection and step orchestration,
but would add another runtime and delivery boundary while PostgreSQL must still own
idempotency, immutable references, cancellation and budgets. Select one SQL outbox/inbox
coordinator now. An explicit WorkflowTransport interface can later deliver stable events
to Inngest; transport acknowledgement cannot authorize evidence or replace DB constraints.
This refines the prospective Phase 0 architecture, not a replacement of a deployed service.

## Execution and ownership

One server-created workspace represents a trusted single local operator. The CLI does not
accept workspace or arbitrary audit authority. Scoped keys and foreign keys prepare later
ownership checks but are not multi-tenant authentication. Only literal IPv4 loopback database
connections are admitted. Separate bootstrap, migration-owner and runtime roles; revoke PUBLIC
creation and connection privileges. Runtime cannot migrate, grant rights or mutate audit rows.

Keep Phase 2 unchanged. Capture explicitly selected inputs once, publish private verified CAS
blobs, then transactionally submit a run, reservation, step and stable outbox event. Workers
read CAS only and invoke the pure analyzer in a bounded trusted worker. Verification recomputes
the exact result under the same supervision. Consumer source is never imported or executed.
Machine evidence and escaped human reports have separate artifacts.

Use short transactions and one lock order (workspace budget, run, step/event). Claim queued
work using SKIP LOCKED, increment generation, generate owner/attempt identities, and use the
database clock for expiry. All authoritative finalization and budget settlement require the
current unexpired owner/generation and admissible state version. Analysis runs outside SQL
transactions. At-least-once execution is permitted; exactly-once external execution is not claimed.

Cancellation and completion serialize on the same rows: persisted cancellation wins over
later success; an already committed terminal result remains terminal. Recovery retries only
bounded transient failures/expired interrupted work, with persisted deadlines and jittered
backoff. Input/policy/integrity failures stop without retry. Terminal transition and immutable
identity guards exist in both code and SQL. Audit records are append-only local records,
not signed attestations. Failure diagnostics never replace input-bound request identity.

## Artifacts, quotas and retention

Private CAS uses SHA-256 names, exclusive private staging, flushed writes, verified bytes
and non-replacing publication. Existing entries must verify before reuse. Check regular files,
link counts and ancestor identities; document residual races in this trusted local filesystem.
Filesystem writes are outside DB transactions. Failed submissions and stale workers can leave
orphans; reconcile explicitly. Never refresh corrupt evidence from original source paths.

Enforce modest finite store/staging and DB quotas. Reserve input/output bytes and compute
before queueing; retain actual artifact charges and measured compute, release only unused
reservation, and settle once. Default paid capabilities are zero. Limit runs, active workers,
attempts, duration and retention. Retention defaults to dry-run; referenced evidence is protected,
deletion records tombstones and audit history. No promise of eternal retention or power-loss safety.

## Validation and later adapters

Real local PostgreSQL and ephemeral Ubuntu CI PostgreSQL must execute D01-D30 where relevant.
Use overlapping transactions and actual killed worker processes, not in-memory substitutes.
Preserve all 404 prior tests and the MercuryPay digest. Record failed attempts and platform limits.
The final report must include measured local storage/memory/latency, not a fabricated benchmark.

Later hosted storage and workflow transports must preserve request identities, fencing,
reference verification, permission checks and atomic effect intent. Object-store conditional
writes and retention will need separate tests. Public SaaS authorization, remote execution,
models, runtime replay and repair remain outside this decision.

## Sources consulted

- [PostgreSQL queue locking](https://www.postgresql.org/docs/17/sql-select.html)
- [pg transactions](https://node-postgres.com/features/transactions)
- [Inngest local development](https://www.inngest.com/docs/local-development)
- [Inngest idempotency](https://www.inngest.com/docs/durable-execution/guides-and-advanced/idempotency)
- [EDB binary archive page](https://www.enterprisedb.com/download-postgresql-binaries)
- [EDB revision-5 publisher checksum](https://github.com/EnterpriseDB/edb-installers/issues/731#issuecomment-6014410619)

The downloaded `postgresql-17.11-5-windows-x64-binaries.zip` is 381,531,864 bytes;
its SHA-256 matched publisher value
`80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f` before execution.
This is publisher-published checksum verification, not a signed checksum manifest.
The account's authority is inferred from its ability to close other authors' issues in
EDB's repository. The final environment report records actual runtime behavior separately.
