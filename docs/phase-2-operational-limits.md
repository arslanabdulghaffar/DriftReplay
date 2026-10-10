# Operating the Phase 2 local analyzer

Use the pinned Node **24.21.0**, Corepack **0.36.0**, pnpm **11.25.0** and committed
lockfile. Node's native TypeScript stripping executes only project-authored analyzer modules;
the pinned TypeScript **5.9.3** compiler API parses selected source as data. No ts-node,
consumer imports, executable config, dependency hooks or remote diff executable is involved.

```powershell
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm check
corepack pnpm test:analysis
corepack pnpm analyze:fixture
```

The last command actually reads the two committed contracts, reviewed mapping and unchanged
adapter. It writes `.local/phase-2/analysis.json` and `analysis.md`; `.local/` is ignored.
Its stdout is a bounded JSON summary with counts, digest, relative output paths and separately
labeled duration/size metadata. Repeating the same command produces the same normalized
report bytes. Markdown sections are capped at 100 records; JSON contains the complete bounded
result. Existing local reports may be replaced. Concurrent writers are not supported.

For explicitly selected local inputs (paths relative to the approved root):

```powershell
node packages/analysis/src/cli.ts --root . --base specs/v1.json --candidate specs/v2.json --source src/client.ts --source src/other.ts
```

The CLI resolves the root to an absolute local directory; artifact paths must already use
forward slashes. Exactly one base, one candidate, at least one source and at most one mapping
are required. There is no recursive directory discovery. `--mapping` accepts only the existing
reviewed synthetic byte pins; custom correspondence requires a separately reviewed policy
change. General supported contract/source inputs work without a mapping. No secret or network
connection is required. Source excerpts may contain local private data: keep the ignored
reports local and review any copy before publication.

Exit codes: **0** completed static analysis (including breaking findings or lexical unknowns),
**2** stopped input/policy/resource analysis, **3** indeterminate engine/worker failure,
**64** CLI usage or report-I/O failure. Breaking findings do not masquerade as parser failures,
and process failures never become breaking findings. Ctrl+C cancels the worker and produces a
stopped record when report output is available. No external binary is required; missing/crashed
worker and malformed worker output are separately tested failure modes for T18.

## Fixed limits

| Boundary                    | Ceiling / policy                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Explicit requested files    | 2,000 adapter-wide; valid experiments additionally restrict roles                   |
| Source files                | 256                                                                                 |
| One contract                | 2 MiB raw UTF-8                                                                     |
| One source / mapping        | 256 KiB each; reduced from a broad source scope to bound synchronous parsing        |
| Combined source / all bytes | 10 MiB / 25 MiB; valid role cardinality usually reaches smaller totals              |
| JSON                        | Depth 48; 50,000 nodes; 65,536 UTF-16 units per token                               |
| Operations                  | 512 per contract; emitted deltas also bounded                                       |
| AST                         | 50,000 tokens and nodes; nesting 128; 1,000 usages/unknowns per file                |
| Source token / excerpts     | 16,384 units/token; 1,024 route and 4,096 request units; no silent truncation       |
| Machine result              | 4 MiB UTF-8 maximum, with conservative incremental accounting before graph growth   |
| Deadline                    | 30 seconds for supervised local analysis; reduced budgets permitted                 |
| Worker memory               | 256 MiB V8 old-generation heap; 4 MiB worker stack; not an absolute process RSS cap |

Paths reject absolute/UNC/drive-relative forms, backslashes in relative paths, percent encoding,
dot traversal, controls, Windows device names, non-NFC/ambiguous names, hidden folders,
node_modules, out/dist/build/generated/coverage/vendor and declaration/minified/generated
source suffixes. Case is preserved; case-insensitive duplicate paths and duplicate file
identities are denied. Some unmarked generated files are indistinguishable from handwritten
files; the operator must select scope deliberately. File extensions are lower-case explicit
`.json` or `.ts/.tsx/.js/.jsx`. UTF-8 decoding is fatal; BOM and NUL are rejected at ingestion.
CRLF and LF are preserved, as are Unicode code points. Hashes always use raw bytes; AST
offsets count UTF-16 code units and one-based line/columns, with exclusive end positions.

JSON rejects duplicate decoded keys, prototype-sensitive keys, nonfinite numeric values,
overlong tokens, malformed data and excessive depth/count. No YAML, references, schema
composition or network resolution exists. The OpenAPI matrix enumerates every supported
semantic boundary; unknown keywords are rejected rather than silently dropped.

## Residual boundaries

Ingestion checks each ancestor and file for symlinks/junctions, regular-file identity, metadata
changes and cross-device nested mounts. Reads are bounded to checked size plus one, with
before/after handle/path checks. Report output separately rejects unsafe roots/directories,
symlink or multiply linked destination files and writes private temporary files before rename.
These checks narrow TOCTOU races; they do not provide atomic containment against hostile local
users. Same-device bind mounts are not reliably detectable. The trusted local operator/root is
an explicit assumption; a public service must introduce stronger isolation in an authorized phase.

The direct pure API uses cooperative callbacks and input/output bounds. Synchronous TypeScript
parsing cannot be interrupted inside the same thread. The CLI additionally supervises a fixed
project-authored worker with a wall-clock deadline and heap limit, discarding partial results
on termination. Native/runtime memory is outside the V8 heap ceiling. No arbitrary repository
execution or remote sandbox is implemented or implied.

Only local file APIs exist in the product path. Tests cover rejected external references and
inert malicious source; this is not packet-level egress attestation. Dependency installation,
advisory checks and authorized Git publication use network separately from product analysis.
The static Next.js export remains intact; no live browser scan, cloud service or Phase 3 job
coordination is introduced.
