# DriftReplay Phase 1 Report

Publication note: local user and attachment paths in the historical command ledger were redacted for GitHub. Original local evidence is preserved under ignored .local/publication. Validation outcomes and fixture bytes are unchanged. This report records Phase 1 before the separately authorized GitHub publication; see docs/phase-1-publication.md for that receipt.

Review date: 2026-10-10. Workspace: `A:\DriftReplay`. Authority: the owner's pasted **Phase 1 Implementation Authorization**, followed by the accepted Phase 0 corrections. Supporting documents do not authorize additional phases.

## A. PHASE 1 STATUS

**COMPLETE — GO for Phase 2 review.** All functional Phase 1 gates passed. This recommendation permits a review decision only; Phase 2 implementation still needs explicit authorization.

The deliverable is a local foundation with real static fixtures, schemas, a pure v1 consumer, a static dashboard and repeatable local checks. The 77 passing tests do not establish baseline PASS → changed FAIL → patched PASS, production security, actual-provider compatibility, or autonomous repair.

## B. SCOPE COMPLIANCE

Preflight found zero entries in the workspace and no `.git`. All authored project files, dependency installation trees, build artifacts and validation records are under `A:\DriftReplay`; normal package-manager caches were used outside it. The attached authorization/review documents, installed launcher and skill documentation were read without alteration. No pre-existing user project files were overwritten.

No Git initialization, commits, remote configuration, pushes, GitHub API calls, OAuth/App registration, cloud provisioning, database/migrations, model/provider API calls, credentials, container engines, deployment, PR writing or arbitrary-repository execution occurred. Product agents and replay did not execute. Codex implementation subagents assisted with authorized local development; the final status phrase refers to DriftReplay runtime agents.

External contacts were official documentation/public release HTML, npm metadata/package/advisory services, and normal package-manager supply-chain checks. These are dependency research/downloads, not product integrations. No claim of packet-level egress monitoring is made.

One process exception is disclosed: pnpm implicitly synchronized reviewed pending dependency changes during a subagent's formatter command. No build hooks appeared in that output. The final configuration disables implicit installs; explicit installs used `--ignore-scripts`. Details and the failed intermediate configuration are in sections D/G. No permission or external service scope was broadened.

A local static preview remains available at [127.0.0.1:4173](http://127.0.0.1:4173), bound to loopback. It is not a deployment. Stop its terminal process when finished.

## C. FILE TREE & CHANGE INVENTORY

All listed files were added during this phase. Subsequent changes were confined to those new files. Generated `node_modules`, `.next`, `out`, and TypeScript build caches are excluded from the source inventory and ignored by Git configuration.

| Area                           | Actual deliverable and reason                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Root workspace                 | Exact manifests/lockfile, strict TypeScript, Vitest, ESLint, Prettier, editor/ignore/line-ending configuration |
| `packages/core`                | Runtime schemas, conservative claim policy, byte/tree digest helpers, 40 focused tests                         |
| `examples/fixtures/mercurypay` | Seven versioned JSON artifacts, manifest, fixed-path static validator and documentation                        |
| `apps/demo-shop`               | Provider-independent checkout input and isolated, unmigrated pure v1 adapter                                   |
| `apps/web`                     | Four static App Router pages, semantic navigation, local styles/icons and error/not-found views                |
| `tests/fixtures`               | 37 cross-package static fixture and pure adapter tests                                                         |
| `scripts`                      | Reviewed local Next launcher, static preview, six-request smoke test and reachable dependency inventory        |
| `docs`                         | Foundation ADR, support boundary, threats, phase gates, dependency decisions and actual validation evidence    |
| `.github/workflows/ci.yml`     | Local least-privilege workflow definition; never submitted or executed on GitHub                               |

The fixture directory is a small private workspace package to make typed JSON imports stable. The four helper scripts and validation records support reproducibility; no unused future service/package directories were created. `next-env.d.ts` was generated by Next as expected.

Actual inventory: 68 implementation/configuration/documentation files at the source scan, plus this report and 11 evidence files (80 listed paths). The report is also added to the final source inventory.

```text
.editorconfig
.env.example
.gitattributes
.github/workflows/ci.yml
.gitignore
.prettierignore
.prettierrc.json
PHASE_1_REPORT.md
README.md
apps/demo-shop/package.json
apps/demo-shop/src/checkout.ts
apps/demo-shop/src/index.ts
apps/demo-shop/src/v1-adapter.ts
apps/demo-shop/tsconfig.json
apps/web/app/error.tsx
apps/web/app/evidence/page.tsx
apps/web/app/fixtures/mercurypay/page.tsx
apps/web/app/globals.css
apps/web/app/layout.tsx
apps/web/app/not-found.tsx
apps/web/app/page.tsx
apps/web/app/status/page.tsx
apps/web/components/fixture-data.ts
apps/web/components/icons.tsx
apps/web/components/navigation.tsx
apps/web/components/ui.tsx
apps/web/next-env.d.ts
apps/web/next.config.mjs
apps/web/package.json
apps/web/tsconfig.json
docs/adr/0001-foundation.md
docs/dependencies.md
docs/phase-gates.md
docs/security-boundaries.md
docs/supported-scope.md
docs/validation/browser-review.md
docs/validation/core-commands.json
docs/validation/dependency-audit-final.json
docs/validation/dependency-audit.json
docs/validation/dependency-inventory.json
docs/validation/dependency-tree.json
docs/validation/fixture-commands.json
docs/validation/parent-commands.json
docs/validation/recovered-commands.json
docs/validation/source-file-inventory.txt
docs/validation/web-commands.json
eslint.config.mjs
examples/fixtures/mercurypay/README.md
examples/fixtures/mercurypay/business-cases/assertions.json
examples/fixtures/mercurypay/business-cases/checkout.json
examples/fixtures/mercurypay/contracts/v1.openapi.json
examples/fixtures/mercurypay/contracts/v2.openapi.json
examples/fixtures/mercurypay/fixture-manifest.json
examples/fixtures/mercurypay/migration-ground-truth/mapping.json
examples/fixtures/mercurypay/package.json
examples/fixtures/mercurypay/provider-mocks/v1.json
examples/fixtures/mercurypay/provider-mocks/v2.json
examples/fixtures/mercurypay/tsconfig.json
examples/fixtures/mercurypay/validation.ts
package.json
packages/core/README.md
packages/core/package.json
packages/core/src/digests.test.ts
packages/core/src/digests.ts
packages/core/src/index.ts
packages/core/src/policy.test.ts
packages/core/src/policy.ts
packages/core/src/schemas.test.ts
packages/core/src/schemas.ts
packages/core/tsconfig.json
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/dependency-inventory.mjs
scripts/next.mjs
scripts/preview.mjs
scripts/smoke.mjs
tests/fixtures/mercurypay.test.ts
tsconfig.base.json
tsconfig.tests.json
vitest.config.ts
```

## D. TOOLCHAIN & DEPENDENCIES

| Tool                                          | Exact selected version             |
| --------------------------------------------- | ---------------------------------- |
| Windows / PowerShell                          | Microsoft Windows 10.0.26300 / 7.6 |
| Node / Corepack / pnpm                        | 24.21.0 / 0.36.0 / 11.25.0         |
| Next / React / React DOM                      | 16.4.0 / 19.3.0 / 19.3.0           |
| TypeScript / Zod                              | 5.9.3 / 4.6.5                      |
| Vitest / Vite                                 | 5.0.3 / 8.3.4                      |
| ESLint / @eslint/js / typescript-eslint       | 10.12.0 / 10.0.1 / 8.71.1          |
| globals / Prettier                            | 17.13.0 / 3.9.9                    |
| @types/node / @types/react / @types/react-dom | 24.10.0 / 19.3.0 / 19.3.0          |
| Git informational version only                | 2.53.0.windows.3                   |

Direct dependency versions and pnpm are exact; internal dependencies use `workspace:0.1.0`. TypeScript 5.9.3 was selected for the current lint peer range; this is not a claim to use every newest release.

The initially empty workspace was installed using `corepack pnpm install --ignore-scripts --reporter append-only`, with reviewed dependency corrections recorded in G. Final reproduction used `corepack pnpm install --frozen-lockfile --ignore-scripts --reporter append-only`. Lockfile SHA-256 before and after:

`5a94bfab1b82bdd2913eca84619cf5e71aafa107410bd2642e19b5f66d747df5`.

```text
5a94bfab1b82bdd2913eca84619cf5e71aafa107410bd2642e19b5f66d747df5
```

Build-script policy: `allowBuilds: {}`, `strictDepBuilds: true`, `ignorePnpmfile: true`, disabled side-effect cache/global virtual store, and explicit `--ignore-scripts`. `verifyDepsBeforeRun: false` prevents command-time implicit installation; frozen install is the separate lockfile gate. Engine and peer checks remain strict. No dependency lifecycle script was approved.

Final reachable Windows inventory: **184 installed package identities**, no lifecycle scripts found in their inspected manifests. This differs from the lockfile's platform-inclusive entry count. Final registry advisory result: **zero known advisories returned**, not a comprehensive security guarantee.

Material license metadata flags: Sharp's Windows binary declares Apache-2.0 AND LGPL-3.0-or-later; Lightning CSS and its Windows binary declare MPL-2.0; caniuse-lite declares CC-BY-4.0. Project license and redistribution review remain unresolved. See [dependency decisions and actually consulted official sources](docs/dependencies.md) and [exact reachable inventory](docs/validation/dependency-inventory.json).

## E. FUNCTIONAL DELIVERABLES

| Deliverable                             | Working behavior                                                                                                 | Limit                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Overview `/`                            | Product intent, source fixture card and explicit planned proof chain                                             | No analysis metrics or run claims                     |
| Fixture explorer `/fixtures/mercurypay` | Before/after summaries and imported JSON, mappings, inputs, oracle and manifest                                  | All MercuryPay content is synthetic                   |
| Evidence `/evidence`                    | Seven separate finding definitions and required proof                                                            | No recorded runtime evidence                          |
| Status `/status`                        | Current foundation and future capability boundaries                                                              | Not an operational monitor                            |
| Core public surface                     | Versioned Zod boundaries, frozen evidence/artifact refs, strict relative paths, stop states and digest utilities | Matching shape/digests does not authenticate evidence |
| Foundation claim policy                 | Admits only UNVERIFIED; refuses active analysis/replay/repair claims                                             | Not a verifier or authorization engine                |
| Demo shop                               | Stable business input becomes `POST /v1/charges` with `customer_email`                                           | Pure construction only; no HTTP/payment execution     |
| Fixture validation                      | Known-shape, mapping, semantics and actual byte-digest checks                                                    | Fixed synthetic subset, not a general OpenAPI engine  |
| Local workflow                          | Typecheck, lint, formatting, tests, fixture tests, build and smoke scripts                                       | Remote CI and Vercel have not run                     |

The dashboard is a static Next export with local system fonts/CSS/SVG, light/dark CSS, skip link/focus styles and responsive navigation. Browser checks covered rendered dark theme, the four routes, narrow layout and keyboard skip-to-content. Light theme was source-reviewed; no exhaustive accessibility certification is claimed. The error/not-found views are real UI paths, not simulated product failures.

## F. FIXTURE INVENTORY

MercuryPay is synthetic and does not describe a real provider. Both contracts are OpenAPI 3.0.3 JSON using a declared inline object/string/integer subset. S1 accepts `POST /v1/charges` with required `customer_email`; S2 defines `POST /v2/payments` with required `customer.email` and rejects the old flat representation.

Retirement is explicitly specified in the **S2 mock definition**: old route → 410 `SYNTHETIC_VERSION_RETIRED`; invalid payload → 400; unknown route → 404. No general inference that introducing v2 retires v1 is made. The mapping uses `curated-synthetic-ground-truth` and records the owner's specified relationship; it is not an algorithmically inferred rename.

All paths below are relative to `examples/fixtures/mercurypay/`.

| Artifact                              | SHA-256 of actual raw bytes                                        |
| ------------------------------------- | ------------------------------------------------------------------ |
| `contracts/v1.openapi.json`           | `d07ccd275971286eb7b702b2f0a8c86c2f69a502370e3a84e0f6997b66fbd164` |
| `contracts/v2.openapi.json`           | `8d9d56cfaafef102a4064cd0a44fbeaf17a6a8f2ed196f5d7f953c7a1d57531e` |
| `provider-mocks/v1.json`              | `b6957a1a6e350c374baed8bfcac21bba22b1f8ed1fdb195604ffd85d19d65b9c` |
| `provider-mocks/v2.json`              | `da12aa35e5118cc8a95dfe446fb16b47a2100fe1d688976599e08610a12282cb` |
| `business-cases/checkout.json`        | `e884ef0aa00575d71bfa100850f7d69380ad9a595d0d052dc9bbfd09cbd41b17` |
| `business-cases/assertions.json`      | `3302eb961ac63612c6699cee89ae0d7fbc1508ebbfeddd6be26591186ee632a0` |
| `migration-ground-truth/mapping.json` | `e1494197b575503c48681ea4188a2b70c8631e9742eeee343136f1741db5456f` |

Tree digest: `6fa099c93680d9a1fec24a1cfb1c5a7d7009069adebfa023e6288c208a458b75`.

The tree digest hashes the UTF-8 concatenation of the seven artifact entries, sorted by relative path, each exactly `path:sha256\n` (LF). It excludes the manifest itself. Tests recompute bytes and compare references/tree; no fake Git SHA is used. Formatting changes to hashed JSON require an explicit new digest; `.gitattributes` specifies LF.

Business case: `shopper@example.invalid`, integer **2599 minor USD units** ($25.99), constant currency. The five fixed assertion IDs are `checkout.succeeded`, `checkout.transaction-identity`, `checkout.amount-preserved`, `checkout.currency-preserved`, and `checkout.customer-preserved`. Customer preservation needs future harness request observations because the success response itself has no email.

The v1 adapter remains unmigrated. A later candidate may change only `apps/demo-shop/src/v1-adapter.ts`; contracts, mocks, inputs, assertions, mapping, manifest, harness and dependency policy are outside that initial patch scope. Phase 4 must still pin the harness, runtime, dependencies and network policy. Behavior definitions and the business oracle have **not** been exercised in a three-variant replay.

Conformance limit: the checks validate these authored documents and selected semantics, not all OpenAPI 3.0.3 features. Remote references, composition, callbacks, general YAML and other dialects remain unsupported. No external conformance certification or real-provider execution is claimed.

## G. VALIDATION EVIDENCE

| Check                                        | Observed result                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Fresh initial dependency installation        | PASS after launcher correction; initial bare-pnpm refusal retained                                    |
| Final frozen install                         | PASS, identical lockfile hash before/after                                                            |
| Strict workspace/test TypeScript             | PASS                                                                                                  |
| Root ESLint                                  | PASS, zero warnings                                                                                   |
| Root formatting                              | PASS; final report-only closeout recorded below                                                       |
| Core unit tests                              | 40 PASS in three files                                                                                |
| Full suite                                   | 77 PASS in four files                                                                                 |
| Explicit fixture/demo suite                  | 37 PASS in one file; this is a subset of 77, not additional coverage                                  |
| Negative fixtures                            | PASS: missing routes/files, flat v2 identity, semantic/mapping changes, bad digest, unsupported cases |
| Production Next build                        | PASS, four content routes and generated not-found output                                              |
| Local HTTP smoke                             | Six PASS: four 200 pages, missing page 404, unsupported method 405                                    |
| Final mobile CSS change                      | Rebuild and six smoke checks PASS; pointer navigation verified                                        |
| Browser checks                               | PASS within [recorded scope](docs/validation/browser-review.md); no warnings/errors returned          |
| CI definition                                | Local structural/security review PASS; remote execution NOT RUN                                       |
| Secret-pattern content scan                  | Zero configured matches in 68 source files; bounded scan only                                         |
| Final package advisory query                 | Zero known advisories returned                                                                        |
| Replay / repair / GitHub / providers / cloud | NOT RUN by design                                                                                     |

The complete `corepack pnpm check` gate passed again after all application changes, including mobile navigation and the overview wording that attributes route retirement to the synthetic mock. It passed typecheck, lint, formatting, all 77 tests, the 37-test fixture subset, production build and six HTTP smoke checks. Final reporting edits only record these observed results.

### Failures, warnings and corrections

- Bare pnpm used a bundled Node 24.19.0 wrapper and failed the engine requirement. Used the already-installed system Node through Corepack; no system upgrade.
- ESLint 9 installation warned of end of support. Replaced it with ESLint 10 plus TypeScript ESLint. The Next React/accessibility plugin bundle's peers did not support ESLint 10; no peer check was bypassed.
- An optional Next lint plugin brought a high-severity `braces` advisory. Removed the optional plugin; final audit returned zero advisories. Framework-specific lint coverage is a documented limitation.
- pnpm's automatic pre-command install was observed and disclosed. `verifyDepsBeforeRun: error` then failed with `opts3.currentPnpmfiles is not iterable`; final `false` disables implicit installation.
- One negative fixture test tried mutating an intentionally frozen parsed reference. It was corrected to supply a separate altered input object; the bad-digest rejection assertion remained.
- A TypeScript attempt named nonexistent `tsconfig.checks.json`; the correct checked-in target is `tsconfig.tests.json`, which passed.
- Core's control-character regex and a fixture-validator unused variable failed lint. Implementations were corrected without suppressing rules.
- One fixture package formatting check failed; root formatting and subsequent whole-workspace checks passed.
- Initial dependency inventory included stale/nested metadata; the corrected reachable-tree inventory is the final evidence.
- Initial secret scan checked filenames by mistake; the explicitly recorded content scan supersedes it.
- Early narrow navigation pointer behavior was unreliable; the final two-column mobile layout and pointer retest passed.
- The mapping wording was corrected from “human-authored” to “owner-specified”; its digest/tree changed. Business input and assertion hashes did not change.

No failures were hidden by deleting tests or weakening expected business assertions.

### Executed command ledger

Commands below are the actual shell invocations, including failed attempts, read-only reads, metadata queries and local formatting. Working directory is `A:\\DriftReplay` unless the recorded command explicitly reads another path. Shell session polls are output retrieval, not additional shell commands; their output and exit codes remain in the JSON ledgers. Package scripts expand into the checked-in script definitions. File edits made through apply_patch and browser-tool calls are not shell commands.

Raw evidence: [parent commands](docs/validation/parent-commands.json), [core and independent review commands](docs/validation/core-commands.json), [fixture commands](docs/validation/fixture-commands.json), [web commands](docs/validation/web-commands.json), and [recovered read commands](docs/validation/recovered-commands.json). Two preflight read commands were recovered from this chat's actual execution history; they are reproduced in the launcher-rendered form rather than reconstructed from memory.

#### preflight-01

PASS, exit 0: Read explicit Phase 1 authorization.

```powershell
Get-Content -LiteralPath '<LOCAL_ATTACHMENT_DIRECTORY>\Pasted text.txt' -Raw
```

#### preflight-02

PASS, exit 0: Workspace empty; review file exists; tools discovered; formatting obscured paths.

```powershell
Get-ChildItem -LiteralPath 'A:\DriftReplay' -Force | Select-Object Mode,Length,Name
Get-Item -LiteralPath '<USER_HOME>\Downloads\DriftReplay_Phase_0_Review_and_Phase_1_Prompt.docx' | Select-Object FullName,Length
Get-Command node,pnpm,npm,git,rg -ErrorAction SilentlyContinue | Select-Object Name,Source
```

#### preflight-03

PASS, exit 0; output retained in parent-commands.json.

```powershell
$phase1Root = Get-Item -LiteralPath 'A:\DriftReplay'
$phase1Entries = @(Get-ChildItem -LiteralPath $phase1Root.FullName -Force)
[pscustomobject]@{OS=[System.Runtime.InteropServices.RuntimeInformation]::OSDescription; Workspace=$phase1Root.FullName; EntryCount=$phase1Entries.Count; HasGit=(Test-Path -LiteralPath 'A:\DriftReplay\.git')} | ConvertTo-Json
Get-Command node,corepack,pnpm,npm,git,rg -ErrorAction SilentlyContinue | Select-Object Name,Source | ConvertTo-Json
node --version
if (Get-Command corepack -ErrorAction SilentlyContinue) { corepack --version }
pnpm --version
git --version
if (Test-Path -LiteralPath 'A:\AGENTS.md') { Get-Content -LiteralPath 'A:\AGENTS.md' -Raw }
```

#### preflight-05

PASS, final exit 0; the separate session-completion record is retained in parent-commands.json.

```powershell
npm view next version engines peerDependencies license scripts --json
npm view react version engines license --json
npm view react-dom version engines peerDependencies license --json
npm view typescript version engines license --json
npm view vitest version engines peerDependencies license scripts --json
```

#### preflight-06

PASS, final exit 0; the separate session-completion record is retained in parent-commands.json.

```powershell
npm view zod version engines license scripts --json
npm view eslint version engines peerDependencies license --json
npm view eslint-config-next version engines peerDependencies license --json
npm view prettier version engines license --json
npm view pnpm@11.25.0 version engines license --json
npm view @types/node version --json
npm view @types/react version --json
npm view @types/react-dom version --json
```

#### preflight-07

PASS, exit 0; output retained in parent-commands.json.

```powershell
npm view typescript@5.9.3 version engines license --json
npm view eslint@9.39.4 version engines license --json
npm view @types/node@24.10.0 version license --json
npm view vite version engines scripts optionalDependencies --json
npm view vitest@5.0.3 dependencies --json
npm view eslint-config-next@16.4.0 dependencies --json
```

#### install-01

FAIL, exit 1: bare pnpm wrapper used Node 24.19.0; root requires installed system Node 24.21.0. Resolved by corepack pnpm.

```powershell
pnpm install --ignore-scripts --reporter append-only
```

#### resume-01

PASS, exit 0; output retained in parent-commands.json.

```powershell
corepack pnpm --version
Get-Content -LiteralPath '<USER_HOME>\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' -Raw
rg --files -g '!node_modules' -g '!.next' -g '!out' -g '!pnpm-lock.yaml'
```

#### install-02

PASS, final exit 0; the separate session-completion record is retained in parent-commands.json.

```powershell
corepack pnpm install --ignore-scripts --reporter append-only
```

#### dep-review-01

PASS, exit 0; output retained in parent-commands.json.

```powershell
npm view eslint-plugin-react version peerDependencies --json
npm view typescript-eslint version peerDependencies --json
npm view eslint-plugin-jsx-a11y version peerDependencies --json
npm view @next/eslint-plugin-next@16.4.0 peerDependencies --json
```

#### read-01

PASS, exit 0; output retained in parent-commands.json.

```powershell
Get-Content -LiteralPath 'packages\core\src\schemas.ts' -Raw
Get-Content -LiteralPath 'packages\core\src\policy.ts' -Raw
Get-Content -LiteralPath 'apps\web\components\fixture-data.ts' -Raw
Get-Content -LiteralPath 'apps\web\app\page.tsx' -Raw
```

#### dep-review-02

PASS, exit 0; output retained in parent-commands.json.

```powershell
npm view @eslint/js version engines license --json
npm view globals version engines license --json
```

#### install-03

PASS, exit 0; output retained in parent-commands.json.

```powershell
corepack pnpm install --ignore-scripts --reporter append-only
```

#### dep-inventory-01

Completed, exit 0. Initial inventory included stale/nested package metadata; superseded by reachable dependency-tree inventory in lock-repro-01.

```powershell
node scripts/dependency-inventory.mjs --write
Get-Content -LiteralPath 'pnpm-workspace.yaml' -Raw
Get-Content -LiteralPath 'package.json' -Raw
```

#### install-04

PASS, exit 0; output retained in parent-commands.json.

```powershell
corepack pnpm install --frozen-lockfile --ignore-scripts --reporter append-only
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
corepack pnpm list -r --depth Infinity --json | Set-Content -LiteralPath 'docs\validation\dependency-tree.json' -Encoding utf8
```

#### read-02

PASS, exit 0; output retained in parent-commands.json.

```powershell
Get-Content -LiteralPath 'docs\validation\dependency-tree.json' -TotalCount 65
Get-Content -LiteralPath 'apps\web\app\layout.tsx' -Raw
Get-Content -LiteralPath 'apps\web\app\globals.css' -TotalCount 70
```

#### dep-audit-01

FAIL, exit 1: advisory found in optional Next lint plugin dependency chain; removed that plugin. Final registry audit passed.

```powershell
node scripts/dependency-inventory.mjs --write
corepack pnpm audit --json | Set-Content -LiteralPath 'docs\validation\dependency-audit.json' -Encoding utf8
exit $LASTEXITCODE
```

#### read-03

PASS, exit 0; output retained in parent-commands.json.

```powershell
Get-Content -LiteralPath 'docs\validation\dependency-audit.json' -Raw
Get-Content -LiteralPath 'examples\fixtures\mercurypay\validation.ts' -Raw
```

#### install-05-audit

PASS, exit 0; output retained in parent-commands.json.

```powershell
corepack pnpm install --ignore-scripts --reporter append-only
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
corepack pnpm audit --json | Set-Content -LiteralPath 'docs\validation\dependency-audit-final.json' -Encoding utf8
exit $LASTEXITCODE
```

#### format-01

PASS, exit 0; output retained in parent-commands.json.

```powershell
corepack pnpm format
```

#### gate-01

PASS, exit 0; output retained in parent-commands.json.

```powershell
corepack pnpm typecheck
```

#### gate-02

PASS, exit 0; output retained in parent-commands.json.

```powershell
corepack pnpm lint
```

#### gate-03

PASS, exit 0; output retained in parent-commands.json.

```powershell
corepack pnpm test
```

#### build-01

PASS, final exit 0; the separate session-completion record is retained in parent-commands.json.

```powershell
corepack pnpm build
```

#### tool-docs-02

PASS, exit 0; output retained in parent-commands.json.

```powershell
Get-Content -LiteralPath '<USER_HOME>\.codex\plugins\cache\openai-bundled\computer-use\26.1007.21434\docs\guidance.md' -Raw
Get-Content -LiteralPath '<USER_HOME>\.codex\plugins\cache\openai-bundled\computer-use\26.1007.21434\docs\confirmations.md' -Raw
```

#### gate-04

PASS, exit 0; output retained in parent-commands.json.

```powershell
corepack pnpm test:fixtures
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
corepack pnpm format:check
```

#### lock-repro-01

PASS, exit 0: frozen install preserved lockfile SHA-256; final reachable dependency count 184, lifecycle script list empty.

```powershell
$phase1LockBefore = (Get-FileHash -LiteralPath 'pnpm-lock.yaml' -Algorithm SHA256).Hash
corepack pnpm install --frozen-lockfile --ignore-scripts --reporter append-only
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$phase1LockAfter = (Get-FileHash -LiteralPath 'pnpm-lock.yaml' -Algorithm SHA256).Hash
[pscustomobject]@{Before=$phase1LockBefore; After=$phase1LockAfter; Unchanged=($phase1LockBefore -eq $phase1LockAfter)} | ConvertTo-Json
if ($phase1LockBefore -ne $phase1LockAfter) { exit 1 }
corepack pnpm list -r --depth Infinity --json | Set-Content -LiteralPath 'docs\validation\dependency-tree.json' -Encoding utf8
node scripts/dependency-inventory.mjs --write
```

#### smoke-01

PASS, exit 0; output retained in parent-commands.json.

```powershell
corepack pnpm smoke
```

#### preview-01

RUNNING: loopback static preview started at http://127.0.0.1:4173 in session 63992. Browser checks passed; intentionally left available for review.

```powershell
corepack pnpm preview
```

#### read-ui-01

PASS, exit 0; output retained in parent-commands.json.

```powershell
Get-Content -LiteralPath 'apps\web\app\evidence\page.tsx' -TotalCount 95
Get-Content -LiteralPath 'apps\web\app\fixtures\mercurypay\page.tsx' -Raw
Get-Content -LiteralPath 'examples\fixtures\mercurypay\migration-ground-truth\mapping.json' -Raw
```

#### fixture-attribution-01

PASS, exit 0; output retained in parent-commands.json.

```powershell
$phase1DigestUpdate = @'
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = 'examples/fixtures/mercurypay/';
const file = root + 'fixture-manifest.json';
const manifest = JSON.parse(readFileSync(file,'utf8'));
const refs = [manifest.contracts.v1, manifest.contracts.v2, manifest.mocks.v1, manifest.mocks.v2, manifest.businessCase, manifest.assertions, manifest.migrationMapping];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const ref of refs) ref.sha256 = hash(readFileSync(root + ref.path));
manifest.treeDigest = hash(refs.map(ref => ref.path+':'+ref.sha256+'\n').sort().join(''));
writeFileSync(file, JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({reason:'Correct attribution: owner-specified mapping, not human-authored JSON; no business inputs/assertions changed.',treeDigest:manifest.treeDigest,refs},null,2));
'@
node --input-type=module -e $phase1DigestUpdate
corepack pnpm exec prettier --write apps/web/app/evidence/page.tsx examples/fixtures/mercurypay/fixture-manifest.json
```

#### final-gate-01

PASS, final exit 0 (completion in final-gate-01-progress): typecheck, lint, formatting, 77 tests, 37 fixture tests, production build, six HTTP checks.

```powershell
corepack pnpm check
```

#### scope-audit-01

Completed, exit 0. Its secret check searched filenames, not content; superseded by scope-audit-02. Other inventory results remain valid.

```powershell
$phase1SourceFiles = @(rg --files --hidden -g '!node_modules/**' -g '!**/node_modules/**' -g '!**/.next/**' -g '!**/out/**' -g '!**/*.tsbuildinfo' -g '!docs/validation/**')
$phase1SourceFiles | Sort-Object | Set-Content -LiteralPath 'docs\validation\source-file-inventory.txt' -Encoding utf8
$phase1SecretMatches = @($phase1SourceFiles | Select-String -Pattern '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----','ghp_[A-Za-z0-9]{30,}','github_pat_[A-Za-z0-9_]{30,}','sk-proj-[A-Za-z0-9_-]{20,}','AKIA[A-Z0-9]{16}' -ErrorAction Stop)
$phase1EnvFiles = @(Get-ChildItem -LiteralPath '.' -Force -File -Filter '.env*')
$phase1Audit = Get-Content -LiteralPath 'docs\validation\dependency-audit-final.json' -Raw | ConvertFrom-Json
$phase1Inventory = Get-Content -LiteralPath 'docs\validation\dependency-inventory.json' -Raw | ConvertFrom-Json
[pscustomobject]@{GitInitialized=(Test-Path -LiteralPath '.git');SourceFiles=$phase1SourceFiles.Count;SecretPatternMatches=$phase1SecretMatches.Count;EnvironmentFiles=@($phase1EnvFiles.Name);Advisories=$phase1Audit.metadata.vulnerabilities;LicenseCounts=@($phase1Inventory.packages | Group-Object license | Select-Object Name,Count)} | ConvertTo-Json -Depth 8
```

#### scope-audit-02

PASS, exit 0: scanned 68 source file contents, zero configured secret-pattern matches; reported license flags.

```powershell
$phase1SourceFiles = @(Get-Content -LiteralPath 'docs\validation\source-file-inventory.txt')
$phase1SecretMatches = @(Select-String -LiteralPath $phase1SourceFiles -Pattern '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----','ghp_[A-Za-z0-9]{30,}','github_pat_[A-Za-z0-9_]{30,}','sk-proj-[A-Za-z0-9_-]{20,}','AKIA[A-Z0-9]{16}' -ErrorAction Stop)
[pscustomobject]@{Scan='FILE CONTENTS (supersedes earlier filename-only check)';FileCount=$phase1SourceFiles.Count;Matches=$phase1SecretMatches.Count} | ConvertTo-Json
$phase1Inventory = Get-Content -LiteralPath 'docs\validation\dependency-inventory.json' -Raw | ConvertFrom-Json
$phase1Inventory.packages | Where-Object {$_.license -match 'LGPL|MPL|CC-BY'} | Select-Object name,version,license | ConvertTo-Json
```

#### read-final-01

PASS, exit 0; output retained in parent-commands.json.

```powershell
Get-Content -LiteralPath 'apps\web\app\globals.css' -Tail 135
Get-Content -LiteralPath 'docs\validation\web-commands.json' -TotalCount 30
Get-Content -LiteralPath 'docs\validation\core-commands.json' -TotalCount 20
Get-Content -LiteralPath 'docs\validation\fixture-commands.json' -TotalCount 20
```

#### read-final-02

PASS, exit 0; output retained in parent-commands.json.

```powershell
rg -n -A 18 -B 6 'overflow-x: auto|\.navigation|@media \(max-width' apps/web/app/globals.css
```

#### mobile-build-01

PASS, exit 0: final mobile CSS/doc formatting, production rebuild and six HTTP smoke checks. A later logging-wrapper attempt to store an undefined session ID failed after the completed shell result; the command itself succeeded.

```powershell
corepack pnpm exec prettier --write apps/web/app/globals.css docs/dependencies.md
corepack pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
corepack pnpm smoke
```

#### handoff-read-01

PASS, exit 0; output retained in parent-commands.json.

```powershell
Get-Content -LiteralPath '<LOCAL_ATTACHMENT_DIRECTORY>\Pasted text.txt'
```

#### handoff-read-02

PASS, exit 0; output retained in parent-commands.json.

```powershell
Get-Content -LiteralPath 'docs\dependencies.md'; Get-Content -LiteralPath 'docs\validation\source-file-inventory.txt'; Get-Content -LiteralPath 'package.json'
```

#### handoff-read-03

PASS, exit 0; output retained in parent-commands.json.

```powershell
Get-Content -LiteralPath 'docs\phase-gates.md'; Get-Content -LiteralPath 'docs\validation\core-commands.json'; Get-ChildItem -LiteralPath 'docs\validation' -File | Select-Object Name,Length
```

#### handoff-read-04

PASS, exit 0; output retained in parent-commands.json.

```powershell
$phase1Logs = @{}; foreach ($phase1LogName in @('core-commands','fixture-commands','web-commands')) { $phase1Logs[$phase1LogName] = Get-Content -LiteralPath ('docs/validation/' + $phase1LogName + '.json') -Raw | ConvertFrom-Json }; $phase1Logs | ConvertTo-Json -Depth 50
```

#### report-inputs-01

PASS, exit 0; output retained in parent-commands.json.

```powershell
Get-Content -LiteralPath 'docs\validation\source-file-inventory.txt' -Raw; Get-Content -LiteralPath 'examples\fixtures\mercurypay\fixture-manifest.json' -Raw; Get-Content -LiteralPath 'docs\supported-scope.md' -Raw; Get-Content -LiteralPath '.prettierignore' -Raw
```

#### tool-docs-01-recovered

PASS — read-only documentation extraction/read. Exact launcher command recovered from this chat's execution history; retained output is truncated.

```text
"<USER_HOME>\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command "Get-Content -LiteralPath '<USER_HOME>\\.codex\\plugins\\cache\\openai-bundled\\computer-use\\26.1007.21434\\skills\\computer-use\\SKILL.md' -Raw"
```

#### preflight-04-recovered

PASS — read-only documentation extraction/read. Exact launcher command recovered from this chat's execution history; retained output is truncated.

```text
"<USER_HOME>\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe" -Command '$phase1ReviewZip = [System.IO.Compression.ZipFile]::OpenRead('"'<USER_HOME>\\Downloads\\DriftReplay_Phase_0_Review_and_Phase_1_Prompt.docx')
try {
 "'$phase1ReviewStream = $phase1ReviewZip.GetEntry('"'word/document.xml').Open()
 "'$phase1ReviewSettings = [System.Xml.XmlReaderSettings]::new()
 $phase1ReviewSettings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
 $phase1ReviewReader = [System.Xml.XmlReader]::Create($phase1ReviewStream,$phase1ReviewSettings)
 $phase1ReviewXml = [System.Xml.XmlDocument]::new()
 $phase1ReviewXml.Load($phase1ReviewReader)
 $phase1ReviewNs = [System.Xml.XmlNamespaceManager]::new($phase1ReviewXml.NameTable)
 $phase1ReviewNs.AddNamespace('"'w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
 "'$phase1ReviewXml.SelectNodes('"'//w:body//w:p',"'$phase1ReviewNs) | ForEach-Object { ($_.SelectNodes('"'.//w:t',"'$phase1ReviewNs) | ForEach-Object {$_.InnerText}) -join '"'' }
 "'$phase1ReviewReader.Dispose()
 $phase1ReviewStream.Dispose()
} finally {$phase1ReviewZip.Dispose()}'
```

#### fixture-commands / F01

PASS, exit 0. PASS

```powershell
Get-Content -Raw '<LOCAL_ATTACHMENT_DIRECTORY>\Pasted text.txt'
```

#### fixture-commands / F02

PASS, exit 0. PASS

```powershell
corepack pnpm exec prettier --write "examples/fixtures/mercurypay/contracts/*.json" "examples/fixtures/mercurypay/provider-mocks/*.json" "examples/fixtures/mercurypay/business-cases/*.json" "examples/fixtures/mercurypay/migration-ground-truth/*.json" "examples/fixtures/mercurypay/validation.ts" "examples/fixtures/mercurypay/README.md" "apps/demo-shop/src/*.ts" "tests/fixtures/*.ts"
```

#### fixture-commands / F03

PASS, exit 0. PASS

```powershell
@'
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve('examples/fixtures/mercurypay');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const artifact = (id, path) => ({id, path, sha256: hash(readFileSync(resolve(root, path)))});
const contracts = {v1: artifact('mercurypay-synthetic-contract-v1', 'contracts/v1.openapi.json'), v2: artifact('mercurypay-synthetic-contract-v2', 'contracts/v2.openapi.json')};
const mocks = {v1: artifact('mercurypay-synthetic-s1', 'provider-mocks/v1.json'), v2: artifact('mercurypay-synthetic-s2', 'provider-mocks/v2.json')};
const businessCase = artifact('synthetic-checkout-001', 'business-cases/checkout.json');
const assertions = artifact('synthetic-checkout-oracle', 'business-cases/assertions.json');
const migrationMapping = artifact('synthetic-migration-map', 'migration-ground-truth/mapping.json');
const refs = [...Object.values(contracts), ...Object.values(mocks), businessCase, assertions, migrationMapping];
const manifest = {
 schemaVersion:'1', fixtureId:'mercurypay-synthetic-checkout', synthetic:true, provenance:'curated-synthetic-ground-truth', description:'MercuryPay is synthetic. These are curated foundation artifacts; no replay or verified repair has occurred.', money:{unit:'minor', currency:'USD'}, contracts, mocks, businessCase, assertions, migrationMapping,
 assertionIds:['checkout.succeeded','checkout.transaction-identity','checkout.amount-preserved','checkout.currency-preserved','checkout.customer-preserved'],
 treeDigest:hash([...refs].sort((a,b)=>a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(ref=>`${ref.path}:${ref.sha256}\n`).join('')),
 digestPolicy:'sha256-raw-bytes;tree=sha256(sorted-path:sha256\\n)',
 testPolicy:{phase:'foundation-only',execution:'not-started',immutableInputs:refs.map(ref=>ref.path),patchAllowedPaths:['apps/demo-shop/src/v1-adapter.ts']},
 phase4RequiredPins:['harness','runtime','dependencies','networkPolicy']
};
writeFileSync(resolve(root, 'fixture-manifest.json'), JSON.stringify(manifest,null,2)+'\n', 'utf8');
console.log(JSON.stringify({treeDigest:manifest.treeDigest, artifacts:refs},null,2));
'@ | node --input-type=module
```

#### fixture-commands / F04

FAIL, exit 1. FAIL

```powershell
corepack pnpm test:fixtures
```

#### fixture-commands / F05

FAIL, exit 1. FAIL

```powershell
node node_modules/vitest/vitest.mjs run tests/fixtures
```

#### fixture-commands / F06

PASS, exit 0. PASS

```powershell
node node_modules/vitest/vitest.mjs run tests/fixtures
```

#### fixture-commands / F07

FAIL, exit 1. FAIL

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.checks.json
```

#### fixture-commands / F08

PASS, exit 0. PASS

```powershell
Get-Content -Raw package.json; rg --files -g 'tsconfig*.json' -g '!node_modules' -g '!apps/web/.next'
```

#### fixture-commands / F09

PASS, exit 0. PASS

```powershell
corepack pnpm test:fixtures
```

#### fixture-commands / F10

PASS, exit 0. PASS

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.tests.json
```

#### fixture-commands / F11

PASS, exit 0. PASS

```powershell
node node_modules/typescript/bin/tsc --noEmit -p examples/fixtures/mercurypay/tsconfig.json
```

#### fixture-commands / F12

PASS, exit 0. PASS

```powershell
node node_modules/typescript/bin/tsc --noEmit -p apps/demo-shop/tsconfig.json
```

#### fixture-commands / F13

PASS, exit 0. PASS

```powershell
node node_modules/prettier/bin/prettier.cjs --write examples/fixtures/mercurypay/validation.ts examples/fixtures/mercurypay/fixture-manifest.json tests/fixtures/mercurypay.test.ts
```

#### fixture-commands / F14

FAIL, exit 1. FAIL

```powershell
node node_modules/eslint/bin/eslint.js examples/fixtures/mercurypay/validation.ts apps/demo-shop/src tests/fixtures --max-warnings 0
```

#### fixture-commands / F15

PASS, exit 0. PASS

```powershell
node node_modules/eslint/bin/eslint.js examples/fixtures/mercurypay/validation.ts apps/demo-shop/src tests/fixtures --max-warnings 0
```

#### fixture-commands / F16

PASS, exit 0. PASS

```powershell
corepack pnpm test:fixtures
```

#### fixture-commands / F17

FAIL, exit 1. FAIL

```powershell
node node_modules/prettier/bin/prettier.cjs --check examples/fixtures/mercurypay apps/demo-shop/src tests/fixtures
```

#### core-commands / 1

PASS, exit 0. Read-only: root had no displayed entries at time of inspection; read complete user-pasted Phase 1 authorization. No writes.

```powershell
Get-ChildItem -Force; Get-Content -LiteralPath '<LOCAL_ATTACHMENT_DIRECTORY>\Pasted text.txt'
```

#### core-commands / 2

PASS, exit 0. Vitest 5.0.3: 3 files passed, 37 tests passed; 2.80 seconds. pnpm reported lockfile up to date.

```powershell
corepack pnpm exec vitest run packages/core
```

#### core-commands / 3

PASS, exit 0. TypeScript tsc --noEmit passed. pnpm reported lockfile up to date.

```powershell
corepack pnpm --filter @driftreplay/core typecheck
```

#### core-commands / 4

PASS, exit 0. Formatted the seven authored core source/test files. Before formatting, pnpm auto-installed the parent's concurrently updated root dependencies: +31/-193 packages; @eslint/js 10.0.1, @next/eslint-plugin-next 16.4.0, eslint 10.12.0, globals 17.13.0, typescript-eslint 8.71.1. It removed eslint 9.39.4 and eslint-config-next 16.4.0. This unintended subagent install/network side effect was immediately disclosed to parent; no dependency build scripts appeared in output. Remaining subagent checks use local binaries directly.

```powershell
corepack pnpm exec prettier --write packages/core/src docs/validation/core-commands.json
```

#### core-commands / 5

PASS, exit 0. Vitest 5.0.3: 3 files passed, 40 tests passed; 392ms. Includes immutability and Windows path-negative cases.

```powershell
.\node_modules\.bin\vitest.cmd run packages/core
```

#### core-commands / 6

PASS, exit 0. Strict core TypeScript check passed with no diagnostics.

```powershell
.\node_modules\.bin\tsc.cmd --noEmit --project packages/core/tsconfig.json
```

#### core-commands / 7

FAIL, exit 1. One no-control-regex error in the artifact path validation regex. Fixed underlying implementation by checking control character code points without a control-character regex; no rule suppressed.

```powershell
.\node_modules\.bin\eslint.cmd packages/core/src
```

#### core-commands / 8

PASS, exit 0. Read-only inspection of current lint configuration and parent-owned core package settings while waiting for lint. Confirmed expected public exports and strict TypeScript project.

```powershell
Get-Content -LiteralPath eslint.config.mjs; Get-Content -LiteralPath packages/core/package.json; Get-Content -LiteralPath packages/core/tsconfig.json
```

#### core-commands / 9

PASS, exit 0. Formatted the corrected path validator (111ms); used local binary to avoid implicit pnpm installation.

```powershell
.\node_modules\.bin\prettier.cmd --write packages/core/src/schemas.ts
```

#### core-commands / 10

PASS, exit 0. Final Vitest 5.0.3 focused check: 3 files passed, 40 tests passed; 346ms. No replay or runtime-provider tests.

```powershell
.\node_modules\.bin\vitest.cmd run packages/core
```

#### core-commands / 11

PASS, exit 0. Final strict TypeScript core check passed with no diagnostics.

```powershell
.\node_modules\.bin\tsc.cmd --noEmit --project packages/core/tsconfig.json
```

#### core-commands / 12

PASS, exit 0. Final core lint passed with no diagnostics after fixing the no-control-regex failure.

```powershell
.\node_modules\.bin\eslint.cmd packages/core/src
```

#### core-commands / independent review 1

PASS, exit 0. Read-only inventory and review of root dependency policy and CI. No execution of project helpers.

```powershell
rg --files .github scripts apps/web examples tests -g '!node_modules' -g '!.next' -g '!tsconfig.tsbuildinfo'; Get-Content -LiteralPath pnpm-workspace.yaml; Get-Content -LiteralPath package.json; Get-Content -LiteralPath .github/workflows/ci.yml
```

#### core-commands / independent review 2

PASS, exit 0. Read-only numbered review of authored scripts, static configuration, and fixed fixture loader/validator.

```powershell
$reviewPaths = @('scripts/next.mjs','scripts/preview.mjs','scripts/smoke.mjs','scripts/dependency-inventory.mjs','apps/web/next.config.mjs','apps/web/package.json','apps/web/components/fixture-data.ts','examples/fixtures/mercurypay/validation.ts'); foreach ($reviewPath in $reviewPaths) { Write-Output "FILE: $reviewPath"; $reviewLine = 0; Get-Content -LiteralPath $reviewPath | ForEach-Object { $reviewLine++; '{0,4}: {1}' -f $reviewLine, $_ } }
```

#### core-commands / independent review 3

PASS, exit 0. Read-only numbered review of all page claims and common UI rendering/navigation.

```powershell
$reviewPaths = @('apps/web/app/page.tsx','apps/web/app/fixtures/mercurypay/page.tsx','apps/web/app/evidence/page.tsx','apps/web/app/status/page.tsx','apps/web/app/layout.tsx','apps/web/components/ui.tsx','apps/web/components/navigation.tsx','apps/web/app/error.tsx','apps/web/app/not-found.tsx'); foreach ($reviewPath in $reviewPaths) { Write-Output "FILE: $reviewPath"; $reviewLine = 0; Get-Content -LiteralPath $reviewPath | ForEach-Object { $reviewLine++; '{0,4}: {1}' -f $reviewLine, $_ } }
```

#### core-commands / independent review 4

PASS, exit 0. Read-only pattern check and documentation read. The initial exclusion patterns did not exclude nested generated out files, producing truncated generated-bundle output. The next command narrowed the search to authored directories.

```powershell
rg -n 'fetch\(|https?://|eval\(|new Function|dangerouslySetInnerHTML|child_process|process\.env|require\(|import\(' apps/web scripts examples/fixtures/mercurypay -g '!next-env.d.ts' -g '!tsconfig.tsbuildinfo' -g '!out/**' -g '!.next/**'; Get-Content -LiteralPath docs/security-boundaries.md; Get-Content -LiteralPath docs/supported-scope.md; Get-Content -LiteralPath docs/validation/core-commands.json
```

#### core-commands / independent review 5

PASS, exit 0. Read-only authored-source check. Network references were local smoke/preview URLs or non-contacted .invalid fixture metadata. No active external app fetch or unsafe HTML rendering found. Environment example contains only comments.

```powershell
rg -n 'fetch\(|https?://|eval\(|new Function|dangerouslySetInnerHTML|child_process|process\.env|require\(' apps/web/app apps/web/components scripts examples/fixtures/mercurypay -g '*.ts' -g '*.tsx' -g '*.mjs' -g '*.css' -g '*.json'; Get-Content -LiteralPath .env.example; Get-Content -LiteralPath .gitignore
```

#### web-commands / 1

PASS, exit 0. See raw ledger for output.

```powershell
Get-ChildItem -Force; if (Test-Path -LiteralPath 'apps/web') { Get-ChildItem -LiteralPath 'apps/web' -Force }; if (Test-Path -LiteralPath 'AGENTS.md') { Get-Content -LiteralPath 'AGENTS.md' }
```

#### closeout-format-01

PASS, exit 0: report formatting and workspace format check passed. Seven reported artifact hashes matched actual bytes; the lockfile hash matched; 69 final source files had zero configured secret-pattern matches; no Git repository was initialized.

```powershell
corepack pnpm exec prettier --write PHASE_1_REPORT.md docs/dependencies.md
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
corepack pnpm format:check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$phase1FinalFiles = @(rg --files --hidden -g '!node_modules/**' -g '!**/node_modules/**' -g '!**/.next/**' -g '!**/out/**' -g '!**/*.tsbuildinfo' -g '!docs/validation/**')
$phase1FinalFiles | Sort-Object | Set-Content -LiteralPath 'docs/validation/source-file-inventory.txt' -Encoding utf8
$phase1FinalReport = Get-Content -LiteralPath 'PHASE_1_REPORT.md' -Raw
$phase1FinalManifest = Get-Content -LiteralPath 'examples/fixtures/mercurypay/fixture-manifest.json' -Raw | ConvertFrom-Json
$phase1FinalLockHash = (Get-FileHash -LiteralPath 'pnpm-lock.yaml' -Algorithm SHA256).Hash.ToLowerInvariant()
$phase1FinalRefs = @($phase1FinalManifest.contracts.v1,$phase1FinalManifest.contracts.v2,$phase1FinalManifest.mocks.v1,$phase1FinalManifest.mocks.v2,$phase1FinalManifest.businessCase,$phase1FinalManifest.assertions,$phase1FinalManifest.migrationMapping)
foreach ($phase1FinalRef in $phase1FinalRefs) { $phase1ActualHash = (Get-FileHash -LiteralPath ('examples/fixtures/mercurypay/' + $phase1FinalRef.path) -Algorithm SHA256).Hash.ToLowerInvariant(); if ($phase1ActualHash -ne $phase1FinalRef.sha256 -or -not $phase1FinalReport.Contains($phase1ActualHash)) { throw ('Report/artifact digest mismatch: ' + $phase1FinalRef.path) } }
if (-not $phase1FinalReport.Contains($phase1FinalLockHash) -or -not $phase1FinalReport.Contains($phase1FinalManifest.treeDigest)) { throw 'Report digest missing' }
$phase1FinalSecretMatches = @(Select-String -LiteralPath $phase1FinalFiles -Pattern '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----','ghp_[A-Za-z0-9]{30,}','github_pat_[A-Za-z0-9_]{30,}','sk-proj-[A-Za-z0-9_-]{20,}','AKIA[A-Z0-9]{16}' -ErrorAction Stop)
[pscustomobject]@{SourceFiles=$phase1FinalFiles.Count;ReportedArtifactHashesMatched=$phase1FinalRefs.Count;LockHash=$phase1FinalLockHash;SecretPatternMatches=$phase1FinalSecretMatches.Count;GitInitialized=(Test-Path -LiteralPath '.git')} | ConvertTo-Json
if ($phase1FinalSecretMatches.Count -gt 0 -or (Test-Path -LiteralPath '.git')) { exit 1 }
```

#### closeout-copy-read

PASS, exit 0: inspected the overview retirement attribution before correcting its wording.

```powershell
rg -n -A 4 -B 4 'retires' apps/web/app/page.tsx
```

#### final-attribution-gate

PASS, final exit 0: complete gate after the final overview wording correction. Typecheck, lint, formatting, 77 tests, 37 fixture tests, production build and six HTTP smoke checks all passed.

```powershell
corepack pnpm exec prettier --write apps/web/app/page.tsx PHASE_1_REPORT.md
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
corepack pnpm check
```

## H. SECURITY & PRIVACY

CI declares `contents: read`, uses only `push`/`pull_request`, disables persisted checkout credentials, and has no `pull_request_target`, secret use, write permissions, deploy step or cloud configuration. Checkout v7.0.1 is pinned to `3d3c42e5aac5ba805825da76410c181273ba90b1`; setup-node v7.0.0 to `820762786026740c76f36085b0efc47a31fe5020`. Official release/definition HTML was consulted; these actions have **not** executed remotely.

Authored scripts spawn only reviewed local tooling, bind preview/smoke to loopback, constrain static paths and allow only GET/HEAD. Smoke uses an ephemeral listener and closes it. The Next launcher disables framework telemetry in its child environment only; machine-wide settings were not changed. No application analytics, external assets, model SDKs or active external data fetches are present.

Only `.env.example` exists at the project root and contains comments. A content scan over 68 implementation/configuration/docs files found zero matches for the selected private-key/GitHub/OpenAI/AWS token patterns. This is not a complete secret detector and excludes installed/generated dependencies and raw command ledgers.

No repository code was downloaded or executed as product input. Fixture paths are fixed, data is parsed as JSON and rendered as text, and no remote references are resolved. These reduce current exposure; they do not prove future SSRF, prompt-injection, tenant isolation, webhook, token, runner or cost controls. [Security boundaries](docs/security-boundaries.md) names those future requirements.

## I. TECHNICAL DEBT

| Gap                                                                  | Severity / required boundary                                   | Resolution phase                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| No general supported-semantics diff/ingestion/AST engine             | High if marketed as active capability; clearly absent now      | Phase 2                                 |
| No authentic execution attestations or regression attribution        | High before any reproduced/verified claim                      | Phase 4                                 |
| Oracle needs customer observation channel and immutable harness pins | High before replay                                             | Phase 4                                 |
| No tenant auth, secret broker, revocation or webhook controls        | Critical before private-repository onboarding                  | Phase 6                                 |
| No isolated hostile-code runner or verified patch workflow           | Critical before running fetched/candidate code                 | Phases 4/7/8                            |
| Project/transitive redistribution license review unfinished          | Medium; no publication authorized                              | Before Phase 9                          |
| No independent all-dialect OpenAPI validation                        | Medium; restricted fixture subset is explicit                  | Phase 2 adapter evaluation              |
| No Next/React/accessibility lint plugins                             | Medium; avoided incompatible/advisory-bearing dependency chain | Re-evaluate in Phase 2/5                |
| Accessibility/light-theme/cross-browser review incomplete            | Medium before public UI                                        | Phase 5                                 |
| Windows-only local validation; CI never run remotely                 | Medium before remote CI claim                                  | Later authorized Git/CI boundary        |
| pnpm pre-command verification disabled due observed bug              | Low with explicit frozen install gate                          | Re-evaluate supported toolchain release |

No unresolved issue blocks this bounded local Phase 1. None of the deferred security capabilities is implemented or represented as operational.

## J. PHASE 2 DEPENDENCY GATE

Recommendation: review and explicitly authorize a separate local deterministic-analysis phase. Keep models, GitHub access, replay, cloud and publication disabled.

Before code changes, Phase 2 should approve a written support matrix and golden outcomes for OpenAPI 3.0.3 JSON; evaluate/pin a deterministic diff adapter; define immutable snapshot identity, input-size/time/reference limits and malformed/unsupported results; and constrain TypeScript matching to inspectable literal calls. Curated correspondence must remain separate from discovered structural differences. Define exact byte/path/line citations and ambiguity handling.

Acceptance evidence should include breaking/nonbreaking golden deltas, an unused removed route, missing/unsupported semantics, forged provenance, unsafe reference paths, dynamic URL/opaque wrapper unknowns, and exact citations against pinned source. Source ingestion should begin with local approved data; any network allowlist/SSRF boundary requires explicit design and negative tests before activation.

No `oasdiff`, AST library, fetch adapter, workflow, source integration or Phase 2 code was added. Three-variant proof stays in Phase 4 with an independently reviewed reference repair and unchanged business oracle. The broader [phase map](docs/phase-gates.md) preserves separate authorizations.

## K. FINAL STATUS LINE

PHASE 1 COMPLETE — LOCAL FOUNDATION ONLY — NO GIT/CLOUD/AGENT EXECUTION — AWAITING PHASE 2 REVIEW
