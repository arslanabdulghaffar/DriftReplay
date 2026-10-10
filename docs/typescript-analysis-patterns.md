# Phase 2 TypeScript analysis patterns

The local analyzer uses the pinned TypeScript **5.9.3** parser with
`createSourceFile`. It never imports the inspected modules, resolves their imports,
loads their `tsconfig`, calls their functions, or runs build plugins. The parser
accepts explicitly selected `.ts`, `.tsx`, `.js` and `.jsx` text. Filesystem policy
and immutable byte/digest binding belong to the ingestion/composition layers.

## Supported lexical patterns

| Rule ID                          | Required AST shape                                                                                                                                                 | Meaning                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `ast.returned-request-object.v1` | Directly returned object, or expression-arrow object, with literal uppercase HTTP `method`, literal local `path`, and an object-literal `body`; optional `headers` | Request construction by the declared method/path/body convention. Dispatch is unverified. |
| `ast.direct-fetch-literal.v1`    | Direct identifier `fetch` call with one literal local path and optional object-literal options containing only `method`, `headers`, `body`                         | Static call pattern assuming standard ambient `fetch`. Omitted method means `GET`.        |

The method set is `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`,
`TRACE` for constructed requests. Direct fetch excludes forbidden `TRACE`; `CONNECT`
and `TRACK` are also unsupported. Lowercase methods are deliberately unsupported instead of normalized.
Local literal paths begin with one `/` and contain no whitespace, query, fragment,
percent escape, backslash or path-template braces. String escape sequences are
decoded by the parser while the exact raw literal remains in the citation.

Returned objects must contain no additional properties. Their bodies must be
plain object literals with unambiguous property names. Parentheses and type-only
`as`, assertion, `satisfies` and non-null wrappers around the returned object are
transparent. Top-level field names may be identifiers or string literals.
Headers are not interpreted; body values are not resolved. For direct fetch,
body-property names are recorded only for an unambiguous object-literal body;
other bodies retain an explicit unresolved-body limitation.

The unchanged `apps/demo-shop/src/v1-adapter.ts` is the first pattern. Its
`"/v1/charges"` literal is on line 19, columns 11–24 (exclusive end). The enclosing
function is `buildV1CheckoutRequest`. Its interface declaration and comments do
not create usages. A wrong-method usage remains that method; the separate impact
layer requires an exact method/path join.

## Unknowns and scope limits

Computed keys, duplicate keys, `__proto__`, spreads, getters, shorthand fields,
dynamic methods/URLs, concatenations, template literals, option variables and
unsupported option properties produce unresolved request-like records. Type
declarations, comments, documentation strings, standalone route constants and
ordinary unreturned objects produce no HTTP usage. An unrelated returned object
containing only a route also produces no usage. The request-object convention is
not semantic proof that any object will be sent over HTTP.
Computed expressions inside type-only or `declare` contexts are also excluded;
a top-level invalid `return` cannot establish the returned-function pattern.

Aliases, wrappers, property-based fetch calls, request constructors and opaque
clients are not resolved. Every non-fetch call and constructor outside type-only syntax
produces an explicit unknown, including arbitrarily named helpers, wrappers and SDKs.
This deliberately reports ordinary helper calls as unknown instead of claiming that an
unrecognized SDK has no impact. The MercuryPay adapter's `parseCheckoutInput` call is
one such unknown; its separately supported request construction still links to the removed
operation. Absence of a supported usage never establishes global safety or full call-graph coverage.

Any declaration, parameter, import, destructuring assignment or observed direct
rebinding of `fetch` disables supported direct-fetch matches **for the whole
file**, including unrelated scopes. This is intentionally conservative. Runtime
`with` scopes also disable direct-fetch matches because their binding is dynamic.
Observed assignment targets include destructuring and `for` iteration targets.
Runtime
global mutation by other files, reflective operations and ambient polyfills are
not modeled; direct-fetch records state that assumption. There is no control-flow
or business-flow reachability analysis: a request in dead code can be lexically
matched and remains explicitly unexecuted.

Parser syntax diagnostics cause a typed `MALFORMED_SOURCE` error and discard the
file's results. This is a parser, not a semantic TypeScript type checker. Tests
cover malformed syntax, aliases/shadowing, unsupported forms and inert malicious
source/comments. They do not represent replay evidence.

## Exact locations and bounds

Offsets are **UTF-16 code-unit** indexes into the unchanged decoded source, with
an inclusive `start` and exclusive `end`. Lines and columns are 1-based; end
positions are exclusive. CRLF and LF stay unchanged. A UTF-8 BOM is preserved as
the initial U+FEFF code unit by the pure parser and counts toward offsets/columns;
the local ingestion policy rejects BOM-bearing files before this parser is called.
Astral Unicode characters occupy two UTF-16 code units. Raw SHA-256 digests are computed by the
ingestion layer over the original bytes, not the decoded/normalized text.

`location.excerpt` is exactly `text.slice(start, end)` for the path literal.
`requestLocation` cites the surrounding request object or fetch call. Neither
excerpt is silently truncated. Oversized spans become an explicit
`ast.excerpt-limit.v1` unknown. Composition must bind every citation back to the
selected immutable source snapshot; parser output alone is not trusted proof.

| Limit                       | Value / response                                |
| --------------------------- | ----------------------------------------------- |
| Source bytes per file       | 256 KiB UTF-8; `SOURCE_LIMIT`                   |
| Individual lexical token    | 16,384 UTF-16 code units; `SOURCE_LIMIT`        |
| Lexical tokens / AST nodes  | 50,000 each; `AST_LIMIT`                        |
| Delimiter / AST nesting     | 128 each; `AST_LIMIT`                           |
| Usages plus unknown records | 1,000 per file; `AST_LIMIT`, no partial results |
| Literal excerpt             | 1,024 UTF-16 code units; explicit unknown       |
| Whole request excerpt       | 4,096 UTF-16 code units; explicit unknown       |

A scanner preflight checks token/depth limits before parsing; an iterative AST
walk checks node/depth limits before matching. The caller's budget/cancellation
callback runs during scanning and traversal and before/after parsing. TypeScript's
synchronous parser cannot be interrupted mid-call; the source/token/depth caps
bound the input and parser exceptions become typed failures. These are local
resource controls, not a hostile multi-tenant isolation claim.
