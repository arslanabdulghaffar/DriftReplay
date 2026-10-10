# Supported scope

The preserved Phase 1 validator checks one reviewed MercuryPay synthetic fixture. Its contracts use OpenAPI
3.0.3 JSON with inline object, string, and integer schemas; required fields, bounded integer
amounts, fixed currency/status enums, email annotation, and explicit additional-property rejection.
They contain one POST operation each and success/validation-error response descriptions.

The validator checks the reviewed shape, references, semantics, and byte digests. It is not
a general OpenAPI validator, compatibility diff, JSON Schema engine, or arbitrary-input parser
service. References, composition, callbacks, remote documents, other dialects, and general YAML
are unsupported. An email format annotation does not contact or verify an email service.

## Claim boundaries

| Material                 | Meaning now                                                 |
| ------------------------ | ----------------------------------------------------------- |
| Contract JSON            | Authored synthetic source content                           |
| Migration mapping        | Curated synthetic correspondence, not inferred rename       |
| Static validation result | Fixture consistency and selected schema constraints         |
| Demo consumer            | Unmigrated pure v1 request construction                     |
| Behavior definitions     | Unexecuted intended synthetic behavior                      |
| Business assertions      | Unexecuted provider-independent oracle definitions          |
| UI proof chain           | Future evidence requirements, not a persisted investigation |

STRUCTURAL_BREAK, MATCHED_USAGE, POTENTIAL_IMPACT, REPRODUCED_FAILURE, PATCH_VERIFIED,
UNVERIFIED, and NOT_APPLICABLE have distinct types. The Phase 1 foundation guard still admits
no active analysis/replay claim. Core schemas cannot represent an executed runtime attestation. The admission
guard refuses claims that need later capabilities, even if caller-authored references look valid.

Phase 2 adds a separate local analyzer and recomputation-based evidence predicate. Supported
structural changes and lexical matches can justify conditional `POTENTIAL_IMPACT`; they cannot
justify runtime failure or patch verification. Read the [OpenAPI matrix](openapi-support-matrix.md),
[AST patterns](typescript-analysis-patterns.md), [evidence policy](analysis-evidence-policy.md),
and [operational limits](phase-2-operational-limits.md). The static dashboard does not ingest
these local reports or scan arbitrary repositories.

Static fixture test success does not demonstrate baseline PASS / changed FAIL / patched PASS.
It does not establish actual-provider behavior, automatic repair, complete API support,
business adoption, false-positive rates, or production security.
