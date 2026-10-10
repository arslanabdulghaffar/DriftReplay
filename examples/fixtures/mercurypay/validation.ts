import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { FixtureManifestSchema } from "@driftreplay/core";
import { sha256Bytes, treeDigest } from "@driftreplay/core/digests";

/** A static validator for this curated fixture only; not an OpenAPI engine or replay. */
export interface FixtureBundle {
  readonly manifest: unknown;
  readonly files: Readonly<Record<string, Uint8Array>>;
}

export interface FixtureIssue {
  readonly code:
    | "unsupported-input"
    | "manifest"
    | "missing-file"
    | "digest"
    | "contract"
    | "behavior"
    | "business"
    | "mapping";
  readonly path: string;
  readonly message: string;
}

const artifactPaths = [
  "contracts/v1.openapi.json",
  "contracts/v2.openapi.json",
  "provider-mocks/v1.json",
  "provider-mocks/v2.json",
  "business-cases/checkout.json",
  "business-cases/assertions.json",
  "migration-ground-truth/mapping.json",
] as const;

const assertionIds = [
  "checkout.succeeded",
  "checkout.transaction-identity",
  "checkout.amount-preserved",
  "checkout.currency-preserved",
  "checkout.customer-preserved",
];

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pointer(document: unknown, path: string): unknown {
  if (!path.startsWith("/") || /~(?:[^01]|$)/.test(path)) return undefined;
  let current = document;
  for (const token of path.slice(1).split("/")) {
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    const record = object(current);
    if (!Object.hasOwn(record, key)) return undefined;
    current = record[key];
  }
  return current;
}

/** Reads only the seven fixed local artifact paths, never paths supplied by a manifest. */
export function loadMercuryPayFixture(): FixtureBundle {
  const files: Record<string, Uint8Array> = {};
  for (const path of artifactPaths) {
    try {
      files[path] = readFileSync(fileURLToPath(new URL(path, import.meta.url)));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return {
    manifest: JSON.parse(
      readFileSync(fileURLToPath(new URL("./fixture-manifest.json", import.meta.url)), "utf8"),
    ) as unknown,
    files,
  };
}

export function validateMercuryPayFixture(value: unknown): { ok: boolean; issues: FixtureIssue[] } {
  const issues: FixtureIssue[] = [];
  const report = (code: FixtureIssue["code"], path: string, message: string) => {
    issues.push({ code, path, message });
  };
  const check = (condition: boolean, code: FixtureIssue["code"], path: string, message: string) => {
    if (!condition) report(code, path, message);
  };
  const bundle = object(value);
  const parsed = FixtureManifestSchema.safeParse(bundle.manifest);
  if (
    !parsed.success ||
    !bundle.files ||
    typeof bundle.files !== "object" ||
    Array.isArray(bundle.files)
  ) {
    report(
      "unsupported-input",
      "fixture",
      "Expected a supported version-1 manifest and a map of raw artifact bytes.",
    );
    return { ok: false, issues };
  }
  const manifest = parsed.data;
  const files = object(bundle.files);
  const refs = [
    manifest.contracts.v1,
    manifest.contracts.v2,
    manifest.mocks.v1,
    manifest.mocks.v2,
    manifest.businessCase,
    manifest.assertions,
    manifest.migrationMapping,
  ];
  check(
    isDeepStrictEqual(refs.map((ref) => ref.path).sort(), [...artifactPaths].sort()),
    "manifest",
    "references",
    "The manifest must reference exactly the seven reviewed artifacts.",
  );
  check(
    new Set(refs.map((ref) => ref.id)).size === refs.length,
    "manifest",
    "references",
    "Artifact IDs must be unique.",
  );
  check(
    manifest.fixtureId === "mercurypay-synthetic-checkout",
    "manifest",
    "fixtureId",
    "Unexpected fixture identity.",
  );
  check(
    isDeepStrictEqual(manifest.assertionIds, assertionIds),
    "manifest",
    "assertionIds",
    "Business assertion identities must remain fixed.",
  );
  check(
    isDeepStrictEqual([...manifest.testPolicy.immutableInputs].sort(), [...artifactPaths].sort()),
    "manifest",
    "testPolicy.immutableInputs",
    "All seven reviewed artifacts must be immutable inputs.",
  );
  check(
    isDeepStrictEqual(manifest.testPolicy.patchAllowedPaths, ["apps/demo-shop/src/v1-adapter.ts"]),
    "manifest",
    "testPolicy.patchAllowedPaths",
    "Only the v1 adapter is a later patch target.",
  );
  const documents: Record<string, unknown> = {};
  const actualRefs: { path: string; sha256: string }[] = [];
  for (const ref of refs) {
    const bytes = files[ref.path];
    if (!(bytes instanceof Uint8Array)) {
      report("missing-file", ref.path, "Referenced artifact bytes are absent or invalid.");
      continue;
    }
    const digest = sha256Bytes(bytes);
    actualRefs.push({ path: ref.path, sha256: digest });
    check(
      digest === ref.sha256,
      "digest",
      ref.path,
      "Raw-byte SHA-256 does not match the manifest.",
    );
    try {
      documents[ref.path] = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ) as unknown;
    } catch {
      report(
        "unsupported-input",
        ref.path,
        "Expected UTF-8 JSON; this fixture validator does not support other formats.",
      );
    }
  }
  if (
    actualRefs.length === refs.length &&
    new Set(actualRefs.map((ref) => ref.path)).size === refs.length
  ) {
    check(
      treeDigest(actualRefs) === manifest.treeDigest,
      "digest",
      "treeDigest",
      "Tree digest differs from the actual artifact bytes.",
    );
  }
  const business = object(documents[manifest.businessCase.path]);
  const input = object(business.input);
  check(
    business.synthetic === true && business.schemaVersion === "1",
    "business",
    manifest.businessCase.path,
    "Business input must identify this synthetic version-1 fixture.",
  );
  check(
    isDeepStrictEqual(input, {
      email: "shopper@example.invalid",
      amountMinor: 2599,
      currency: "USD",
    }),
    "business",
    "input",
    "The pinned business case is email, 2599 USD minor units.",
  );
  const expectedSuccess = {
    transactionId: "syn_txn_checkout_001",
    status: "succeeded",
    amount: input.amountMinor,
    currency: input.currency,
  };
  const expectedRequests = {
    v1: { customer_email: input.email, amount: input.amountMinor, currency: input.currency },
    v2: { customer: { email: input.email }, amount: input.amountMinor, currency: input.currency },
  };
  const contracts = {
    v1: documents[manifest.contracts.v1.path],
    v2: documents[manifest.contracts.v2.path],
  };
  const schemaKeywords = new Set([
    "type",
    "additionalProperties",
    "required",
    "properties",
    "format",
    "minLength",
    "minimum",
    "maximum",
    "enum",
    "description",
  ]);
  const checkSchema = (value: unknown, path: string): void => {
    const schema = object(value);
    check(
      ["object", "string", "integer"].includes(String(schema.type)),
      "contract",
      path,
      "Only inline object/string/integer schemas are supported by this fixture validator.",
    );
    check(
      Object.keys(schema).every((key) => schemaKeywords.has(key)),
      "contract",
      path,
      "Unsupported schema keyword; no general OpenAPI compatibility claim is made.",
    );
    if (schema.type === "object") {
      const properties = object(schema.properties);
      check(
        schema.additionalProperties === false,
        "contract",
        path,
        "Object schemas must reject additional properties.",
      );
      check(
        Array.isArray(schema.required) &&
          schema.required.every(
            (key) => typeof key === "string" && Object.hasOwn(properties, key),
          ) &&
          new Set(schema.required).size === schema.required.length,
        "contract",
        path,
        "Required properties must be unique existing property names.",
      );
      for (const [key, child] of Object.entries(properties))
        checkSchema(child, `${path}/properties/${key}`);
    }
  };
  const checkMoney = (schemaValue: unknown, path: string): void => {
    const schema = object(schemaValue);
    const props = object(schema.properties);
    const amount = object(props.amount);
    const currency = object(props.currency);
    check(
      amount.type === "integer" &&
        amount.minimum === 1 &&
        amount.maximum === Number.MAX_SAFE_INTEGER,
      "contract",
      path,
      "Amount must remain positive safe-integer USD minor units.",
    );
    check(
      currency.type === "string" && isDeepStrictEqual(currency.enum, ["USD"]),
      "contract",
      path,
      "Currency must remain exactly USD.",
    );
  };
  for (const version of ["v1", "v2"] as const) {
    const ref = manifest.contracts[version];
    const document = object(contracts[version]);
    const path = version === "v1" ? "/v1/charges" : "/v2/payments";
    const operation = object(object(object(document.paths)[path]).post);
    check(
      isDeepStrictEqual(Object.keys(document).sort(), ["info", "openapi", "paths", "servers"]),
      "contract",
      ref.path,
      "Only the reviewed inline document structure is supported.",
    );
    check(
      document.openapi === "3.0.3",
      "contract",
      ref.path,
      "Only OpenAPI 3.0.3 JSON is supported.",
    );
    const info = object(document.info);
    check(
      typeof info.title === "string" &&
        info.title.includes("(synthetic)") &&
        info.version === (version === "v1" ? "1.0.0" : "2.0.0"),
      "contract",
      ref.path,
      "Contract title/version must identify the synthetic version.",
    );
    check(
      isDeepStrictEqual(document.servers, [{ url: "https://mercurypay.invalid" }]),
      "contract",
      ref.path,
      "Only the reserved invalid synthetic server is documented.",
    );
    check(
      isDeepStrictEqual(Object.keys(object(document.paths)), [path]) &&
        Object.keys(operation).length > 0,
      "contract",
      ref.path,
      `Expected only POST ${path}.`,
    );
    check(
      isDeepStrictEqual(Object.keys(object(object(document.paths)[path])), ["post"]),
      "contract",
      ref.path,
      "Only the reviewed POST operation is supported.",
    );
    check(
      typeof operation.operationId === "string" && operation.operationId.length > 0,
      "contract",
      ref.path,
      "An explicit operation ID is required.",
    );
    const requestBody = object(operation.requestBody);
    const request = object(object(requestBody.content)["application/json"]);
    const requestSchema = object(request.schema);
    check(
      requestBody.required === true,
      "contract",
      ref.path,
      "The JSON request body is required.",
    );
    checkSchema(request.schema, `${ref.path}:request`);
    checkMoney(request.schema, `${ref.path}:request`);
    const expectedRequired =
      version === "v1"
        ? ["customer_email", "amount", "currency"]
        : ["customer", "amount", "currency"];
    check(
      isDeepStrictEqual(requestSchema.required, expectedRequired) &&
        isDeepStrictEqual(
          Object.keys(object(requestSchema.properties)).sort(),
          [...expectedRequired].sort(),
        ),
      "contract",
      ref.path,
      "Request property names and required identity must match the reviewed version.",
    );
    const properties = object(requestSchema.properties);
    const emailSchema =
      version === "v1"
        ? object(properties.customer_email)
        : object(object(object(properties.customer).properties).email);
    check(
      emailSchema.type === "string" &&
        emailSchema.format === "email" &&
        emailSchema.minLength === 3,
      "contract",
      ref.path,
      "Customer identity must be an email string.",
    );
    if (version === "v2") {
      const customer = object(properties.customer);
      check(
        customer.type === "object" &&
          customer.additionalProperties === false &&
          isDeepStrictEqual(customer.required, ["email"]) &&
          isDeepStrictEqual(Object.keys(object(customer.properties)), ["email"]),
        "contract",
        ref.path,
        "v2 must require nested customer.email and reject sole flat customer_email.",
      );
    }
    check(
      isDeepStrictEqual(request.example, expectedRequests[version]),
      "contract",
      ref.path,
      "The wire example must preserve the pinned business values.",
    );
    const responses = object(operation.responses);
    check(
      isDeepStrictEqual(Object.keys(responses).sort(), ["201", "400"]),
      "contract",
      ref.path,
      "Expected success and validation-error responses.",
    );
    for (const response of Object.values(responses))
      check(
        typeof object(response).description === "string",
        "contract",
        ref.path,
        "Each response requires a description.",
      );
    const response = object(object(object(responses["201"]).content)["application/json"]);
    const successSchema = object(response.schema);
    checkSchema(successSchema, `${ref.path}:response`);
    checkMoney(successSchema, `${ref.path}:response`);
    check(
      isDeepStrictEqual(successSchema.required, ["transactionId", "status", "amount", "currency"]),
      "contract",
      ref.path,
      "Success requirements must remain stable.",
    );
    const successProperties = object(successSchema.properties);
    check(
      isDeepStrictEqual(Object.keys(successProperties).sort(), [
        "amount",
        "currency",
        "status",
        "transactionId",
      ]),
      "contract",
      ref.path,
      "Success properties must remain stable.",
    );
    check(
      isDeepStrictEqual(successProperties.transactionId, { type: "string", minLength: 1 }) &&
        isDeepStrictEqual(successProperties.status, { type: "string", enum: ["succeeded"] }),
      "contract",
      ref.path,
      "Success identity/status semantics must remain stable.",
    );
    check(
      isDeepStrictEqual(response.example, expectedSuccess),
      "contract",
      ref.path,
      "Success example must preserve amount/currency and transaction identity.",
    );
    const mockRef = manifest.mocks[version];
    const mock = object(documents[mockRef.path]);
    check(
      mock.schemaVersion === "1" &&
        mock.synthetic === true &&
        mock.kind === "behavior-reference-data" &&
        mock.execution === "not-started",
      "behavior",
      mockRef.path,
      "Mocks are synthetic reference data, not execution results.",
    );
    check(
      mock.contractId === ref.id &&
        mock.requestValidation === "reject-any-schema-violation" &&
        isDeepStrictEqual(mock.route, { method: "POST", path }),
      "behavior",
      mockRef.path,
      "Mock route and contract validation policy must match.",
    );
    check(
      isDeepStrictEqual(mock.requestExample, expectedRequests[version]) &&
        isDeepStrictEqual(mock.success, { httpStatus: 201, body: expectedSuccess }),
      "behavior",
      mockRef.path,
      "Mock examples must match the immutable business case.",
    );
    check(
      isDeepStrictEqual(mock.invalidRequest, {
        httpStatus: 400,
        code: "SYNTHETIC_INVALID_REQUEST",
      }) &&
        isDeepStrictEqual(mock.unknownRoute, {
          httpStatus: 404,
          code: "SYNTHETIC_ROUTE_NOT_FOUND",
        }),
      "behavior",
      mockRef.path,
      "Invalid payloads and unknown routes must remain rejected.",
    );
    check(
      isDeepStrictEqual(
        mock.retiredRoutes,
        version === "v1"
          ? []
          : [
              {
                method: "POST",
                path: "/v1/charges",
                httpStatus: 410,
                code: "SYNTHETIC_VERSION_RETIRED",
              },
            ],
      ),
      "behavior",
      mockRef.path,
      "Retirement is an explicit synthetic v2 behavior.",
    );
    if (version === "v2")
      check(
        isDeepStrictEqual(mock.rejectedExamples, [
          {
            reason: "A flat customer_email cannot replace required customer.email",
            body: expectedRequests.v1,
            httpStatus: 400,
          },
        ]),
        "behavior",
        mockRef.path,
        "The old flat identity must be an explicit rejected example.",
      );
  }
  const assertions = object(documents[manifest.assertions.path]);
  const assertionList = Array.isArray(assertions.assertions)
    ? assertions.assertions.map(object)
    : [];
  check(
    assertions.synthetic === true &&
      assertions.schemaVersion === "1" &&
      assertions.execution === "not-started" &&
      assertions.kind === "business-oracle-reference-data",
    "business",
    "assertions",
    "Assertions are unexecuted business-oracle reference data.",
  );
  const assertionPolicies = [
    { id: assertionIds[0], subject: "checkout.status", operator: "equals", expected: "succeeded" },
    { id: assertionIds[1], subject: "checkout.transactionId", operator: "nonempty-string" },
    {
      id: assertionIds[2],
      subject: "checkout.amountMinor",
      operator: "equals-input",
      inputField: "amountMinor",
    },
    {
      id: assertionIds[3],
      subject: "checkout.currency",
      operator: "equals-input",
      inputField: "currency",
    },
    {
      id: assertionIds[4],
      subject: "checkout.customerEmail",
      operator: "equals-input",
      inputField: "email",
    },
  ];
  check(
    isDeepStrictEqual(
      assertionList.map((entry) =>
        Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "description")),
      ),
      assertionPolicies,
    ),
    "business",
    "assertions",
    "Business oracle semantics cannot change with the provider representation.",
  );
  const mapping = object(documents[manifest.migrationMapping.path]);
  check(
    mapping.schemaVersion === "1" &&
      mapping.synthetic === true &&
      mapping.provenance === "curated-synthetic-ground-truth",
    "mapping",
    "provenance",
    "Migration correspondence must retain curated synthetic provenance.",
  );
  const mappings = Array.isArray(mapping.mappings) ? mapping.mappings.map(object) : [];
  const expectedPointers = [
    ["/paths/~1v1~1charges/post", "/paths/~1v2~1payments/post"],
    [
      "/paths/~1v1~1charges/post/requestBody/content/application~1json/schema/properties/customer_email",
      "/paths/~1v2~1payments/post/requestBody/content/application~1json/schema/properties/customer/properties/email",
    ],
  ];
  check(
    mappings.length === 2,
    "mapping",
    "mappings",
    "Exactly one operation and one customer-property mapping are expected.",
  );
  for (const [index, mappingEntry] of mappings.entries()) {
    check(
      mappingEntry.kind === (index === 0 ? "operation" : "request-property"),
      "mapping",
      `mappings/${index}`,
      "Mapping kind must match its reviewed target.",
    );
    for (const [side, version, pointerIndex] of [
      ["from", "v1", 0],
      ["to", "v2", 1],
    ] as const) {
      const target = object(mappingEntry[side]);
      check(
        target.contractId === manifest.contracts[version].id &&
          target.pointer === expectedPointers[index]?.[pointerIndex] &&
          typeof target.pointer === "string" &&
          pointer(contracts[version], target.pointer) !== undefined,
        "mapping",
        `mappings/${index}/${side}`,
        "Mapping target must identify the exact existing reviewed operation or property.",
      );
    }
  }
  return { ok: issues.length === 0, issues };
}
