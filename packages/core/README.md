# Core foundation contracts

`@driftreplay/core` exposes browser-safe Zod schemas and inferred TypeScript types.
Every input boundary is strict and versioned with `schemaVersion: "1"`.

- `SnapshotIdentitySchema` describes curated synthetic fixture artifacts only.
- `EvidenceRefSchema` distinguishes declared static observations, inferences, and
  curated inputs. Parsed references and their locations are frozen. Digest fields
  identify bytes; neither a digest nor successful parsing authenticates a producer
  or establishes the truth of a claim.
- `FixtureManifestSchema` describes the MercuryPay synthetic fixture and its
  immutable inputs. It checks metadata consistency, not file existence or bytes.
  The fixture validation suite must recompute all referenced hashes separately.
- `FindingStatusSchema` names seven future finding states. Naming a state does not
  implement its predicate.
- `RunIdentitySchema` uses an explicitly labeled pre-Git tree digest.
  `RunStateSchema` permits not-started, analysis-only, stopped, and indeterminate
  states. It does not model a completed reproduction or repair.
- `assessFoundationClaim(unknown)` is a restrictive Phase 1 guard. Only an explicit
  `UNVERIFIED` report is admissible. All operational findings are denied until
  later deterministic predicates exist. Runtime proof is always denied in this
  phase; a model-authored status never establishes an operational claim.

`@driftreplay/core/digests` is a separate **Node-only** entry point:

- `sha256Bytes(Uint8Array)` hashes the exact bytes without parsing or normalizing.
- `treeDigest([{ path, sha256 }])` sorts paths by JavaScript code-unit ordering,
  serializes each as `path:sha256` followed by one LF, and hashes the resulting UTF-8
  bytes. Paths and lowercase digest encodings are validated; duplicate paths are
  rejected. The manifest must not reference itself.

The manifest's digest policy displays `\n` as two descriptive characters; the
serialized tree uses an actual LF byte. Immutable fixture contents are not silently
rewritten for platform newline conventions. These helpers do not fetch sources,
execute code, contact providers, or perform the planned Phase 4 replay.
