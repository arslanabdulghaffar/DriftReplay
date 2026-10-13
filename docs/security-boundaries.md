# Security boundaries through Phase 3

Execution is limited to project-authored code, reviewed pinned dependencies and the separately
authorized verified PostgreSQL runtime. Phase 2 ingests explicit local files as data. Phase 3
stores those captured bytes and coordinates the same static analyzer through a local database.
There is no URL ingestion API, arbitrary repository execution, payment invocation, general
user authentication, GitHub App integration, cloud service or model connection. The owner may
publish reviewed source to the authorized phase branch; the product cannot write GitHub PRs.
These are scope statements, not production security guarantees.

## Local data and execution

- Fixture loaders read a fixed set of local artifact names, not manifest-supplied arbitrary paths.
- Unknown input is validated at schema boundaries. Artifact paths reject traversal and unsafe Windows forms.
- JSON/source excerpts render as text through React. They are not HTML or instructions.
- The demo adapter constructs data only. The `.invalid` hostname is documentation, never contacted.
- Dependency install scripts are disabled. `allowBuilds` is empty, strict policy remains enabled,
  and automatic dependency installation before commands is disabled. No global build approval exists.
- Next telemetry is disabled only in its child process. No system environment or PATH was changed.
- Local dev/preview bind to loopback. Static preview serves only the authored build output.
- Provider/model keys are not required. PostgreSQL credentials use ignored local files or safe
  process environment; `.env.example` contains comments only.

## Local persistence and authority

PostgreSQL is reachable through the literal IPv4 loopback address `127.0.0.1`. Connection
configuration rejects arbitrary hosts, connection URLs, socket paths and extra driver options.
The authorized Windows runtime and disposable database live under ignored `.local`; no Windows
service, global PATH change, Docker/WSL or cloud installation is part of Phase 3.

Separate bootstrap, migration-owner and runtime roles limit ordinary operation. The runtime
does not migrate, create schemas or grant permissions. Append-only audit, input and artifact
records have database mutation guards. Direct database credentials still confer trusted local
access: this is not a hostile-tenant boundary or tamper-proof audit service.

The coordinator creates one local workspace and scopes run identities and queries to it.
The CLI accepts no caller-authored workspace authority. It has no login, tenant grant model,
revocation protocol or remote repository access. Real private GitHub data and SaaS authorization
remain later gates. Keep one database and its corresponding artifact root together.

## Durable evidence, races and limits

Input path, role, raw-byte digest, length, workspace and engine/policy bind the immutable run
manifest. Request, run, attempt, lease generation, result and diagnostic identities remain
distinct. Workers read CAS snapshots, never the original selected paths after submission.
Before successful completion, the existing Phase 2 result is independently recomputed from
those captured bytes. Hashes establish byte identity, not provider authenticity or signatures.

Submission, reservation and outbox intent share a transaction. Queue consumers use durable
inbox identities, database-clock leases, increasing generations and conditional finalization.
Cancellation and completion serialize on the same authoritative rows. At-least-once execution
can repeat analysis; it must not duplicate authoritative completion or settlement. State
validation and SQL guards reject terminal-to-active transitions.

The filesystem is not part of a PostgreSQL transaction. CAS publication uses exclusive staging,
file flushing, non-replacing publication and verification. Symlinks/junctions, unexpected hard
links, unsafe names and changing identities are rejected within the trusted local boundary.
Submission/finalization and retention use a separate database advisory-lock connection pool;
CAS access also uses a short filesystem lock. Referenced blobs are protected; deletion has
explicit intent and tombstone records, and maintenance defaults to dry-run.

Finite ceilings include two active workers, three attempts per run, a 120-second run deadline,
120,000 ms reserved elapsed-work allowance per run, an 8 MiB combined output reservation,
and a 4 MiB per-CAS-blob limit. The store permits at most 128 MiB and 4,096 files including
staging. Workspace admission caps are 1,000 runs, 128 MiB of logical reservations/charges and
1,200,000 ms of work reservations/charges. Measured elapsed time and interrupted-attempt
estimates are recorded separately; these are not CPU-time or total RSS measurements. There
is no automatic quota reset or completed-history purge. Paid model, remote-execution and
external-write capabilities remain absent.

An interrupted CAS owner can leave a lock requiring quiesced operator inspection; the tool
does not delete a possibly live lock based on age. Windows file flushing does not provide
directory `fsync`, and Node file creation modes are not Windows ACL isolation. Process-kill
tests do not establish power-loss durability. See [storage/retention](durable-storage-and-retention.md),
[operations](durable-operations.md) and the [threat/failure matrix](durable-threat-failure-matrix.md).

## CI definition

The YAML grants only `contents: read`. It contains no repository-secret references, deployment,
publication, write permission or privileged `pull_request_target` trigger. Checkout credentials
are not persisted; submodules and package-manager caching are disabled. Actions use reviewed
immutable commits. Phase 3 adds a pinned ephemeral PostgreSQL service with synthetic CI-only
credentials, loopback host-port binding, separate roles and isolated test schemas. It is test
infrastructure, not a deployed application database. Phase 1 Actions succeeded on the reviewed
main commit; Phase 2 results remain in its report. Phase 3 hosted outcomes must be inspected
and recorded in its own report, never inferred from this configuration.

Future CI runs execute repository code in the CI environment, so this configuration does not
authorize a hosted arbitrary-repository runner. Do not add privileged credentials to untrusted
PR runs or execute fork code through privileged event types.

## Threat assumptions and deferred controls

Prompt injection has no model tool boundary to cross. Descriptions and consumer source
are untrusted data; report text is escaped. No network ingestion or reference resolver exists.
SSRF defenses for a future network provider, tenant authorization, webhook forgery, token
handling and remote sandbox isolation still need implementation and negative tests when those
boundaries are introduced. Local byte/count/depth/output/deadline limits are implemented now.
A passing schema alone does not establish evidence: Phase 2 verified predicates recompute it.

Local input paths reject traversal, UNC/drive escapes, hidden/generated directories and
symlink/junction traversal. Opened-file metadata and ancestor identities are checked around
bounded reads. This is trusted single-user local containment, not hostile multi-tenant isolation:
same-device bind mounts, filesystem races and runtime/library defects remain residual risks.
The worker's heap/deadline controls bound trusted parser work; it never runs inspected modules.
See [operational limits](phase-2-operational-limits.md) for exact ceilings and platform caveats.

The EDB archive was checked before execution against a publisher-published SHA-256. This is
not a signed checksum manifest or a claim that every extracted executable has an Authenticode
signature. The available Windows server executables are unsigned. Preserve OS application
control; an execution block is not permission to disable it. Exact provenance is recorded in
[dependencies](dependencies.md) and [ADR 0003](adr/0003-durable-coordination.md).

Dependency advisories and package license metadata are recorded. They cannot establish absence
of vulnerabilities or settle legal license compatibility. No external service received project
source for AI processing. Public documentation and npm registry metadata/packages were contacted
for authorized tooling review and installation; the approved EDB source supplied the local
PostgreSQL archive. This document does not assert that final Phase 3 validation or CI is complete.
