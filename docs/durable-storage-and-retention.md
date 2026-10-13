# Local durable storage and retention

The private artifact store and PostgreSQL together preserve a local investigation. They
do not form one atomic distributed transaction. Phase 3 makes the intervening crash windows
explicit and reconciles them; it does not claim power-loss durability or hostile-host
isolation. The operator owns both the database and filesystem.

## Layout and identity

The default store is ignored `.local/durable/artifacts/`. Published blobs have the flat
path `sha256/<64-character-lowercase-digest>`; `.staging/<uuid>.tmp` holds exclusive temporary
files, and `.lock` coordinates local readers/writers across processes. PostgreSQL stores
digest/length references and retention state, not source text in queue or audit fields.
Machine JSON and escaped human Markdown are separate result artifacts.

SHA-256 is recomputed over exact bytes. Paths, roles, byte lengths and hashes form the
canonical input manifest, bound to the server-created workspace and engine/policy identity.
The manifest is ordered by normalized relative path. No caller-authored digest, trust label
or source comment substitutes for hashing and policy validation.

The worker reads only recorded CAS blobs after submission. Editing an original input file
does not change the queued investigation. A new deliberate submission can capture different
bytes and receive a different request identity. Do not "repair" damaged evidence by copying
the current source into an existing digest path.

## Publication and read checks

`ArtifactStore` enforces a 4 MiB per-blob ceiling, 128 MiB total store ceiling and 4,096-entry
ceiling by default. Both published and staging files count toward physical limits. Lower
store limits are permitted; larger limits are rejected. The analyzer independently limits
contracts, source count/size, total input and output. The database's combined result/report
reservation is separate from each blob's maximum size.

Publication obtains an exclusive store lock, copies bounded bytes, creates a private
temporary file without replacement, writes and flushes it, then verifies its size and hash.
A hard link publishes the final name without replacing an existing destination. The
temporary link is then removed and the published file is reverified. Readers take the same
lock so they do not accept the deliberate temporary two-link publication interval as a
stable file. If a digest already exists, its bytes must verify before reuse; corrupt existing
bytes are never overwritten.

Reads verify regular-file type, single-link count, size, expected digest and before/after
file identity/metadata. Ancestor identity checks reject changed directories, symlinks and
junctions. Roots reject network namespaces. Reads are bounded to the checked size plus one
byte so growth cannot trigger an unbounded read. Public errors use stable codes rather than
private absolute paths or raw operating-system messages.

These checks narrow local race windows. They do not make a sequence of filesystem calls an
atomic containment primitive against a hostile administrator or same-device mount changes.
The store is for the trusted single local operator. Node's `0o600`/`0o700` creation modes are
not a Windows ACL isolation guarantee. Keep the workspace and ignored credentials private.

## Crash windows and reconciliation

| Crash point                                                               | Durable meaning and next action                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Before a complete input blob is published                                 | No run should reference it; staging bytes may remain                                                                                             |
| After input publication, before submission commit                         | Unreferenced complete blobs can remain; reconciliation identifies them                                                                           |
| After submission commit, before enqueue acknowledgement                   | The committed outbox intent remains available for delivery                                                                                       |
| During analysis                                                           | Input manifest stays fixed; lease recovery controls retry and ownership                                                                          |
| After result publication, before fenced completion commit                 | Result blob may be orphaned; the run is not complete merely because it exists                                                                    |
| During dispatch, after inbox/readiness effects but before acknowledgement | One SQL transaction rolls back or commits inbox receipt, step readiness and delivery acknowledgement together; analysis completion happens later |
| During deletion                                                           | A deletion intent/tombstone must preserve an auditable recovery path                                                                             |

The CAS lock deliberately fails closed after an interrupted owner leaves `.lock` behind.
It waits up to five seconds and returns `CAS_BUSY`; it does not guess lock ownership from
age and delete another process's lock automatically. Recovery is an explicit local operator
procedure: stop all DriftReplay workers/commands, establish that no live owner remains,
inspect the lock and staging/published entries, and resolve the interrupted operation before
resuming. A stale lock, unexpected hard link, unsafe filename or corrupt artifact requires
review; automatic deletion would risk hiding evidence or racing an active writer.

The store flushes files before publication. Directory `fsync` is attempted on supported
non-Windows platforms; the Node directory-open API does not support that operation on
Windows, so that step is explicitly unavailable there. Process-kill recovery tests do not
establish survival of sudden power loss, filesystem corruption or a failed physical disk.

## Retention policy

Retention is an explicit maintenance action. Listing, reconciliation and garbage-collection
commands default to dry-run. An apply flag is deliberate permission for the documented
maintenance operation, not permission to delete arbitrary workspace files. CAS paths are
derived from validated digests, never from caller-provided deletion paths.

Live input/result/report/diagnostic references protect their blobs. Completed runs remain
referenced: age alone does not authorize evidence deletion. PostgreSQL records blob states
`READY`, `DELETE_PENDING`, and `DELETED`; deletion records carry timestamps and append-only
storage audit. Newly registered orphan blobs use the reviewed retention delay, initially
seven days. Applying maintenance resumes an existing `DELETE_PENDING` intent after checking
that no reference appeared. It removes remaining bytes, if present, and finalizes the
audited tombstone. A crash after unlink and before the database update therefore remains
recoverable without pretending that a missing referenced artifact is acceptable.

The service serializes retention with submission/finalization through an advisory lock so a reference cannot
appear between the unreferenced check and deletion. There is no implemented automatic purge
of completed run history or quota reset. Long-running use can therefore hit the finite run,
compute, byte or entry limits and require an explicit reviewed archival policy. Do not
increase quotas or drop tables as an undocumented workaround.

Database storage charges and physical CAS size answer different questions. A digest may be
shared by several logical runs while each run reserves conservative capacity. Files left by
aborted submission or staging count toward CAS capacity even without a database reservation.
Compare both when diagnosing limits; do not infer exact disk usage from a logical budget.

## Migration beyond the local store

A future object-store adapter needs conditional non-overwriting writes, digest/length
verification, private access control, bounded reads, retention/reference fencing and its own
crash tests. A hosted PostgreSQL/workflow adapter must preserve request, attempt and effect
identity. Copying blobs to cloud storage would be a new authorized phase, not a consequence
of publishing the source code.

D03–D05, D14, D24 and D28 specify the storage acceptance proofs in the
[threat/failure matrix](durable-threat-failure-matrix.md). Actual outcomes and platform
limitations are recorded in `PHASE_3_REPORT.md`.
