# MercuryPay (synthetic) fixture

MercuryPay here is an invented provider. These contracts and behavior definitions are curated local data, not captured production observations. The `.invalid` hostname is not called. No payment or fixture replay occurs in Phase 1.

The business input contains an email, `amountMinor` in USD cents, and `currency: USD`. Amounts are integers from 1 through JavaScript's maximum safe integer, 9007199254740991. The v1 adapter maps this input to `POST /v1/charges` and `customer_email`. The v2 contract requires `POST /v2/payments` and `customer.email`; unknown properties are rejected. Both retain `amount` and `currency` on the wire and a stable success response.

The v2 behavior data explicitly retires v1 with a synthetic 410 and rejects the old flat identity at the new route with 400. The migration relationship is human-curated ground truth, not an inference from removed and added operations.

`business-cases/assertions.json` describes a provider-independent oracle. Its customer-identity assertion needs a later trusted harness observation; it is not inferred from the success response, which does not contain customer email. The harness, runtime, dependencies, and network policy are still unpinned Phase 4 requirements.

The manifest hashes the actual bytes of the seven referenced artifacts using SHA-256. Its tree digest is SHA-256 of sorted entries `relative/path:sha256` followed by a literal LF for each entry. The manifest itself, package metadata, documentation, and validation source are excluded. Formatting a referenced artifact changes its digest. Tests recompute hashes; they never update them.

The node-only `validation` export checks this particular fixture's reviewed inline OpenAPI 3.0.3 JSON structure, exact routes, object/string/integer schemas, money invariants, mock examples, business oracle, mappings, and hashes. It is not a general OpenAPI validator, compatibility engine, payload validator, provider emulator, or replay harness. References, composition keywords, other dialects, YAML, and additional operations are outside this fixture validator's scope. Static conformance cannot establish runtime regression or verified repair.

Future patch allowance is limited to `apps/demo-shop/src/v1-adapter.ts`. The business input, oracle, provider data, and contracts remain immutable experiment inputs. Future execution requires explicit approval and separately pinned execution manifests.
