import { describe, expect, it } from "vitest";
import { FixtureManifestSchema } from "@driftreplay/core";
import { sha256Bytes, treeDigest } from "@driftreplay/core/digests";
import { buildV1CheckoutRequest, parseCheckoutInput } from "@driftreplay/demo-shop";
import v1 from "@driftreplay/fixtures/v1";
import v2 from "@driftreplay/fixtures/v2";
import businessCase from "@driftreplay/fixtures/business-case";
import assertions from "@driftreplay/fixtures/assertions";
import mapping from "@driftreplay/fixtures/mapping";
import manifestJson from "@driftreplay/fixtures/manifest";
import {
  loadMercuryPayFixture,
  validateMercuryPayFixture,
  type FixtureBundle,
} from "@driftreplay/fixtures/validation";

type JsonObject = Record<string, unknown>;
const record = (value: unknown): JsonObject => value as JsonObject;
const manifest = FixtureManifestSchema.parse(manifestJson);

function changeArtifact(path: string, mutate: (document: JsonObject) => void): FixtureBundle {
  const bundle = loadMercuryPayFixture();
  const original = bundle.files[path];
  if (!original) throw new Error(`Missing test artifact ${path}`);
  const document = record(JSON.parse(new TextDecoder().decode(original)));
  mutate(document);
  // Keep original manifest digests: tests never regenerate or bless mutated inputs.
  return {
    ...bundle,
    files: { ...bundle.files, [path]: new TextEncoder().encode(JSON.stringify(document)) },
  };
}

function requestSchema(document: JsonObject, path: string): JsonObject {
  return record(
    record(record(record(record(record(document.paths)[path]).post).requestBody).content)[
      "application/json"
    ],
  ).schema as JsonObject;
}

function expectRejected(bundle: unknown, code: string): void {
  const result = validateMercuryPayFixture(bundle);
  expect(result.ok).toBe(false);
  expect(result.issues.some((issue) => issue.code === code)).toBe(true);
}

describe("MercuryPay synthetic fixture static conformance", () => {
  it("validates both reviewed OpenAPI 3.0.3 contracts, behavior data, mapping, oracle, and raw bytes", () => {
    expect(validateMercuryPayFixture(loadMercuryPayFixture())).toEqual({ ok: true, issues: [] });
    expect(v1.openapi).toBe("3.0.3");
    expect(v2.openapi).toBe("3.0.3");
  });

  it("recomputes every artifact digest and the defined canonical tree from raw bytes", () => {
    const bundle = loadMercuryPayFixture();
    const refs = [
      manifest.contracts.v1,
      manifest.contracts.v2,
      manifest.mocks.v1,
      manifest.mocks.v2,
      manifest.businessCase,
      manifest.assertions,
      manifest.migrationMapping,
    ];
    const recomputed = refs.map((ref) => {
      const bytes = bundle.files[ref.path];
      expect(bytes).toBeInstanceOf(Uint8Array);
      const digest = sha256Bytes(bytes!);
      expect(digest).toBe(ref.sha256);
      return { path: ref.path, sha256: digest };
    });
    expect(treeDigest(recomputed)).toBe(manifest.treeDigest);
  });

  it("exposes curated mappings and unexecuted business assertions through workspace imports", () => {
    expect(mapping.provenance).toBe("curated-synthetic-ground-truth");
    expect(assertions.execution).toBe("not-started");
    expect(assertions.assertions.map((assertion) => assertion.id)).toEqual(manifest.assertionIds);
    expect(manifest.testPolicy.execution).toBe("not-started");
    expect(manifest.phase4RequiredPins).toEqual([
      "harness",
      "runtime",
      "dependencies",
      "networkPolicy",
    ]);
  });

  it.each([
    ["v1", "/v1/charges"],
    ["v2", "/v2/payments"],
  ] as const)("rejects a missing %s route independently of digest checking", (version, path) => {
    expectRejected(
      changeArtifact(manifest.contracts[version].path, (document) => {
        delete record(document.paths)[path];
      }),
      "contract",
    );
  });

  it("rejects replacing required nested v2 identity with the old sole flat email", () => {
    expectRejected(
      changeArtifact(manifest.contracts.v2.path, (document) => {
        const schema = requestSchema(document, "/v2/payments");
        schema.required = ["customer_email", "amount", "currency"];
        const properties = record(schema.properties);
        properties.customer_email = { type: "string", format: "email", minLength: 3 };
        delete properties.customer;
      }),
      "contract",
    );
  });

  it("rejects relaxing v2 additional-property validation", () => {
    expectRejected(
      changeArtifact(manifest.contracts.v2.path, (document) => {
        requestSchema(document, "/v2/payments").additionalProperties = true;
      }),
      "contract",
    );
  });

  it.each(["v1", "v2"] as const)("rejects changed money bounds in %s", (version) => {
    expectRejected(
      changeArtifact(manifest.contracts[version].path, (document) => {
        const schema = requestSchema(document, version === "v1" ? "/v1/charges" : "/v2/payments");
        record(record(schema.properties).amount).maximum = 100000;
      }),
      "contract",
    );
  });

  it("rejects changing currency semantics", () => {
    expectRejected(
      changeArtifact(manifest.contracts.v2.path, (document) => {
        record(record(requestSchema(document, "/v2/payments").properties).currency).enum = ["EUR"];
      }),
      "contract",
    );
  });

  it("rejects nonexistent migration target properties", () => {
    expectRejected(
      changeArtifact(manifest.migrationMapping.path, (document) => {
        const entries = document.mappings as JsonObject[];
        record(entries[1]!.to).pointer =
          "/paths/~1v2~1payments/post/requestBody/content/application~1json/schema/properties/customer/properties/missing";
      }),
      "mapping",
    );
  });

  it("rejects nonexistent migration target operations", () => {
    expectRejected(
      changeArtifact(manifest.migrationMapping.path, (document) => {
        const entries = document.mappings as JsonObject[];
        record(entries[0]!.to).pointer = "/paths/~1missing/post";
      }),
      "mapping",
    );
  });

  it("rejects mapping correspondence presented as inferred fact", () => {
    expectRejected(
      changeArtifact(manifest.migrationMapping.path, (document) => {
        document.provenance = "inferred";
      }),
      "mapping",
    );
  });

  it("rejects absent artifact bytes", () => {
    const bundle = loadMercuryPayFixture();
    const files = { ...bundle.files };
    delete files[manifest.mocks.v1.path];
    expectRejected({ ...bundle, files }, "missing-file");
  });

  it("rejects wrong declared artifact digest", () => {
    const bundle = loadMercuryPayFixture();
    const changed = FixtureManifestSchema.parse(bundle.manifest);
    expectRejected(
      {
        ...bundle,
        manifest: {
          ...changed,
          contracts: {
            ...changed.contracts,
            v1: { ...changed.contracts.v1, sha256: "0".repeat(64) },
          },
        },
      },
      "digest",
    );
  });

  it("rejects a wrong tree digest even when individual digests match", () => {
    const bundle = loadMercuryPayFixture();
    const changed = FixtureManifestSchema.parse(bundle.manifest);
    expectRejected({ ...bundle, manifest: { ...changed, treeDigest: "0".repeat(64) } }, "digest");
  });

  it("detects raw-byte whitespace changes without relying on JSON value equality", () => {
    const bundle = loadMercuryPayFixture();
    const path = manifest.contracts.v1.path;
    const original = bundle.files[path]!;
    const changed = new Uint8Array(original.length + 1);
    changed.set(original);
    changed[original.length] = 10;
    expectRejected({ ...bundle, files: { ...bundle.files, [path]: changed } }, "digest");
  });

  it.each([null, undefined, [], {}, { manifest: { schemaVersion: "99" }, files: {} }])(
    "rejects unsupported boundary input %#",
    (input) => {
      expectRejected(input, "unsupported-input");
    },
  );

  it("rejects an unsupported OpenAPI dialect", () => {
    expectRejected(
      changeArtifact(manifest.contracts.v2.path, (document) => {
        document.openapi = "3.1.0";
      }),
      "contract",
    );
  });

  it("rejects schema references instead of pretending to resolve them", () => {
    expectRejected(
      changeArtifact(manifest.contracts.v2.path, (document) => {
        requestSchema(document, "/v2/payments").$ref = "https://untrusted.invalid/schema";
      }),
      "contract",
    );
  });

  it("rejects invalid JSON bytes without executing them", () => {
    const bundle = loadMercuryPayFixture();
    expectRejected(
      {
        ...bundle,
        files: {
          ...bundle.files,
          [manifest.contracts.v1.path]: new TextEncoder().encode("not JSON"),
        },
      },
      "unsupported-input",
    );
  });

  it("rejects a mock that accepts invalid schema input", () => {
    expectRejected(
      changeArtifact(manifest.mocks.v2.path, (document) => {
        document.requestValidation = "accept-anything";
      }),
      "behavior",
    );
  });

  it("rejects silent changes to the provider-independent oracle", () => {
    expectRejected(
      changeArtifact(manifest.assertions.path, (document) => {
        (document.assertions as JsonObject[])[0]!.expected = "failed";
      }),
      "business",
    );
  });

  it("rejects changed business inputs", () => {
    expectRejected(
      changeArtifact(manifest.businessCase.path, (document) => {
        record(document.input).amountMinor = 2600;
      }),
      "business",
    );
  });
});

describe("unmigrated synthetic checkout adapter (pure construction only)", () => {
  it("constructs the v1 payload without mutating stable business input", () => {
    const input = Object.freeze({ ...businessCase.input });
    const before = JSON.stringify(input);
    const request = buildV1CheckoutRequest(input);
    expect(request).toEqual({
      method: "POST",
      path: "/v1/charges",
      headers: { "content-type": "application/json" },
      body: { customer_email: input.email, amount: input.amountMinor, currency: input.currency },
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(request.body).not.toHaveProperty("customer");
  });

  it("accepts exact lower and upper safe integer minor-unit boundaries", () => {
    expect(parseCheckoutInput({ ...businessCase.input, amountMinor: 1 }).amountMinor).toBe(1);
    expect(
      parseCheckoutInput({ ...businessCase.input, amountMinor: Number.MAX_SAFE_INTEGER })
        .amountMinor,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid amount %s",
    (amountMinor) => {
      expect(() => buildV1CheckoutRequest({ ...businessCase.input, amountMinor })).toThrow(
        TypeError,
      );
    },
  );

  it("rejects unsupported currencies, provider fields, and invalid email", () => {
    expect(() => buildV1CheckoutRequest({ ...businessCase.input, currency: "EUR" })).toThrow(
      TypeError,
    );
    expect(() =>
      buildV1CheckoutRequest({ ...businessCase.input, customer_email: "other@example.invalid" }),
    ).toThrow(TypeError);
    expect(() => buildV1CheckoutRequest({ ...businessCase.input, email: "not-an-email" })).toThrow(
      TypeError,
    );
  });
});
