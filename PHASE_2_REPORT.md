# DriftReplay Phase 2 implementation report

Review date: **2026-10-11**. MercuryPay is fictional. Static analysis is not replay evidence.

## A. STATUS

**Implementation complete; publication and hosted CI verification pending.** Local gates pass.
**NO-GO for Phase 3 review until the publication receipt below confirms remote equality and CI.**
Nothing in this report authorizes Phase 3 implementation, merging, deployment or release.

## B. SCOPE/AUTHORITY

The owner explicitly authorized the complete Phase 2 prompt and normal branch publication.
Read-only preflight confirmed a clean reviewed Phase 1 baseline at
`0659e16936f4af63f7b5bd2220fecbafe8c1a17b`, matching local and remote `main`.
Phase 1 Actions run `38025699872` succeeded on that exact commit. The previously absent
`phase/02-deterministic-analysis` branch was created from it; all Phase 2 changes stay there.
Origin remains `https://github.com/arslanabdulghaffar/DriftReplay.git`.

Implemented only explicit local ingestion, deterministic comparison, lexical TypeScript
inspection, evidence composition, report/CLI output, tests and documentation. No Phase 3
service, database, durable job, GitHub App, real customer repository, model call, replay,
patch/repair workflow, PR, merge, deployment, release or cloud provisioning was performed.
Normal dependency/advisory/documentation access and authorized Git publication are separate
from the product, whose analysis path has no network provider. No permissions were broadened.

## C. ARCHITECTURE & ADR

[ADR 0002](docs/adr/0002-deterministic-analysis.md) preceded substantial implementation.
Selected **`driftreplay-openapi-subset@0.2.0`**, a reusable project-owned strict comparator,
plus pinned **TypeScript 5.9.3** and **Zod 4.6.5**. One private `packages/analysis` package
keeps cohesive modules without four packaging wrappers. No new external package version or
binary was introduced; the lockfile adds only this workspace's importer.

The preferred oasdiff alternative was evaluated from its official repository/option docs.
No local executable was present, and no pinned Windows/Linux binary/checksum behavior was
validated. Therefore the explicitly permitted strict-subset option B was chosen. There is
no claimed oasdiff execution, checksum or binary exit-code validation. The selected engine is
pinned by its source commit and engine identity; it is neither general OpenAPI support nor
a new research algorithm.

Actual initial Node spikes identified the adapter's returned object on line 17 with zero
TypeScript parse diagnostics, then found the two MercuryPay method/path set differences.
Spikes established feasibility only; the full comparator/AST/evidence tests establish the
implemented subset. Windows runtime validation is recorded below; Ubuntu Actions is a
separate publication gate.

Filesystem access is confined to local ingestion and fixed report output. Downstream APIs
consume copied captured bytes/text. A fixed project-authored worker supervises the trusted
parser with a 30-second deadline and 256 MiB V8 old-generation heap limit. It never imports
or executes inspected source. JSON parsing, OpenAPI comparison, AST tracing, graph composition,
runtime schemas and claim recomputation have distinct modules.

## D. FILE INVENTORY

The following inventory includes every new/changed file relative to the reviewed baseline.
There are no unrelated edits. The original core policy, seven fixture artifacts, manifest,
business oracle, adapter and Phase 1 report remain unchanged.

<!-- PHASE2_FILES_START -->

- `.github/workflows/ci.yml`
- `AGENTS.md`
- `PHASE_2_REPORT.md`
- `README.md`
- `apps/web/app/status/page.tsx`
- `docs/adr/0002-deterministic-analysis.md`
- `docs/analysis-evidence-policy.md`
- `docs/dependencies.md`
- `docs/openapi-support-matrix.md`
- `docs/phase-2-operational-limits.md`
- `docs/phase-gates.md`
- `docs/security-boundaries.md`
- `docs/supported-scope.md`
- `docs/typescript-analysis-patterns.md`
- `docs/validation/phase-2-verification.json`
- `eslint.config.mjs`
- `package.json`
- `packages/analysis/package.json`
- `packages/analysis/src/analysis.ts`
- `packages/analysis/src/cli.ts`
- `packages/analysis/src/correspondence.ts`
- `packages/analysis/src/errors.ts`
- `packages/analysis/src/fixture.ts`
- `packages/analysis/src/identity.ts`
- `packages/analysis/src/ingestion.test.ts`
- `packages/analysis/src/ingestion.ts`
- `packages/analysis/src/json.test.ts`
- `packages/analysis/src/json.ts`
- `packages/analysis/src/model.ts`
- `packages/analysis/src/openapi.test.ts`
- `packages/analysis/src/openapi.ts`
- `packages/analysis/src/output.ts`
- `packages/analysis/src/policy.ts`
- `packages/analysis/src/report.ts`
- `packages/analysis/src/supervisor.test.ts`
- `packages/analysis/src/supervisor.ts`
- `packages/analysis/src/trace.test.ts`
- `packages/analysis/src/trace.ts`
- `packages/analysis/src/worker.ts`
- `packages/analysis/tsconfig.json`
- `pnpm-lock.yaml`
- `tests/golden/README.md`
- `tests/golden/analysis.test.ts`
- `tests/golden/directionality.json`
- `tests/golden/directionality.test.ts`
- `tests/golden/mercurypay.analysis.json`
- `tests/integration/analysis.test.ts`
- `tests/security/analysis-boundaries.test.ts`
- `tests/security/resource-boundaries.test.ts`
- `tsconfig.base.json`

<!-- PHASE2_FILES_END -->

Source modules implement the pipeline above; paired tests cover their boundaries. Golden files
are reviewed regression expectations generated from actual static runs. Docs define the support
matrix, evidence policy, operational ceilings and actual validation. Root/CI changes add the
local commands and gates, native TypeScript import support, and ignored local-output lint scope.
README and phase/security docs correct stale publication/scope claims. The only UI change is
one status-table entry explaining CLI availability while the dashboard remains static.

## E. SUPPORT MATRIX

See [complete OpenAPI rules](docs/openapi-support-matrix.md) and
[AST patterns](docs/typescript-analysis-patterns.md).

- OpenAPI 3.0.3 JSON only; literal routes, supported HTTP methods, JSON request/response
  bodies, inline object/string/integer schemas, required properties, enum/range/length
  constraints and boolean additional properties. Directional rules distinguish accepted
  request domains from promised response domains.
- Operation removal/addition stays two independent events. Optional closed-object request
  additions are nonbreaking; new required properties break old callers. Narrower request
  domains and wider response domains are breaking when the modeled semantics prove it.
- Email format remains opaque: format changes and unproven format-sensitive breaks are
  unknown. Optional body addition/removal and schema-body presence changes have explicit
  unknown policies. Examples/descriptions do not become compatibility or migration evidence.
- Unknown constructs, unsupported dialects, all references, composition, arrays, boolean/
  number/null schemas, parameters, security, callbacks, components, external retrieval and
  YAML stop comparison. Both entire inputs are checked before any findings return.
- AST support: directly returned literal method/path/body request objects and direct literal
  ambient `fetch` calls. Omitted fetch method is GET; forbidden TRACE is not admitted as a
  supported fetch call. No control-flow, runtime dispatch or interprocedural dataflow claim.
- Dynamic syntax, aliases, shadowed fetch, computed/spread/duplicate options and every other
  call/constructor become explicit unknowns. Ordinary helper calls therefore also produce
  conservative unknowns; this prevents unnamed SDK wrappers becoming false scoped absence.

## F. ACTUAL DEMONSTRATION

Command: `corepack pnpm analyze:fixture`. Actual normalized result:

```json
{
  "state": "ANALYSIS_ONLY",
  "runDigest": "1926cf8adad96f725e1ff13196e25913e9adaf77bae9c9d5747381ba1d4c127c",
  "deltas": 2,
  "usages": 1,
  "links": 1,
  "replayExecuted": false,
  "repairExecuted": false,
  "modelInvocations": 0
}
```

`POST /v1/charges` is structurally removed (breaking); `POST /v2/payments` is added
(nonbreaking). The comparator does not infer a rename or actual endpoint retirement.
The reviewed mapping separately contributes two curated correspondences, with matching
contract/mapping byte pins and existing JSON pointers.

The usage is `buildV1CheckoutRequest` in `apps/demo-shop/src/v1-adapter.ts`, line **19**,
columns **11–24** (exclusive end), exact literal `"/v1/charges"`, UTF-16 offsets **[582,595)**.
The surrounding object includes literal POST and the original `customer_email` body property.
The file SHA-256 is `4409d6c30a5c36e5b4a018b4391adcfe72e4cce63aa121dc55565beefed1d8d9`.
The exact method/path join yields one `POTENTIAL_IMPACT`, conditional on the operator-selected
provider correspondence. It does not establish request dispatch, affected values or outage.
The helper `parseCheckoutInput` is separately recorded as one `ast.opaque-call.v1` unknown;
its implementation is not imported or executed by this investigation.

Captured byte lengths: base contract **2,563**, candidate **2,847**, mapping **1,140**, source
**753**. Full normalized output is in the committed
[MercuryPay golden expectation](tests/golden/mercurypay.analysis.json), explicitly a test
expectation rather than independent runtime proof. Actual local JSON/Markdown outputs are
under ignored `.local/phase-2/`. Business inputs, mock definitions and assertions are not run.

## G. VALIDATION

Toolchain: Windows PowerShell 7.6; Node 24.21.0; Corepack 0.36.0; pnpm 11.25.0.
The install used the exact lockfile and disabled lifecycle scripts. Actual records and raw
fixture identities are in [phase-2-verification.json](docs/validation/phase-2-verification.json).

| Command/check                                              | Actual local result                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `corepack pnpm install --frozen-lockfile --ignore-scripts` | Exit 0; reproducible workspace importer, no lifecycle execution                                           |
| `corepack pnpm check`                                      | Exit 0: TypeScript, lint with zero warnings, formatting, all tests, fixture gate, production build, smoke |
| Full `vitest run` within check                             | **404/404** tests, **14/14** files; final recorded run 2.57 s                                             |
| `corepack pnpm test:analysis`                              | **327/327** tests, **10/10** files; final recorded run 2.42 s                                             |
| Explicit fixture gate                                      | **37/37**; existing core tests **40/40** included in full suite, preserving original 77                   |
| Production static export                                   | Success; four application pages plus static not-found; no deployment                                      |
| Local HTTP smoke                                           | **6/6**, including 404 and unsupported-method 405                                                         |
| `corepack pnpm analyze:fixture`                            | Exit 0; 2 deltas, 1 usage, 1 impact, 1 conservative helper unknown                                        |
| Two repeated actual analyses                               | Equal canonical JSON and logical digest; result **8,732 bytes**                                           |
| `corepack pnpm audit --json`                               | Exit 0; zero reported info/low/moderate/high/critical advisories across 242 entries                       |
| Fixture and adapter identity check                         | All seven artifacts match reviewed Git bytes and manifest; adapter unchanged                              |
| All-files publication scan / `git diff --check`            | No secret/private-path/binary findings in the audited set; no whitespace errors                           |
| GitHub Actions                                             | Pending phase-branch push; final receipt must record the actual conclusion                                |

Final observed CLI processing duration was **505 ms**. A separate two-analysis sample took
**83 ms** after module startup; its process RSS sample was **122,019,840 bytes**. These are
bounded local observations, not a throughput benchmark, peak-memory claim or hard RSS limit.

Acceptance mapping:

| Requirements | Evidence                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| T01–T04      | Real MercuryPay integration, curated byte pins/pointers, exact source slice/digest, verified potential-impact graph                       |
| T05–T07      | 108 comparator tests plus 9 separately generated request/response directionality golden cases                                             |
| T08–T11      | Identity/whitespace integration, unused/wrong-method negative scope, comments/strings, multiple files, dynamic and arbitrary SDK unknowns |
| T12–T14      | Dialect/composition/reference rejection, malformed JSON/source/pointers, traversal/UNC/junction and encoding tests                        |
| T15          | Size/count/depth/token/node/time/output limits, worker deadline, cancellation and aggregate graph-growth regression                       |
| T16–T17      | Forged status/digest/provenance rejection, accessor nonexecution, exact LF/CRLF/Unicode spans and portable paths                          |
| T18          | External binary not selected; trusted worker start/crash/exit/invalid-output simulations all fail closed                                  |
| T19–T20      | Full golden reproduction, repeated real-run digest equality, unchanged Phase 1 tests and byte identities                                  |

Intermediate failures were corrected, not hidden: TypeScript narrowing errors; one AST node-limit
test whose 20,000 statements were actually below the 50,000-node limit (corrected to a measured
over-limit input without weakening the guard); lint errors in regex/cleanup code; an initial
golden-generation command syntax error; and a dependency-metadata probe resolved from the wrong
workspace. Review also tightened UNC report output, curated-byte verification, incremental
output limits, accessor rejection, opaque format handling and unknown SDK calls. Final gates
above were rerun after the corresponding source fixes. No test or fixture oracle was weakened.

## H. SECURITY & PRIVACY

Selections require normalized explicit relative paths, strict roles and bounded file counts.
Reads reject symlinks/junctions, unsafe roots, hidden/generated paths, nonregular/duplicate
file identities and detected mutation. UTF-8/BOM/NUL, duplicate JSON keys, prototype keys,
token/depth/node sizes and aggregate bytes are guarded. Caller-authored hashes/provenance do
not grant trust. Verified claims recompute from captured bytes; the Phase 1 guard is unchanged.

No product network-fetching, reference resolution, consumer imports/eval, shell command
construction, model SDK, writer credential or remote runner was introduced. Only the CLI's
fixed project-authored worker executes; tests launch the authored CLI for integration. Poisoned
source, package scripts and tsconfig remain data. Report HTML/Markdown syntax is escaped;
some viewers may auto-link plain URLs. Local reports can contain selected private excerpts
and must be reviewed before sharing.

The `.gitignore` already excludes node_modules, build output, caches, `.env` except the
comments-only example, credential/key/archive/binary patterns and `.local`. It required no
weakening. CI keeps immutable action SHAs, `contents: read`, ordinary push/pull_request events,
no stored checkout credentials, no secret references and no deployment/write step.

TypeScript and Zod license metadata remains Apache-2.0 and MIT, with no install lifecycle hooks.
No new third-party license family or downloaded executable was added. Prior transitive
redistribution flags and the owner's unresolved project-license choice remain recorded in
dependency documentation. A clean advisory/pattern scan is not proof of zero vulnerabilities
or absence of every possible secret.

Residual risks: local filesystem TOCTOU and same-device bind mounts; worker heap is not total
process RSS; direct pure APIs are cooperative, not hostile-object/Proxy sandboxes; synchronous
parser defects; deliberately narrow semantics and conservative helper-call unknowns. These
are explicit single-user local assumptions, not production multi-tenant isolation claims.

## I. COMPATIBILITY

All original **77** Phase 1 tests pass within the 404-test suite. Core foundation schemas and
guard behavior remain intact. Version 2 analysis schemas are additive in the new package.
The original static export and six smoke checks pass; only a truthful status-table text changed.
The Phase 1 report retains its historical findings and existing publication cross-link.

Actual recomputed **before = after = manifest** SHA-256 values:

| Immutable artifact (relative to MercuryPay fixture directory) | Before and after SHA-256                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `contracts/v1.openapi.json`                                   | `d07ccd275971286eb7b702b2f0a8c86c2f69a502370e3a84e0f6997b66fbd164` |
| `contracts/v2.openapi.json`                                   | `8d9d56cfaafef102a4064cd0a44fbeaf17a6a8f2ed196f5d7f953c7a1d57531e` |
| `provider-mocks/v1.json`                                      | `b6957a1a6e350c374baed8bfcac21bba22b1f8ed1fdb195604ffd85d19d65b9c` |
| `provider-mocks/v2.json`                                      | `da12aa35e5118cc8a95dfe446fb16b47a2100fe1d688976599e08610a12282cb` |
| `business-cases/checkout.json`                                | `e884ef0aa00575d71bfa100850f7d69380ad9a595d0d052dc9bbfd09cbd41b17` |
| `business-cases/assertions.json`                              | `3302eb961ac63612c6699cee89ae0d7fbc1508ebbfeddd6be26591186ee632a0` |
| `migration-ground-truth/mapping.json`                         | `e1494197b575503c48681ea4188a2b70c8631e9742eeee343136f1741db5456f` |

Unchanged fixture tree: `6fa099c93680d9a1fec24a1cfb1c5a7d7009069adebfa023e6288c208a458b75`.
The adapter before/after hash is listed in F and independently recorded in the verification JSON.

## J. ISSUES/DEBT

| Priority                            | Reproduction / consequence                                                                          | Required resolution boundary                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| P1 before hosted ingestion          | Race a hostile filesystem or use same-device mount changes; local checks are not atomic containment | Separately approved isolation/hosted ingestion design                                                     |
| P1 before general provider support  | Supply refs, parameters, arrays, security or other dialects; analysis stops                         | Supported-scope ADR and golden/negative expansion, not silent parser fallback                             |
| P1 before runtime proof             | Observe a lexical match in dead code; no failure/reachability proof follows                         | Phase 4 approved immutable-fixture harness and reference repair proof                                     |
| P2                                  | Any helper/SDK call outside literal fetch yields unknown; scoped absence becomes conservative       | Explicit reviewed static resolver rules, never whole-program promises                                     |
| P2                                  | A failed analysis has a diagnostic digest without input identities                                  | Do not cache it as completed evidence; future durable state must bind attempted input metadata separately |
| P2 before redistribution/deployment | Project license remains unselected; existing native transitive license flags remain                 | Owner/legal review before a separately authorized distribution step                                       |

No unresolved blocker is accepted for the authorized local subset; publication/CI remains a gate.

## K. PUBLICATION

Branch: `phase/02-deterministic-analysis`.
Implementation SHA, remote equality, intended tree and actual hosted CI are pending publication.
The report is prepared before the implementation commit. A subsequent receipt will identify
the implementation SHA/URL, avoiding an impossible self-referencing commit hash. Final handoff
will identify the final receipt HEAD and working-tree status. `main` must remain the reviewed
baseline throughout. No PR or merge is authorized.

## L. PHASE 3 GATE

GO, once this phase's publication gates pass, means **review readiness only**. Phase 3 requires
explicit owner authorization and a concrete durable-state/workflow ADR: selected infrastructure
and costs, immutable artifact storage, idempotency keys, transactions, duplicate-delivery behavior,
retry/recovery, cancellation, authorization freshness, retention and bounded budgets. Acceptance
must include crash/restart and partial-write evidence. No Phase 3 files/services were scaffolded.

## M. FINAL STATUS

PHASE 2 IMPLEMENTATION COMPLETE — LOCAL GATES PASSED — PUBLICATION/CI VERIFICATION PENDING — NO PHASE 3 AUTHORIZATION
