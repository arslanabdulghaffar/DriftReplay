# Permanent development workflow

The owner authorized initial publication of Phase 1 to
[`arslanabdulghaffar/DriftReplay`](https://github.com/arslanabdulghaffar/DriftReplay).
[Root AGENTS.md](../AGENTS.md) contains the binding phase-end publishing instructions.
This workflow does not authorize Phase 2 or any subsequent implementation phase.

## Branch and authorization policy

| Situation                                                               | Required destination and decision                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Completed Phase 1, remote verified empty                                | Initial normal push to `main`                                        |
| Phase 2 or later, explicitly authorized                                 | Separate `phase/NN-description` branch; push on completion           |
| Incomplete phase, files safe to publish                                 | Clearly labeled `wip/phase-NN-description`; report incomplete status |
| Secrets, unsafe content, authorization issue or remote-history conflict | Stop; do not push                                                    |

Keep `main` stable for human review after initial publication. Never force-push, rewrite history,
automatically merge, deploy or publish a release without separate authorization. Completing,
committing or publishing one phase does not authorize the next phase.

## Before each phase-end commit

Inspect local files, staged changes, branch, `origin` and remote history. Preserve unrelated
work and stop on a conflicting remote instead of resetting or overwriting it. Audit all files
proposed for Git, including documentation and logs. Exclude dependencies, generated builds,
caches, real `.env` files, credentials, private local output and unintended binaries. Preserve
raw local evidence under ignored `.local/` when a publication copy needs metadata redaction;
state what was redacted without inventing or changing validation outcomes.

Use exact pinned dependencies and the committed lockfile. Required Phase 1 gate:

```powershell
corepack pnpm check
```

This runs strict TypeScript, ESLint, formatting, unit tests, explicit fixture tests, production
build and six local smoke checks. Record commands, counts, failures and fixes. Later phases
must add their authorized acceptance and negative-security checks. Registry advisories and
pattern scans are bounded evidence, not proof that software contains no vulnerabilities or secrets.

## Report and publication

Every explicitly authorized development phase ends with validation/security review, a completion
report, a meaningful commit and a normal push. Each report must contain:

- Phase and COMPLETE/PARTIAL/BLOCKED status, with GO/NO-GO recommendation.
- Branch, full implementation commit SHA and GitHub commit URL.
- Changed files, actual validation results and known limitations.
- Security findings, exclusions/redactions and unresolved blockers.
- Remote verification, CI status and final working-tree status.

Prepare the report before committing. Then record the actual implementation SHA/URL in a small
subsequent receipt/report commit and push it normally. This avoids an impossible self-referencing
commit hash. The receipt identifies the implementation commit it verifies; the final handoff
also supplies the final HEAD SHA and URL. Never amend/rewrite history for report bookkeeping.

Verify that the remote branch SHA equals local HEAD and inspect the remote tree for intended
source files, fixtures, lockfile, reports and AGENTS.md. Check available GitHub Actions results
for the pushed commit. Report queued, running, failed, skipped or inaccessible states honestly.
Do not interpret an empty list of checks as CI success.

Current initial-publication evidence is recorded in [the publication report](phase-1-publication.md).
