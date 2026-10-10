# DriftReplay development and publication rules

These permanent repository instructions apply to all agents and contributors. The owner explicitly
authorized initial publication of the completed Phase 1 foundation. Historical Phase 1 documents
record the earlier local-only authorization; they do not override the publishing workflow below.
Finishing or publishing a phase never authorizes implementation of the next phase.

## Phase scope and branches

- Work only on an explicitly authorized development phase. Do not infer permission from a phase map.
- Publish Phase 1 to `main` only if the remote repository is still empty.
- From Phase 2 onward, use one separate `phase/NN-description` branch per phase, for example
  `phase/02-deterministic-analysis`. Push the phase branch at completion and keep `main` stable
  until human review and separate merge authorization.
- If a phase is incomplete but its files are safe to publish, use a clearly labeled
  `wip/phase-NN-description` branch and report PARTIAL or BLOCKED. Never label incomplete work complete.

## Required phase completion workflow

At the end of every explicitly authorized development phase:

1. Inspect the complete project, current branch, working tree, origin and remote history. Preserve
   unrelated user changes. The authorized origin is `https://github.com/arslanabdulghaffar/DriftReplay.git`.
2. Run the phase's required validation and security checks. For the foundation, run
   `corepack pnpm check`: strict TypeScript, lint, formatting, unit tests, fixture tests,
   production build and local HTTP smoke checks. Add meaningful checks required by later phases.
3. Audit every file proposed for publication for credentials, secrets, private data, unsafe
   content and accidentally included binaries. Review the staged diff and `.gitignore`.
   Keep dependencies, generated builds, caches, real environment files, credentials and local
   raw evidence/backups out of Git. The comments-only `.env.example` may be published.
4. Prepare the phase completion report with the branch name, full commit SHA, GitHub URL,
   changed-file inventory, actual validation results, security findings and a GO/NO-GO
   recommendation. Never invent passed tests, integrations, replay results or CI outcomes.
5. Commit the completed, reviewed changes and push normally to the authorized phase branch.
   Record the resulting commit SHA/URL in a subsequent report/receipt commit when necessary:
   a file cannot contain the hash of the commit that contains that same file. Identify the
   implementation commit and final publication HEAD separately; never amend to chase a self-hash.
6. Verify remote SHA equality, intended files and reports, and a clean working tree. Check GitHub
   Actions when available and report its actual status; pending or inaccessible is not success.

If secrets, unsafe content, authorization problems or conflicting remote history are discovered,
stop instead of pushing and report the specific blocker. Do not silently bypass a failing gate.

Never force-push, rewrite history, automatically merge, deploy, or publish a release without
separate authorization. Do not broaden credentials, repository permissions or cloud resources
as a workaround for a blocked push.

## Current engineering boundary

Phase 1 is a synthetic, model-off local foundation. No replay, agents, repair, GitHub App,
provider monitoring or production security capability may be represented as implemented.
MercuryPay is synthetic. Protect its fixed business input and oracle; do not change tests
or fixture assertions merely to obtain a passing result.

Use the pinned toolchain and lockfile. Run `corepack pnpm`, because the bare `pnpm` wrapper
may use a different Node runtime. Dependency lifecycle scripts remain disabled; do not enable
all builds or install unreviewed tooling. Keep all project changes within this workspace.

See [development workflow](docs/development-workflow.md) for the operational checklist.
