# Phase 1 security boundaries

Only project-authored code and explicitly pinned build/test dependencies execute. There is
no repository ingestion, URL fetch API, remote code execution, payment invocation, authentication,
tenant store, GitHub integration, cloud service, or model connection. This is a scope statement,
not a claim of production security.

## Local data and execution

- Fixture loaders read a fixed set of local artifact names, not manifest-supplied arbitrary paths.
- Unknown input is validated at schema boundaries. Artifact paths reject traversal and unsafe Windows forms.
- JSON/source excerpts render as text through React. They are not HTML or instructions.
- The demo adapter constructs data only. The `.invalid` hostname is documentation, never contacted.
- Dependency install scripts are disabled. `allowBuilds` is empty, strict policy remains enabled,
  and automatic dependency installation before commands is disabled. No global build approval exists.
- Next telemetry is disabled only in its child process. No system environment or PATH was changed.
- Local dev/preview bind to loopback. Static preview serves only the authored build output.
- No real `.env` file or service key is required. `.env.example` contains comments only.

## CI definition

The local YAML grants only `contents: read`. It contains no secret references, deployment,
publication, write permission, or privileged `pull_request_target` trigger. Checkout credentials
are not persisted; submodules and package-manager caching are disabled. Actions use verified
immutable commits. CI itself has not executed remotely.

Future CI runs execute repository code in the CI environment, so this configuration does not
authorize a hosted arbitrary-repository runner. Do not add privileged credentials to untrusted
PR runs or execute fork code through privileged event types.

## Threat assumptions and deferred controls

Prompt injection has no model tool boundary to cross in Phase 1. SSRF, tenant authorization,
webhook forgery, token handling, budget enforcement, and sandbox isolation still need real
implementations and negative tests when those boundaries are introduced. A local trusted fixture
does not validate them. A passing schema is not proof that a future evidence producer is honest.

Dependency advisories and package license metadata are recorded. They cannot establish absence
of vulnerabilities or settle legal license compatibility. No external service received project
source for AI processing. Public documentation and npm registry metadata/packages were contacted
for authorized tooling review and installation.
