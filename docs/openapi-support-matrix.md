# OpenAPI comparison support matrix

Phase 2 uses the project-owned `driftreplay-openapi-subset@0.2.0` comparator selected in
[ADR 0002](adr/0002-deterministic-analysis.md). This is a bounded structural comparison,
not a general OpenAPI validator, provider authenticity check or runtime compatibility test.
It has no external executable, reference resolver, filesystem access or network access.
The local ingestion adapter supplies already parsed, byte-pinned JSON data.

## Input boundary

Only OpenAPI **3.0.3 JSON** is supported. Both complete documents are validated before any
comparison result is returned. An unsupported keyword in an added operation, a nested schema
or a response is not skipped simply because another part of the document is understood.
The caller converts typed errors into a stopped result with no partial confident findings.

| Location           | Accepted fields or values                                                                                                                                                | Explicit restrictions                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Document           | `openapi`, `info`, `servers`, `paths`                                                                                                                                    | No components, security, extensions, YAML or other dialects                                                                                    |
| Info               | Required nonempty `title`, `version`; optional `description`                                                                                                             | Metadata is validated but not compared                                                                                                         |
| Servers            | Nonempty array of `{url, description?}`; absence means `/`                                                                                                               | No templates/variables; a change in ordered URL values stops as unsupported; URLs are never retrieved                                          |
| Paths              | Literal paths beginning with `/`; optional path `summary`/`description`                                                                                                  | No templates, whitespace/control characters, backslashes, query/fragment parts, parameters or path-level servers                               |
| Operations         | `get`, `put`, `post`, `delete`, `options`, `head`, `patch`, `trace`; optional `operationId`, `summary`, `description`, `deprecated`; `requestBody`, required `responses` | Methods are normalized to uppercase in results; operation IDs must be unique when present; no security, parameters, callbacks or links         |
| Request body       | `description`, boolean `required` (defaults false), required `content`                                                                                                   | Only one media type, `application/json`, with required `schema` and optional inert `example`                                                   |
| Responses          | At least one explicit status code `100`–`599`; required `description`, optional `content`                                                                                | No `default`, status ranges, headers or links; content has the same JSON media restriction                                                     |
| Object schema      | `type: object`, `properties`, `required`, boolean `additionalProperties` (defaults true)                                                                                 | Required entries must be unique, nonempty and declared in properties; no schema-valued additional properties or object cardinality constraints |
| String schema      | `type: string`, unique nonempty string `enum`, nonnegative safe-integer `minLength`/`maxLength`                                                                          | Length uses Unicode code points; no pattern; `format: email` is retained as an opaque marker under the policy below                            |
| Integer schema     | `type: integer`, unique nonempty safe-integer `enum`, safe-integer `minimum`/`maximum`                                                                                   | No exclusive bounds, multiple-of, numeric format, number/boolean/array/null types                                                              |
| Schema annotations | `title`, `description`, `example`, boolean `deprecated`                                                                                                                  | Validated as JSON or the stated primitive type; not executed or interpreted as instructions                                                    |

Bounds must be consistent, and enum values must satisfy their declared type and bounds.
The primitive comparison accounts for enum/bound interactions: for example, increasing a
minimum below every already enumerated integer does not change the accepted domain. Reordering
an enum or JSON object keys does not create a semantic delta. Descriptions and examples do not
establish migration intent or behavior.

Every `$ref` key is rejected across the full tree, including local, external and recursive
references and references embedded in examples. `allOf`, `oneOf`, `anyOf`, `not`, `nullable`,
`readOnly`, `writeOnly`, defaults and all other unlisted schema keywords are unsupported.
Unknown semantics are never silently discarded. This intentionally rejects some valid OpenAPI
documents; supported-subset validation is not a claim that all other documents are invalid.

The pure API expects ordinary parsed JSON values. It additionally rejects accessors without
reading them, custom object/array prototypes, symbols, sparse arrays, cycles, nonfinite numbers
and other non-JSON values. This is not a sandbox for hostile JavaScript `Proxy` objects passed
in-process. The public local workflow constructs its own JSON data from captured bytes and
does not accept executable objects from inspected source.

## Directional consumer compatibility

For supported primitive constraints, request safety means all formerly accepted values remain
accepted. Response safety means every newly declared value remains inside the old consumer
contract. The implementation uses exact domain inclusion for supported enum/bound combinations;
it does not independently classify interacting constraints and ignore their combined effect.

`breaking` is evidence about a declared contract change. It never means an observed application
outage. `nonbreaking` is limited to the named rule and modeled declaration; it does not establish
business equivalence, availability or global compatibility. Rules ending in `.v1` are stable IDs
under the pinned engine version. Each delta includes its method, literal route and existing
old/new JSON pointers as applicable. Parent pointers are used when the field itself is absent.

| Rule suffix (prefix `openapi.`, suffix `.v1`) | Request direction                                                                                                                                                     | Response direction                                                                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation-removed`                           | Breaking: operation absent from candidate                                                                                                                             | Does not prove provider retirement or correspondence                                                                                                                                                |
| `operation-added`                             | Nonbreaking: additional callable operation                                                                                                                            | Does not imply a rename                                                                                                                                                                             |
| `request-body-added`                          | Required body: breaking; optional body: unknown because prior body semantics were undeclared                                                                          | —                                                                                                                                                                                                   |
| `request-body-removed`                        | Unknown: omission alone does not specify rejection of existing bodies                                                                                                 | —                                                                                                                                                                                                   |
| `request-body-required-changed`               | Newly required: breaking; newly optional: nonbreaking                                                                                                                 | —                                                                                                                                                                                                   |
| `{direction}-type-changed`                    | Disjoint supported types: breaking                                                                                                                                    | Disjoint supported types: breaking; opaque format caveat applies to both directions                                                                                                                 |
| `{direction}-value-constraints-changed`       | Old domain included in new: nonbreaking; otherwise breaking                                                                                                           | New domain included in old: nonbreaking; otherwise breaking                                                                                                                                         |
| `{direction}-format-changed`                  | Unknown; no format semantics are evaluated                                                                                                                            | Unknown; no format semantics are evaluated                                                                                                                                                          |
| `{direction}-property-added`                  | Required: breaking. Optional in an old closed object: nonbreaking. Optional in an old open object: unknown because an existing extension field may now be constrained | Old open object: nonbreaking. Old closed object: breaking because the new field may violate its rejection of extra properties                                                                       |
| `{direction}-property-removed`                | Candidate closed object: breaking. Candidate open object: nonbreaking because the removed constraint leaves the value allowed as an extra property                    | Old required field: breaking. Old optional field with candidate closed object: nonbreaking. Candidate open object: breaking because the previously constrained field can now carry arbitrary values |
| `{direction}-property-required-changed`       | Newly required: breaking; newly optional: nonbreaking                                                                                                                 | Newly required: nonbreaking; newly optional: breaking                                                                                                                                               |
| `{direction}-additional-properties-changed`   | Open to closed: breaking; closed to open: nonbreaking                                                                                                                 | Closed to open: breaking; open to closed: nonbreaking                                                                                                                                               |
| `response-status-added`                       | —                                                                                                                                                                     | Breaking under the declared response-alternatives model: strict old clients may receive an unhandled status                                                                                         |
| `response-status-removed`                     | —                                                                                                                                                                     | Nonbreaking under that model: fewer declared alternatives; no business-equivalence claim                                                                                                            |
| `response-body-definition-changed`            | —                                                                                                                                                                     | Unknown when a response gains or loses a content schema                                                                                                                                             |

An `unknown` delta has `support: unsupported`; it cannot support a structural-break or potential-
impact claim. Unknown _input constructs_ stop the whole comparison. Known syntactic shapes whose
compatibility is not established produce the explicit unknown deltas listed above.

### Opaque email format policy

The existing fixture contains `format: email`. The comparator preserves that marker but does not
implement email validation or pretend that a string length change necessarily excludes a valid
email. Adding/removing it produces `unknown`. With the same marker on both sides, proven primitive
domain inclusion still establishes the limited nonbreaking direction: intersecting both domains
with the same unknown format predicate preserves inclusion. A change that would otherwise be
classified breaking remains `unknown`, because no format-valid counterexample is established.
A type change involving the marker is also unknown. Other formats stop as unsupported.

## MercuryPay interpretation

The actual fixture produces two structural events: removed `POST /v1/charges` and added
`POST /v2/payments`. The comparator does not pair their schemas or discover an email rename.
The separately validated, byte-pinned curated mapping may link those operations and their field
pointers, retaining curated provenance. It does not change either structural delta into an
engine-discovered migration. Route retirement exists only in the synthetic mock definition;
these OpenAPI snapshots alone cannot establish runtime retirement.

AST tracing and impact composition are separate stages. An exact request-construction citation
can support a conditional potential-impact edge to the removed operation, but no code is run and
no provider request, replay, repair or model call occurs.

## Resource and error behavior

The comparator applies per-document limits of **48 JSON levels**, **50,000 JSON values**, **512
operations**, **65,536 UTF-16 code units per string**, **512 code units per property key**, and
**4,096 code units per generated JSON pointer**. It limits the complete comparison to **4,096
deltas**. Cooperative deadline/cancellation checks run during validation, schema traversal,
primitive enum comparison and delta production. The local workflow adds byte/file/output limits
and an outer worker deadline; those safeguards remain necessary around synchronous parsing.

| Error code                | Meaning                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `INVALID_CONTRACT`        | Malformed supported shape or non-JSON value                                                 |
| `UNSUPPORTED_CONTRACT`    | Dialect, keyword, reference, path/server semantics or construct outside the explicit subset |
| `CONTRACT_LIMIT_EXCEEDED` | Depth, value count, string/key/pointer size, operation count or delta limit exceeded        |

Errors contain a stable code and bounded JSON pointer, not an input excerpt. Errors and external
budget-check exceptions propagate before a comparison result is returned. There is no external
binary exit code to reinterpret, no resolver fallback and no partial confident report.

Tests in `packages/analysis/src/openapi.test.ts` exercise the real immutable MercuryPay contracts,
directional changes, domain interactions, nested and unknown semantics, reference forms, Unicode,
prototype-sensitive names, accessor nonexecution, limits and cancellation. Tests operate on
controlled copies or constructed values and do not rewrite reviewed fixture artifacts.
