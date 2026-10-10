import { describe, expect, it } from "vitest";

import mercuryV1 from "../../../examples/fixtures/mercurypay/contracts/v1.openapi.json";
import mercuryV2 from "../../../examples/fixtures/mercurypay/contracts/v2.openapi.json";
import { CONTRACT_LIMITS, ContractError, compareContracts } from "./openapi.ts";

type Model = Record<string, unknown>;
const scalar = (extra: Model = {}): Model => ({ type: "string", ...extra });
const objectSchema = (
  properties: Model = {},
  required: string[] = [],
  additionalProperties = false,
): Model => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties,
});
function document(request: unknown = objectSchema(), response: unknown = objectSchema()) {
  return {
    openapi: "3.0.3",
    info: { title: "Controlled test contract", version: "1" },
    paths: {
      "/charge": {
        post: {
          requestBody: { required: true, content: { "application/json": { schema: request } } },
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: response } } },
          },
        },
      },
    },
  };
}
function pair(left: unknown, right: unknown, direction: "request" | "response" = "request") {
  return compareContracts(
    direction === "request" ? document(left) : document(undefined, left),
    direction === "request" ? document(right) : document(undefined, right),
  ).deltas;
}
function edit(input: unknown, parts: string[], value: unknown): unknown {
  const cloned = structuredClone(input) as Model;
  let current = cloned;
  for (const part of parts.slice(0, -1)) current = current[part] as Model;
  Object.defineProperty(current, parts.at(-1)!, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return cloned;
}
const schemaPath = [
  "paths",
  "/charge",
  "post",
  "requestBody",
  "content",
  "application/json",
  "schema",
];
function rejects(input: unknown, code: string) {
  try {
    compareContracts(document(), input);
    expect.fail("Expected a typed failure before any deltas are returned");
  } catch (error) {
    expect(error).toBeInstanceOf(ContractError);
    expect((error as ContractError).code).toBe(code);
    expect((error as ContractError).pointer.length).toBeLessThanOrEqual(4096);
  }
}

describe("strict OpenAPI contract comparison", () => {
  it("compares the real MercuryPay artifacts as two events without a rename", () => {
    const result = compareContracts(mercuryV1, mercuryV2);
    expect(result.operations).toEqual([
      { method: "POST", path: "/v1/charges", pointer: "/paths/~1v1~1charges/post" },
    ]);
    expect(
      result.deltas.map(
        ({ kind, compatibility, support, method, path, oldPointer, newPointer }) => ({
          kind,
          compatibility,
          support,
          method,
          path,
          oldPointer,
          newPointer,
        }),
      ),
    ).toEqual([
      {
        kind: "operation-removed",
        compatibility: "breaking",
        support: "supported",
        method: "POST",
        path: "/v1/charges",
        oldPointer: "/paths/~1v1~1charges/post",
        newPointer: undefined,
      },
      {
        kind: "operation-added",
        compatibility: "nonbreaking",
        support: "supported",
        method: "POST",
        path: "/v2/payments",
        oldPointer: undefined,
        newPointer: "/paths/~1v2~1payments/post",
      },
    ]);
    expect(result.deltas[0]?.rationale).toContain("does not prove");
    expect(
      result.deltas.every(
        (item) => item.ruleId.startsWith("openapi.") && item.ruleId.endsWith(".v1"),
      ),
    ).toBe(true);
  });

  it("produces no changes for identical or whitespace-reserialized contract data", () => {
    expect(compareContracts(mercuryV1, mercuryV1).deltas).toEqual([]);
    expect(
      compareContracts(mercuryV1, JSON.parse(JSON.stringify(mercuryV1, null, 4))).deltas,
    ).toEqual([]);
  });

  it("ignores the specifically supported annotations and examples", () => {
    const left = document(scalar({ format: "email", minLength: 3 }));
    let changed = edit(left, ["info", "description"], "Instructions in content are inert data.");
    changed = edit(
      changed,
      ["paths", "/charge", "post", "operationId"],
      "newNameDoesNotInferRename",
    );
    changed = edit(changed, [...schemaPath, "description"], "new prose");
    changed = edit(changed, [...schemaPath, "example"], "another@example.invalid");
    changed = edit(changed, [...schemaPath, "deprecated"], true);
    changed = edit(changed, [...schemaPath, "format"], "email");
    expect(compareContracts(left, changed).deltas).toEqual([]);
    expect(pair(scalar(), scalar({ format: "email" }))).toMatchObject([
      { kind: "request-format-changed", compatibility: "unknown", support: "unsupported" },
    ]);
  });

  it("does not mutate input contracts", () => {
    const before = JSON.stringify(mercuryV1);
    compareContracts(mercuryV1, mercuryV2);
    expect(JSON.stringify(mercuryV1)).toBe(before);
  });

  it("sorts findings and operations independently of object insertion order", () => {
    const first = document();
    const second = structuredClone(first);
    const op = first.paths["/charge"].post;
    const left = { ...first, paths: { "/z": { get: op }, "/a": { post: op } } };
    const right = { ...second, paths: { "/b": { put: op }, "/x": { delete: op } } };
    const reorder = { ...left, paths: { "/a": { post: op }, "/z": { get: op } } };
    expect(compareContracts(left, right)).toEqual(compareContracts(reorder, right));
    expect(compareContracts(left, right)).toEqual(compareContracts(left, right));
  });

  it("uses escaped JSON pointers for literal path/property names", () => {
    const left = document(objectSchema());
    const right = document(objectSchema({ "a~/b": scalar() }, ["a~/b"]));
    expect(compareContracts(left, right).deltas[0]?.newPointer).toBe(
      "/paths/~1charge/post/requestBody/content/application~1json/schema/properties/a~0~1b",
    );
  });
});

describe("directional property and body rules", () => {
  it("classifies a new optional request property in a closed object as nonbreaking", () => {
    expect(pair(objectSchema(), objectSchema({ note: scalar() }))).toMatchObject([
      { kind: "request-property-added", compatibility: "nonbreaking", support: "supported" },
    ]);
  });

  it("does not claim safety when an optional property constrains existing extension fields", () => {
    expect(
      pair(objectSchema({}, [], true), objectSchema({ note: scalar() }, [], true)),
    ).toMatchObject([
      { kind: "request-property-added", compatibility: "unknown", support: "unsupported" },
    ]);
  });

  it("classifies a new required request property as breaking", () => {
    expect(pair(objectSchema(), objectSchema({ name: scalar() }, ["name"]))).toMatchObject([
      { kind: "request-property-added", compatibility: "breaking" },
    ]);
  });

  it.each([
    ["request", false, true, "breaking"],
    ["request", true, false, "nonbreaking"],
    ["response", false, true, "nonbreaking"],
    ["response", true, false, "breaking"],
  ] as const)(
    "%s required %s -> %s is %s",
    (direction, oldRequired, newRequired, compatibility) => {
      expect(
        pair(
          objectSchema({ name: scalar() }, oldRequired ? ["name"] : []),
          objectSchema({ name: scalar() }, newRequired ? ["name"] : []),
          direction,
        ),
      ).toMatchObject([{ kind: `${direction}-property-required-changed`, compatibility }]);
    },
  );

  it.each([
    ["request", true, false, "breaking"],
    ["request", false, true, "nonbreaking"],
    ["response", true, false, "nonbreaking"],
    ["response", false, true, "breaking"],
  ] as const)(
    "%s additional properties %s -> %s is %s",
    (direction, oldAllowance, newAllowance, compatibility) => {
      expect(
        pair(objectSchema({}, [], oldAllowance), objectSchema({}, [], newAllowance), direction),
      ).toMatchObject([{ kind: `${direction}-additional-properties-changed`, compatibility }]);
    },
  );

  it("defaults absent additionalProperties to true", () => {
    expect(pair({ type: "object" }, objectSchema({}, [], true))).toEqual([]);
  });

  it.each([
    ["request", false, false, "breaking"],
    ["request", false, true, "nonbreaking"],
    ["response", true, false, "breaking"],
    ["response", false, false, "nonbreaking"],
    ["response", false, true, "breaking"],
  ] as const)(
    "%s removed property required=%s next-open=%s gives %s",
    (direction, required, open, compatibility) => {
      const deltas = pair(
        objectSchema({ name: scalar() }, required ? ["name"] : [], open),
        objectSchema({}, [], open),
        direction,
      );
      expect(deltas).toMatchObject([{ kind: `${direction}-property-removed`, compatibility }]);
    },
  );

  it.each([
    [false, "breaking"],
    [true, "nonbreaking"],
  ] as const)("response property addition with old-open=%s is %s", (open, compatibility) => {
    expect(
      pair(objectSchema({}, [], open), objectSchema({ note: scalar() }, [], open), "response"),
    ).toMatchObject([{ kind: "response-property-added", compatibility }]);
  });

  it("compares nested property constraints", () => {
    const base = objectSchema(
      { customer: objectSchema({ email: scalar({ minLength: 2 }) }, ["email"]) },
      ["customer"],
    );
    const next = objectSchema(
      { customer: objectSchema({ email: scalar({ minLength: 3 }) }, ["email"]) },
      ["customer"],
    );
    const result = pair(base, next);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      compatibility: "breaking",
      kind: "request-value-constraints-changed",
    });
    expect(result[0]?.oldPointer).toMatch(/\/properties\/customer\/properties\/email$/);
  });

  it.each([
    [false, true, "breaking"],
    [true, false, "nonbreaking"],
  ] as const)("request body required %s -> %s is %s", (oldRequired, newRequired, compatibility) => {
    expect(
      compareContracts(
        edit(document(), ["paths", "/charge", "post", "requestBody", "required"], oldRequired),
        edit(document(), ["paths", "/charge", "post", "requestBody", "required"], newRequired),
      ).deltas,
    ).toMatchObject([{ kind: "request-body-required-changed", compatibility }]);
  });

  it("treats request body removal as unknown rather than claiming rejection", () => {
    const next = document();
    const { requestBody: _requestBody, ...op } = next.paths["/charge"].post;
    expect(_requestBody).toBeDefined();
    expect(
      compareContracts(next, edit(next, ["paths", "/charge", "post"], op)).deltas,
    ).toMatchObject([
      { kind: "request-body-removed", compatibility: "unknown", support: "unsupported" },
    ]);
  });

  it.each([
    [true, "breaking"],
    [false, "unknown"],
  ] as const)("new body required=%s is %s", (required, compatibility) => {
    const next = edit(
      document(),
      ["paths", "/charge", "post", "requestBody", "required"],
      required,
    );
    const base = document();
    const { requestBody: _requestBody, ...op } = base.paths["/charge"].post;
    expect(_requestBody).toBeDefined();
    expect(
      compareContracts(edit(base, ["paths", "/charge", "post"], op), next).deltas,
    ).toMatchObject([{ kind: "request-body-added", compatibility }]);
  });

  it("handles response status sets directionally", () => {
    const next = edit(document(), ["paths", "/charge", "post", "responses", "422"], {
      description: "Invalid",
    });
    expect(compareContracts(document(), next).deltas).toMatchObject([
      { kind: "response-status-added", compatibility: "breaking" },
    ]);
    expect(compareContracts(next, document()).deltas).toMatchObject([
      { kind: "response-status-removed", compatibility: "nonbreaking" },
    ]);
  });

  it("leaves changes in response body definition presence unknown", () => {
    const next = edit(document(), ["paths", "/charge", "post", "responses", "200"], {
      description: "No declared content",
    });
    expect(compareContracts(document(), next).deltas).toMatchObject([
      { kind: "response-body-definition-changed", compatibility: "unknown" },
    ]);
    expect(compareContracts(next, document()).deltas).toMatchObject([
      { kind: "response-body-definition-changed", compatibility: "unknown" },
    ]);
  });
});

describe("exact supported primitive domains", () => {
  it.each([
    [scalar(), scalar({ minLength: 3 })],
    [scalar({ maxLength: 20 }), scalar({ maxLength: 10 })],
    [scalar({ enum: ["a", "b"] }), scalar({ enum: ["a"] })],
    [scalar(), scalar({ enum: ["a"] })],
    [
      { type: "integer", minimum: 1 },
      { type: "integer", minimum: 2 },
    ],
    [
      { type: "integer", maximum: 10 },
      { type: "integer", maximum: 9 },
    ],
    [
      { type: "integer", enum: [1, 2, 3] },
      { type: "integer", enum: [1, 2] },
    ],
  ])("tightening %# breaks requests and narrows responses", (wide, narrow) => {
    expect(pair(wide, narrow)).toMatchObject([{ compatibility: "breaking" }]);
    expect(pair(narrow, wide)).toMatchObject([{ compatibility: "nonbreaking" }]);
    expect(pair(wide, narrow, "response")).toMatchObject([{ compatibility: "nonbreaking" }]);
    expect(pair(narrow, wide, "response")).toMatchObject([{ compatibility: "breaking" }]);
  });

  it("reports overlapping replacements as breaking in both directions", () => {
    const left = scalar({ enum: ["a", "b"] });
    const right = scalar({ enum: ["b", "c"] });
    expect(pair(left, right)).toMatchObject([{ compatibility: "breaking" }]);
    expect(pair(left, right, "response")).toMatchObject([{ compatibility: "breaking" }]);
  });

  it("ignores reordered enum values and bounds masked by equivalent enums", () => {
    expect(
      pair(
        scalar({ enum: ["abc", "def"], minLength: 1 }),
        scalar({ enum: ["def", "abc"], minLength: 2 }),
      ),
    ).toEqual([]);
    expect(
      pair(
        { type: "integer", enum: [3, 4], maximum: 10 },
        { type: "integer", enum: [4, 3], maximum: 5 },
      ),
    ).toEqual([]);
  });

  it("does not claim an enum is narrowing if it admits values outside the old bounds", () => {
    expect(
      pair(
        { type: "integer", minimum: 1, maximum: 3 },
        { type: "integer", enum: [1, 4] },
        "response",
      ),
    ).toMatchObject([{ compatibility: "breaking" }]);
  });

  it("recognizes equivalent finite integer interval and enum domains", () => {
    expect(
      pair({ type: "integer", minimum: 1, maximum: 3 }, { type: "integer", enum: [3, 2, 1] }),
    ).toEqual([]);
    expect(pair({ type: "integer" }, { type: "integer", enum: [1, 2] })).toMatchObject([
      { compatibility: "breaking" },
    ]);
  });

  it("counts string length in Unicode code points rather than UTF-16 code units", () => {
    expect(
      pair(scalar({ enum: ["😀"], minLength: 1, maxLength: 1 }), scalar({ enum: ["😀"] })),
    ).toEqual([]);
    expect(pair(scalar({ maxLength: 0 }), scalar({ enum: [""] }))).toEqual([]);
  });

  it.each(["request", "response"] as const)(
    "does not silently ignore added/removed %s format semantics",
    (direction) => {
      expect(pair(scalar(), scalar({ format: "email" }), direction)).toMatchObject([
        { kind: `${direction}-format-changed`, compatibility: "unknown" },
      ]);
      expect(pair(scalar({ format: "email" }), scalar(), direction)).toMatchObject([
        { kind: `${direction}-format-changed`, compatibility: "unknown" },
      ]);
      expect(pair(scalar({ format: "email" }), { type: "integer" }, direction)).toMatchObject([
        { compatibility: "unknown" },
      ]);
    },
  );

  it("does not invent an incompatible email-format witness when only bounds changed", () => {
    const wide = scalar({ format: "email", minLength: 1 });
    const narrow = scalar({ format: "email", minLength: 2 });
    expect(pair(wide, narrow)).toMatchObject([{ compatibility: "unknown" }]);
    expect(pair(narrow, wide)).toMatchObject([{ compatibility: "nonbreaking" }]);
    expect(pair(narrow, wide, "response")).toMatchObject([{ compatibility: "unknown" }]);
    expect(pair(wide, narrow, "response")).toMatchObject([{ compatibility: "nonbreaking" }]);
  });

  it.each(["request", "response"] as const)("detects disjoint %s type changes", (direction) => {
    expect(pair(scalar(), { type: "integer" }, direction)).toMatchObject([
      { kind: `${direction}-type-changed`, compatibility: "breaking" },
    ]);
    expect(pair(objectSchema(), scalar(), direction)).toMatchObject([
      { kind: `${direction}-type-changed`, compatibility: "breaking" },
    ]);
  });
});

describe("whole-document fail-closed validation", () => {
  it.each(["3.1.0", "3.0.2", "2.0", "garbage"])("rejects unsupported dialect %s", (version) =>
    rejects(edit(document(), ["openapi"], version), "UNSUPPORTED_CONTRACT"),
  );

  it.each([
    "$ref",
    "allOf",
    "oneOf",
    "anyOf",
    "not",
    "nullable",
    "readOnly",
    "writeOnly",
    "discriminator",
    "pattern",
    "default",
    "x-unknown",
  ])("rejects unhandled schema semantics %s", (keyword) => {
    rejects(
      edit(
        document(scalar()),
        [...schemaPath, keyword],
        keyword === "$ref" ? "https://example.invalid/schema" : true,
      ),
      "UNSUPPORTED_CONTRACT",
    );
  });

  it.each([
    "#/components/schemas/Foo",
    "./other.json#/Foo",
    "file:///private",
    "https://example.invalid/",
    "#/self",
  ])("rejects every reference form %s before any resolver exists", (ref) => {
    rejects(edit(document(), [...schemaPath, "$ref"], ref), "UNSUPPORTED_CONTRACT");
  });

  it.each(["array", "boolean", "number", "null"])("rejects unsupported type %s", (type) =>
    rejects(document({ type }), "UNSUPPORTED_CONTRACT"),
  );

  it("validates annotations/examples and all newly added operations before returning findings", () => {
    const malformed = edit(
      mercuryV2,
      [
        "paths",
        "/v2/payments",
        "post",
        "requestBody",
        "content",
        "application/json",
        "schema",
        "properties",
        "customer",
        "properties",
        "email",
        "pattern",
      ],
      "^x$",
    );
    expect(() => compareContracts(mercuryV1, malformed)).toThrow(ContractError);
    rejects(
      edit(document(), [...schemaPath, "example"], {
        payload: { $ref: "https://example.invalid" },
      }),
      "UNSUPPORTED_CONTRACT",
    );
  });

  it.each([
    [["components"], {}],
    [["security"], []],
    [["paths", "/charge", "parameters"], []],
    [["paths", "/charge", "post", "callbacks"], {}],
    [["paths", "/charge", "post", "security"], []],
    [["paths", "/charge", "post", "responses", "200", "headers"], {}],
    [["paths", "/charge", "post", "requestBody", "content", "application/xml"], {}],
    [["paths", "/charge", "post", "responses", "default"], { description: "Fallback" }],
    [["paths", "/charge", "post", "responses", "2XX"], { description: "Range" }],
  ] satisfies Array<[string[], unknown]>)(
    "rejects unsupported relevant subtree %#",
    (parts, value) => rejects(edit(document(), parts, value), "UNSUPPORTED_CONTRACT"),
  );

  it("rejects template routes and server semantics changes", () => {
    const op = document().paths["/charge"];
    rejects({ ...document(), paths: { "/charges/{id}": op } }, "UNSUPPORTED_CONTRACT");
    rejects(
      edit(document(), ["servers"], [{ url: "https://example.invalid" }]),
      "UNSUPPORTED_CONTRACT",
    );
    rejects(
      edit(document(), ["servers"], [{ url: "https://{host}", variables: {} }]),
      "UNSUPPORTED_CONTRACT",
    );
  });

  it.each([
    null,
    [],
    {},
    { openapi: "3.0.3" },
    document({}),
    document({ type: "integer", minimum: 1.5 }),
    document({ type: "integer", minimum: 3, maximum: 2 }),
    document(scalar({ enum: [] })),
    document(scalar({ enum: ["a", "a"] })),
    document(scalar({ enum: [1] })),
    document(scalar({ enum: ["a"], minLength: 2 })),
    document(scalar({ minLength: -1 })),
    document(objectSchema({}, ["missing"])),
  ])("rejects malformed/unsupported structure %#", (input) => {
    expect(() => compareContracts(document(), input)).toThrow(ContractError);
  });

  it("rejects schema-valued additionalProperties and undeclared required fields", () => {
    rejects(document({ type: "object", additionalProperties: scalar() }), "INVALID_CONTRACT");
    rejects(document({ type: "object", required: ["notDeclared"] }), "UNSUPPORTED_CONTRACT");
  });

  it("rejects duplicate operation identities and duplicate required entries", () => {
    const base = document();
    const op = { ...base.paths["/charge"].post, operationId: "duplicate" };
    rejects({ ...base, paths: { "/a": { get: op }, "/b": { post: op } } }, "INVALID_CONTRACT");
    rejects(document(objectSchema({ name: scalar() }, ["name", "name"])), "INVALID_CONTRACT");
  });

  it("rejects accessors without evaluating them", () => {
    let reads = 0;
    const input = document();
    Object.defineProperty(input, "secret", {
      enumerable: true,
      get: () => {
        reads++;
        return "do not read";
      },
    });
    rejects(input, "INVALID_CONTRACT");
    expect(reads).toBe(0);
  });

  it("rejects non-JSON prototypes, cycles and sparse arrays", () => {
    rejects(new Date(), "INVALID_CONTRACT");
    const cyclic: Model = {};
    cyclic.self = cyclic;
    rejects(cyclic, "INVALID_CONTRACT");
    rejects(edit(document(), [...schemaPath, "example"], new Array(2)), "INVALID_CONTRACT");
    rejects(edit(document(), [...schemaPath, "example"], Infinity), "INVALID_CONTRACT");
    const untrustedArray: unknown[] = [];
    Object.setPrototypeOf(untrustedArray, {
      [Symbol.iterator]: () => {
        throw new Error("must not execute");
      },
    });
    rejects(document(scalar({ example: untrustedArray })), "INVALID_CONTRACT");
  });

  it("handles prototype-sensitive property names as data without prototype mutation", () => {
    const base = document(objectSchema());
    const next = document(
      JSON.parse(
        '{"type":"object","additionalProperties":false,"properties":{"__proto__":{"type":"string"},"constructor":{"type":"string"}}}',
      ),
    );
    const result = compareContracts(base, next);
    expect(result.deltas).toHaveLength(2);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });

  it("bounds deep and large JSON trees before recursive schema comparison", () => {
    let deep: unknown = "leaf";
    for (let index = 0; index < CONTRACT_LIMITS.depth + 1; index++) deep = { child: deep };
    rejects(edit(document(), [...schemaPath, "example"], deep), "CONTRACT_LIMIT_EXCEEDED");
    rejects(
      edit(
        document(),
        [...schemaPath, "example"],
        Array.from({ length: CONTRACT_LIMITS.nodes }, () => 0),
      ),
      "CONTRACT_LIMIT_EXCEEDED",
    );
    rejects(
      edit(document(), [...schemaPath, "example"], "x".repeat(65_537)),
      "CONTRACT_LIMIT_EXCEEDED",
    );
  });

  it("bounds operation count", () => {
    const op = { responses: { "200": { description: "OK" } } };
    const paths = Object.fromEntries(
      Array.from({ length: CONTRACT_LIMITS.operations + 1 }, (_, index) => [
        `/operation-${index}`,
        { get: op },
      ]),
    );
    rejects({ ...document(), paths }, "CONTRACT_LIMIT_EXCEEDED");
  });

  it("bounds emitted deltas before returning a large partial result", () => {
    const properties = Object.fromEntries(
      Array.from({ length: CONTRACT_LIMITS.deltas + 1 }, (_, index) => [`p${index}`, scalar()]),
    );
    rejects(document(objectSchema(properties)), "CONTRACT_LIMIT_EXCEEDED");
  });

  it("propagates cancellation/deadline checks without returning partial findings", () => {
    const cancelled = new Error("test cancellation sentinel");
    let calls = 0;
    expect(() =>
      compareContracts(mercuryV1, mercuryV2, () => {
        if (++calls === 20) throw cancelled;
      }),
    ).toThrow(cancelled);
    expect(calls).toBe(20);
  });
});
