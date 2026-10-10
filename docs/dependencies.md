# Toolchain and dependency decisions

Reviewed on 2026-10-10 using official documentation and npm package metadata. Installation is
not a security audit. Exact transitive identities and integrity values are in `pnpm-lock.yaml`.

| Component                | Pin     | Reason / declared license                                     |
| ------------------------ | ------- | ------------------------------------------------------------- |
| Node                     | 24.21.0 | Installed LTS runtime; not installed or upgraded by this task |
| Corepack                 | 0.36.0  | Installed launcher; no global shim changes                    |
| pnpm                     | 11.25.0 | Exact packageManager pin; Node >=22.13 declared               |
| Next.js                  | 16.4.0  | App Router/static export; MIT                                 |
| React / React DOM        | 19.3.0  | Compatible exact pair; MIT                                    |
| TypeScript               | 5.9.3   | Compatible with current TypeScript ESLint range; Apache-2.0   |
| Zod                      | 4.6.5   | Runtime schemas; MIT                                          |
| Vitest                   | 5.0.3   | Lean Node test runner; MIT                                    |
| Vite                     | 8.3.4   | Explicit compatible Vitest peer; MIT                          |
| ESLint                   | 10.12.0 | Supported current lint release; MIT                           |
| @eslint/js               | 10.0.1  | Base lint rules; MIT                                          |
| typescript-eslint        | 8.71.1  | TS lint integration; MIT                                      |
| globals                  | 17.13.0 | Node/browser lint environment; MIT                            |
| Prettier                 | 3.9.9   | Exact formatter; MIT                                          |
| @types/node              | 24.10.0 | Node 24 type definitions; MIT                                 |
| @types/react / react-dom | 19.3.0  | React types; MIT                                              |

No UI component library, agent framework, database client, provider SDK, browser automation
runner, container SDK, or OpenAPI diff binary is installed. Native platform packages are supplied
as dependency artifacts; no dependency lifecycle script has been approved.

## Installation decisions and observed caveats

The first bare `pnpm install` refused the root engine constraint because the app-bundled wrapper
uses Node 24.19.0. The installed `corepack pnpm` uses system Node 24.21.0 and is the documented
launcher. The failed attempt did not justify upgrading a system runtime.

Initial ESLint 9 was rejected after its installation warning identified end of support. The
standard Next lint bundle has plugins whose declared peers exclude ESLint 10. The final lint
configuration uses ESLint 10 and TypeScript ESLint directly. An optional Next-specific plugin
was subsequently removed because the registry advisory check reported an unpatched high-severity
`braces` issue in its development dependency chain. This reduces framework/accessibility lint
coverage; semantic review and actual rendering supplement the available lint rules. No peer
compatibility check was bypassed.

pnpm 11 defaults to installing dependencies before commands. An agent's formatting command
triggered this while a reviewed manifest update was pending. The command ledger records it.
Setting `verifyDepsBeforeRun: error` then exposed `opts3.currentPnpmfiles is not iterable`.
The final documented setting is `false`: commands cannot implicitly install, and explicit
frozen installations check reproducibility. `--ignore-scripts`, empty `allowBuilds`, strict
build policy, disabled side-effect cache, and ignored pnpm hook files remain explicit.

`docs/validation/dependency-inventory.json` records reachable installed package license metadata,
not stale store contents. `dependency-audit.json` preserves the original advisory;
`dependency-audit-final.json` records the final registry check. No zero-risk claim follows from
a zero-advisory result. Project license selection and redistribution review remain unresolved.

Material transitive license flags in the installed Windows tree: `@img/sharp-win32-x64@0.35.5`
declares `Apache-2.0 AND LGPL-3.0-or-later`; `lightningcss@1.33.0` and its Windows binary declare
`MPL-2.0`; `caniuse-lite@1.0.30001815` declares `CC-BY-4.0`. These metadata flags require review
before redistribution. They do not imply that all project code has those licenses. No legal
compatibility conclusion or project license choice is made in Phase 1.

## Official sources consulted

- [Next installation requirements](https://nextjs.org/docs/app/getting-started/installation)
- [Node release support](https://nodejs.org/en/about/previous-releases)
- [TypeScript 5.9](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html)
- [Vitest setup](https://vitest.dev/guide/)
- [Zod requirements](https://zod.dev/)
- [ESLint setup](https://eslint.org/docs/latest/use/getting-started)
- [Prettier installation](https://prettier.io/docs/install)
- [pnpm build settings](https://pnpm.io/settings/build)
- [Corepack](https://github.com/nodejs/corepack)
- [Checkout v7.0.1 release](https://github.com/actions/checkout/releases/tag/v7.0.1)
- [Pinned checkout definition](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/action.yml)
- [Setup-node v7.0.0 release](https://github.com/actions/setup-node/releases/tag/v7.0.0)
- [Pinned setup-node definition](https://github.com/actions/setup-node/blob/820762786026740c76f36085b0efc47a31fe5020/action.yml)

Release/action HTML pages were reviewed; no GitHub API call was made and neither action ran.

## Phase 2 additive dependency decision

The preceding section records Phase 1 dependency selection. Phase 1 was subsequently published
with successful hosted Actions; see its publication receipt. Phase 2 adds one private workspace
package, `@driftreplay/analysis@0.2.0`, using the same existing TypeScript **5.9.3** (Apache-2.0)
and Zod **4.6.5** (MIT) pins at runtime. No new external package version, binary, installation
hook or framework is added. Native Node TypeScript stripping runs authored analyzer code;
the compiler API parses captured source as data. The lockfile adds only the workspace importer.

The oasdiff documentation was evaluated, but no binary was installed or executed. There is no
fabricated checksum or release pin for an unused tool. [ADR 0002](adr/0002-deterministic-analysis.md)
records the intentionally reduced comparator choice. Phase 2 actual advisory/inventory results
and remaining project-license decision are recorded in its completion report.
