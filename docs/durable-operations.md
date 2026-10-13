# Operating the local durable investigation CLI

Phase 3 runs one trusted local operator's static investigations through PostgreSQL and a
private local artifact store. It does not execute consumer packages, fetch remote APIs,
run payment requests, call models, replay business fixtures or generate repairs. The web
dashboard remains a static export. Publishing this phase branch does not deploy a service.

This guide describes the command contract. The phase report records commands actually run,
test results, measured resource samples and GitHub status; examples below are not evidence
of an executed command.

## Prerequisites and private configuration

Use the pinned Node 24.21.0, Corepack 0.36.0 and pnpm 11.25.0 toolchain with the committed
lockfile. Run `corepack pnpm`; do not substitute a different bare pnpm runtime. Dependency
lifecycle scripts remain disabled.

The authorized Windows test runtime is PostgreSQL 17.11, extracted under
`.local/postgres-17.11-5/pgsql/`. Its disposable cluster is `.local/postgres-test/data`,
bound to the literal address `127.0.0.1` on port `54329`. No Windows service, global PATH
change, Docker, WSL, cloud resource or public database listener is needed. The binary
archive was checked against the EDB publisher's SHA-256 before execution; provenance and
the limits of that verification are documented in ADR 0003 and the phase report.

The database runtime account is distinct from the migration owner. Runtime credentials
do not authorize migrations, schema creation, grants or mutation of append-only audit/input
rows. Bootstrap privileges are only for the dedicated disposable local cluster. Do not run
the application as the bootstrap superuser or grant privileges to unrelated databases.

Local connection files are ignored:

- `.local/durable/connection.json` for runtime access.
- `.local/durable/migration-connection.json` for migrations.

Each is a bounded JSON object with `host`, `port`, `database`, `user`, and `password` fields.
The host must be exactly `127.0.0.1`; database/user names are restricted identifiers, ports
must be between 1024 and 65535, and configured passwords must have 16–256 characters. No
connection URL or arbitrary host/socket flag is accepted. Symlinked, multiply linked,
oversized or changing credential files are rejected. Never paste real credentials into
documentation, tickets, shell history, CLI arguments or committed environment files.

Safe process environment is an alternative: `DRIFT_DB_HOST`, `DRIFT_DB_PORT`,
`DRIFT_DB_DATABASE`, `DRIFT_DB_USER`, `DRIFT_DB_PASSWORD`. Migrations share the host/port/database
and use `DRIFT_MIGRATION_USER` and `DRIFT_MIGRATION_PASSWORD`. Treat those environment values
as private credentials. `.env.example` contains comments/placeholders only; real `.env`
files, downloaded binaries, database data, logs and `.local` artifacts stay outside Git.

## Command sequence

From the repository root:

```powershell
corepack pnpm durable:doctor
corepack pnpm durable:migrate
corepack pnpm durable:submit -- --fixture
corepack pnpm durable:worker -- --until-idle
corepack pnpm durable:list
corepack pnpm durable:status -- --run-id <UUID>
corepack pnpm durable:events -- --run-id <UUID>
corepack pnpm durable:verify -- --run-id <UUID>
```

`doctor` distinguishes private-configuration, connection and migration failures using
redacted stable error codes. `migrate` uses the separate migration configuration, an
advisory migration lock, ordered SQL migrations, per-migration transactions and stored
checksums. Re-running an applied migration is harmless only if its SQL checksum still
matches. A changed applied migration is an explicit error; do not rewrite its checksum.

Fixture submission captures the unchanged MercuryPay contracts, reviewed mapping and demo
adapter. It returns a stable run ID and input-set digest. Identical resubmission reuses the
logical run and does not create another reservation or canonical outbox intent. A manual
idempotency token cannot be reused for different input bytes.

The worker consumes committed intent, claims a lease, reads the frozen CAS bytes, invokes
the fixed project-authored analyzer thread and verifies its result before committing it.
`--until-idle` drains currently ready work and exits if none is available; it does not wait
for a future backoff deadline or install a background service. Invoke it again after a
scheduled retry becomes ready. A successful fixture run has two deltas, one usage, one
conditional impact and one unresolved
helper. That is static evidence; the durable run state is `ANALYSIS_COMPLETE`.

Status and event commands show persisted metadata and audited transitions. Default logs
must not print source excerpts, absolute private paths, passwords or connection URLs.
`verify` accepts `ANALYSIS_COMPLETE` runs, reads stored evidence and independently recomputes
it from the CAS inputs. It
fails explicitly for missing, modified or mismatched artifacts. It never refreshes evidence
from a changed consumer checkout.

The explicit-input submission contract uses an operator-approved root, one `--base`, one
`--candidate`, and one or more `--source` relative paths; optional `--mapping` is limited to
the reviewed synthetic mapping policy. No recursive repository discovery, remote URL,
consumer shell command, worker-entry override or workspace-authority flag is part of the
CLI. Consult CLI usage for the implemented options rather than assuming arbitrary flags.

## Cancellation and recovery

```powershell
corepack pnpm durable:cancel -- --run-id <UUID>
corepack pnpm durable:reconcile -- --dry-run
corepack pnpm durable:gc -- --dry-run
```

Cancellation is persisted. Queued work can become `CANCELLED` without analysis; executing
work passes through `CANCEL_REQUESTED` and cannot subsequently commit success if cancellation
has taken precedence. Completion already committed before the request stays terminal. The
trusted analysis thread supports abort and a maximum 30-second deadline; selected consumer
code is never started.

Reconciliation dry-run currently inventories storage without advancing expired leases;
its `recovered` field is null. Applying reconciliation also recovers expired work.
Garbage collection inventories referenced, orphan and pending blobs by default; no deletion
occurs in dry-run. Mutation requires the command's explicit `--apply` mode. Inspect dry-run
output first. Referenced evidence is protected regardless of age, and deletion is recorded
with intent/tombstone audit. See
[storage and retention](durable-storage-and-retention.md) before applying maintenance.

After a worker crash, use the same local database and artifact root. Recovery uses persisted
expiry, attempt counts, deadlines, cancellation and fencing generations; restarting must not
resubmit from newly read source bytes. Attempts are bounded, and deterministic bad inputs
do not become endless transient retries. Database errors can leave a reservation outstanding
until a later successful recovery transaction; that is recoverable state, not proof of a refund.

`CAS_BUSY` after an interrupted store operation needs operator review. Stop all local
commands, establish that the lock owner is gone, and inspect the CAS lock/staging/published
entries. The tool does not automatically remove a possibly live lock. Do not delete the
whole database/store or replace corrupt blobs to obtain a passing run.

## Validation and platform limits

```powershell
corepack pnpm check
corepack pnpm test:analysis
corepack pnpm analyze:fixture
corepack pnpm test:durable
```

The durable gate requires real PostgreSQL. An absent local database is a failed environment
gate, not a reason to claim success from mocks or CI alone. Integration tests use isolated
schemas and dedicated test artifacts. Real process termination, overlapping transactions,
lease expiry and cancellation races supplement unit tests. The report must retain failures
encountered and corrected rather than reporting only a favorable final count.

Ubuntu CI uses its own ephemeral PostgreSQL service with synthetic test credentials. CI
success is separate evidence from Windows success. The Windows implementation uses IPv4
loopback TCP; Unix-domain socket behavior is not supported by this connection policy.
Windows directory `fsync`, symlink permission and filesystem behavior must be reported
accurately rather than inferred from Linux results. Process interruption tests are not
power-loss or hostile-host isolation guarantees.

The trusted thread has a 256 MiB V8 old-generation heap ceiling and 4 MiB stack. These are
not total-process RSS ceilings. The default coordinator admits at most two active workers;
store and reservation limits remain finite. Latency, process memory and database/CAS sizes
reported from one synthetic run are operational observations, not a throughput benchmark
or a hosting cost estimate.

Stop when a required privilege, system runtime or new service is unavailable. Further
system installation, remote exposure, cloud provisioning, deployment, merging and Phase 4
require their own authorization. Do not broaden database privileges or network exposure
as a workaround.

## Approved native Windows runtime helper

For this authorized EDB 17.11 revision-5 workspace setup,
`scripts/local-postgres.ps1 status|start|stop` verifies the archive SHA-256 and the
extracted runtime files against it before invoking `pg_ctl`. This can take several minutes
for the complete archive. It rejects reparse points, unexpected runtime files and changed bytes.
Start explicitly overrides `listen_addresses=127.0.0.1` and port `54329`; the helper checks
the running server PID has exactly that loopback listener. It stops a newly started server
if the listener check fails. It does not install, download, alter PATH, register services or
remove data. This assumes the same trusted local operator; verification cannot eliminate
all concurrent filesystem races.

`durable:doctor` verifies the checked-in migration versions and SQL checksums read-only.
Missing/older migrations, checksum mismatch and unknown future versions have distinct error
codes and do not report readiness. This verifies the ledger, not an independent reconstruction
of every live DDL object against a hostile database owner.

Doctor reports `loopbackOnlyConnection` for the enforced client destination and
`serverAddressIsLoopback` separately. A mapped CI container can report the latter as false
while the runner connects exclusively to 127.0.0.1. Role and connection-policy checks are
unconditional. This diagnostic is not a scan of every server listener; the native Windows
helper independently checks the approved server PID's listeners.
