# DriftReplay

Inspect a synthetic API migration and the evidence a future investigation must produce.

**Phase 1 local foundation. MercuryPay is fictional and explicitly synthetic.**
This project currently provides a static fixture explorer, versioned evidence schemas,
static fixture validation, and an unmigrated checkout request adapter. It does not monitor
providers, scan GitHub, run agents, reproduce regressions, generate patches, or verify repairs.

## Quickstart

Use the already installed **Node 24.21.0**, **Corepack 0.36.0**, and **pnpm 11.25.0**.
Do not run an installer or change global shims to use this workspace. If those prerequisites
are unavailable, install/setup is a separate owner decision. The package manager is pinned.

```powershell
Set-Location A:\DriftReplay
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm check
corepack pnpm preview
```

Open `http://127.0.0.1:4173` after the production build, or use `corepack pnpm dev` for
local development on `127.0.0.1:3000`. Stop either server with Ctrl+C. No key, account,
database, container, or production provider is required. Use `corepack pnpm` consistently:
this machine's bare `pnpm` wrapper selects a different bundled Node version.

Available pages: overview `/`, fixture explorer `/fixtures/mercurypay`, evidence policy
`/evidence`, and current boundaries `/status`. All data is bundled from local workspace
imports; the static export is suitable for a later reviewed deployment. No deployment
has been authorized or performed.

## What the fixture contains

MercuryPay v1 defines `POST /v1/charges` with `customer_email`. v2 defines
`POST /v2/payments` with required `customer.email`. The v2 behavior reference explicitly
retires the old route; merely publishing a new real API version would not establish that.
A curated mapping supplies the correspondence. A removed and added path does not prove a rename.

The business case stays `shopper@example.invalid`, **2599 USD minor units** (25.99 USD).
The consumer constructs the original v1 wire request without networking. Its business input
and expected success assertions are separate from that adapter. Provider mocks are data,
not executable servers. Runtime replay is **NOT RUN** and deliberately belongs to Phase 4.

The manifest records actual raw-byte SHA-256 values for seven artifacts. Tests recompute
them without rewriting them. Its tree digest is SHA-256 over lexically sorted
`path:sha256` records, each terminated by LF. The manifest itself is excluded to avoid
self-reference. See the fixture README for details. These digests establish byte identity,
not provider authenticity or execution results. No Git SHA is fabricated.

## Local commands

| Command after `corepack pnpm` | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `typecheck`                   | Strict checks across every workspace and root tests  |
| `lint`                        | Current ESLint and TypeScript rules                  |
| `format:check`                | Formatting consistency                               |
| `test`                        | Core, adapter, and static fixture tests              |
| `test:fixtures`               | Explicit fixture and deliberate-negative gate        |
| `build`                       | Next.js production static export                     |
| `smoke`                       | Temporary loopback HTTP checks; shuts down afterward |
| `check`                       | All gates above in order                             |
| `preview`                     | Loopback-only static preview of the build            |

Formatting hashed fixture files changes their identities. Review intentional fixture edits,
then recalculate the manifest as an explicit fixture-authoring action. Never update digests
inside validation tests to make them pass.

## Workspace

- `apps/web`: static dashboard foundation, with local styles and system fonts.
- `apps/demo-shop`: pure v1 request adapter and independent business types.
- `packages/core`: Zod schemas, admission guard, and separately exported Node digest utilities.
- `examples/fixtures/mercurypay`: JSON artifacts plus fixture-specific validation.
- `tests/fixtures`: negative and positive static invariants.
- `scripts`: authored local build wrapper, preview/smoke, and dependency inventory helpers.

The fixture folder is a private workspace package so both the app and tests consume real
JSON through `@driftreplay/fixtures` exports. No future-service packages are scaffolded.

## Boundaries and next steps

Read [supported scope](docs/supported-scope.md), [security boundaries](docs/security-boundaries.md),
[foundation ADR](docs/adr/0001-foundation.md), [phase gates](docs/phase-gates.md), and
[dependency decisions](docs/dependencies.md). Actual validation and limitations are in
[the Phase 1 report](PHASE_1_REPORT.md).

The eventual product hypothesis is a reviewable chain from pinned upstream change to
consumer usage, an attributable failure, and a bounded verified repair. Those capabilities
are future work. A synthetic demonstration cannot establish adoption or real-provider fidelity.

The local CI definition has read-only permissions and immutable action references. It has
not run on GitHub. The project is not a Git repository. License selection remains unresolved
pending an owner decision and dependency review; no open-source license grant is asserted yet.
