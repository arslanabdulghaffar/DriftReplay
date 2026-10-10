# Phase 2 evidence and claim policy

Schema version **2** and engine `driftreplay-openapi-subset@0.2.0` identify this local
analysis format. The Phase 1 schemas and `assessFoundationClaim` remain unchanged.

## Pipeline and public APIs

`captureLocalInputs(root, selections)` confines filesystem reads to explicit local paths.
`analyzeSnapshots(capturedBytes, options?, signal?)` is the pure downstream investigation;
it copies bytes, validates paths/roles/limits, derives hashes and parses data. It opens no
source path. `analyzeLocalExperiment(root, selections, options?, signal?)` combines them.
These APIs are trusted-host library APIs, not public web endpoints. Selected bytes remain
untrusted content; providing an object cannot grant provider authenticity or new permissions.

`compareContracts` and `traceSource` expose reusable pure lower-level tools. Their returned
objects are not independently authenticated evidence. `assessAnalysisClaim` and
`verifyAnalysisResult` recompute the complete result from the captured input and compare its
canonical content. Matching a supplied digest or passing a Zod schema alone is insufficient.

The versioned result contains snapshots, structural deltas, lexical usages, curated
correspondences, evidence nodes, impact links, unresolved cases and per-breaking-delta scope
assessments. Every edge names stable subject/evidence IDs. Source evidence binds the file's
raw-byte digest, exact UTF-16 slice, line/column and enclosing symbol when known. Contract
evidence binds old/new byte digests and existing JSON pointers. Engine/policy metadata is
included in the logical result digest. Omitted timestamps and Git identities are not invented.

## Admission predicates

| Claim              | Required recomputed evidence                                                                                    | Does not establish                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `STRUCTURAL_BREAK` | Supported directional compatibility rule and pinned contract pointers                                           | Provider retirement or outage                                           |
| `MATCHED_USAGE`    | Supported AST pattern with exact method/path correspondence to a compared operation delta and exact source span | Runtime dispatch or business reachability                               |
| `POTENTIAL_IMPACT` | Supported breaking delta and supported usage joined by `impact.exact-method-path.v1`                            | Observed failure, affected input values or verified migration           |
| `UNVERIFIED`       | Unresolved source pattern prevents a scoped absence conclusion                                                  | A weak finding promoted by confidence prose                             |
| `NOT_APPLICABLE`   | No relevant supported usage in explicitly listed source files and no recognized unresolved request patterns     | Safety of the entire repository or absence of unrecognized SDK wrappers |

Impact links use `confidence=direct` for exact method/path linking, not a numerical accuracy
score. The provider association is conditional: the operator selected the two contracts for
this consumer. Host, imports, runtime global state and business-flow reachability are not
resolved. Multiple links remain separate; there is no arbitrary single confidence aggregate.

The synthetic mapping receives `provenance=curated` only if its exact bytes and both contract
bytes equal the reviewed pins. Pointer targets and contract IDs must exist and agree. This
checked-in policy is an approval source; the mapping's own provenance string is not authority.
Altered/stale mappings stop the analysis. Omitting the mapping still yields removed/added
operations and a direct old-route impact, with no invented rename. Operation and property
correspondences remain separate graph facts; only a matching operation correspondence is
attached to the removed-operation impact edge.

## Reproducibility and stopped results

SHA-256 identifies raw bytes. Canonical JSON recursively sorts object keys using JavaScript
code-unit ordering, preserves ordered arrays and uses JSON primitive serialization. Results
sort source paths, deltas, usages, graph nodes and edges deterministically. A logical digest
hashes the canonical result without its own `runDigest` field. Byte changes alter snapshot
identity even when whitespace or annotation changes do not alter structural semantics.
Identical captured bytes and policy yield identical successful results on tested platforms.

CLI elapsed time and result size are separately labeled processing metadata, excluded from
the logical digest. Timing-limit failures can naturally depend on machine load; successful
analysis is deterministic. Resource options can only reduce the fixed maximum limits; they
control admission, not compatibility semantics or permission grants.

Malformed input, unsupported contracts, stale curated data, cancellation or resource limits
yield `STOPPED` with no confident partial deltas/usages/links. Unexpected worker/engine failures
yield `INDETERMINATE`. Unsupported lexical patterns yield bounded explicit unresolved records
alongside supported observations. No state or predicate admits `REPRODUCED_FAILURE`,
`PATCH_VERIFIED`, replay PASS/FAIL, a patch digest or deployment approval.

Stopped results are failure diagnostics, not completed investigation identities: they discard
captured inputs and partial findings. Equal failure codes/pointers may therefore have equal
diagnostic digests for different inputs. Contract failures retain a bounded JSON pointer when
available. Do not use a stopped digest as a cache key for successful analysis or evidence.

Reports always state `replayExecuted=false`, `repairExecuted=false`, `modelInvocations=0`.
Hashes are neither signatures nor proof of provider authenticity. No security, adoption or
accuracy benchmark is inferred from synthetic test success.
