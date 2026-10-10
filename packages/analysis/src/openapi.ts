/** Strict, local-data-only OpenAPI 3.0.3 comparison; no reference resolver exists. */
export const CONTRACT_LIMITS = Object.freeze({
  depth: 48,
  nodes: 50_000,
  operations: 512,
  deltas: 4096,
});

export type ContractErrorCode =
  "INVALID_CONTRACT" | "UNSUPPORTED_CONTRACT" | "CONTRACT_LIMIT_EXCEEDED";

export class ContractError extends Error {
  readonly code: ContractErrorCode;
  readonly pointer: string;

  constructor(code: ContractErrorCode, pointer = "") {
    super(code);
    this.name = "ContractError";
    this.code = code;
    this.pointer = pointer;
  }
}

export interface ContractDelta {
  ruleId: string;
  kind: string;
  compatibility: "breaking" | "nonbreaking" | "unknown";
  support: "supported" | "unsupported";
  method: string;
  path: string;
  oldPointer?: string;
  newPointer?: string;
  rationale: string;
}

export interface ContractOperation {
  method: string;
  path: string;
  pointer: string;
}

export interface ContractComparison {
  deltas: ContractDelta[];
  /** Only baseline operations: the tracing/linking scope for existing consumers. */
  operations: ContractOperation[];
}

type JsonObject = Record<string, unknown>;
type Direction = "request" | "response";
type Primitive = {
  type: "string" | "integer";
  pointer: string;
  minimum: number;
  maximum: number;
  format?: "email";
  enumValues?: ReadonlyArray<string | number>;
  enumSet?: ReadonlySet<string | number>;
};
type ObjectSchema = {
  type: "object";
  pointer: string;
  properties: Map<string, Schema>;
  required: Set<string>;
  additionalProperties: boolean;
};
type Schema = Primitive | ObjectSchema;
type Operation = ContractOperation & {
  request?: { required: boolean; pointer: string; schema: Schema };
  responses: Map<string, { pointer: string; schema?: Schema }>;
};
type Contract = { operations: Map<string, Operation>; servers: string[] };

const methods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const own = (object: JsonObject, key: string) => Object.hasOwn(object, key);
const sorted = (values: Iterable<string>) => [...values].sort();
const escapePointer = (part: string) => part.replaceAll("~", "~0").replaceAll("/", "~1");
const at = (pointer: string, part: string) => `${pointer}/${escapePointer(part)}`;
const hasSpaceOrControl = (value: string) =>
  /\s/.test(value) ||
  Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
function fail(pointer: string, code: ContractErrorCode = "INVALID_CONTRACT"): never {
  throw new ContractError(code, pointer);
}

function object(value: unknown, pointer: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail(pointer);
  return value as JsonObject;
}

function keys(value: JsonObject, allowed: readonly string[], pointer: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(at(pointer, key), "UNSUPPORTED_CONTRACT");
  }
}

function string(value: unknown, pointer: string, nonempty = false): string {
  if (typeof value !== "string" || (nonempty && value.length === 0)) return fail(pointer);
  return value;
}

function boolean(value: unknown, pointer: string): boolean {
  if (typeof value !== "boolean") return fail(pointer);
  return value;
}

function integer(value: unknown, pointer: string, nonnegative = false): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || (nonnegative && value < 0)) {
    return fail(pointer);
  }
  return value;
}

function annotations(value: JsonObject, pointer: string): void {
  for (const key of ["title", "summary", "description", "operationId"]) {
    if (own(value, key)) string(value[key], at(pointer, key));
  }
  if (own(value, "deprecated")) boolean(value.deprecated, at(pointer, "deprecated"));
}

/** Audit the entire JSON-shaped tree, including metadata and ignored examples. */
function auditJson(value: unknown, check: () => void): void {
  let nodes = 0;
  const active = new Set<object>();
  function visit(current: unknown, pointer: string, depth: number): void {
    check();
    if (++nodes > CONTRACT_LIMITS.nodes || depth > CONTRACT_LIMITS.depth || pointer.length > 4096) {
      fail(pointer.slice(0, 4096), "CONTRACT_LIMIT_EXCEEDED");
    }
    if (typeof current === "string") {
      if (current.length > 65_536) fail(pointer, "CONTRACT_LIMIT_EXCEEDED");
      return;
    }
    if (current === null || typeof current === "boolean") return;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) fail(pointer);
      return;
    }
    if (typeof current !== "object") return fail(pointer);
    if (active.has(current)) return fail(pointer);
    const prototype = Object.getPrototypeOf(current);
    if (
      Array.isArray(current)
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    ) {
      fail(pointer);
    }
    active.add(current);
    const descriptors = Object.getOwnPropertyDescriptors(current);
    if (Object.getOwnPropertySymbols(current).length > 0) fail(pointer);
    if (Array.isArray(current)) {
      if (Object.keys(descriptors).length !== current.length + 1) fail(pointer);
      for (let index = 0; index < current.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor)) fail(at(pointer, String(index)));
        visit(descriptor.value, at(pointer, String(index)), depth + 1);
      }
    } else {
      for (const key of Object.keys(descriptors)) {
        if (key.length > 512) fail(pointer, "CONTRACT_LIMIT_EXCEEDED");
        const next = at(pointer, key);
        if (key === "$ref") fail(next, "UNSUPPORTED_CONTRACT");
        const descriptor = descriptors[key];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(next);
        visit(descriptor.value, next, depth + 1);
      }
    }
    active.delete(current);
  }
  visit(value, "", 0);
}

function schema(value: unknown, pointer: string, check: () => void): Schema {
  check();
  const raw = object(value, pointer);
  annotations(raw, pointer);
  const common = ["type", "title", "description", "example", "deprecated"];
  if (raw.type === "object") {
    keys(raw, [...common, "properties", "required", "additionalProperties"], pointer);
    const props = own(raw, "properties") ? object(raw.properties, at(pointer, "properties")) : {};
    const properties = new Map<string, Schema>();
    for (const name of sorted(Object.keys(props))) {
      properties.set(name, schema(props[name], at(at(pointer, "properties"), name), check));
    }
    const required = new Set<string>();
    if (own(raw, "required")) {
      if (!Array.isArray(raw.required) || raw.required.length === 0) fail(at(pointer, "required"));
      for (const name of raw.required) {
        const key = string(name, at(pointer, "required"), true);
        if (required.has(key)) fail(at(pointer, "required"));
        if (!properties.has(key)) fail(at(pointer, "required"), "UNSUPPORTED_CONTRACT");
        required.add(key);
      }
    }
    return {
      type: "object",
      pointer,
      properties,
      required,
      additionalProperties: own(raw, "additionalProperties")
        ? boolean(raw.additionalProperties, at(pointer, "additionalProperties"))
        : true,
    };
  }
  if (raw.type !== "string" && raw.type !== "integer") {
    fail(at(pointer, "type"), own(raw, "type") ? "UNSUPPORTED_CONTRACT" : "INVALID_CONTRACT");
  }
  const isString = raw.type === "string";
  keys(
    raw,
    [
      ...common,
      "enum",
      ...(isString ? ["minLength", "maxLength", "format"] : ["minimum", "maximum"]),
    ],
    pointer,
  );
  if (own(raw, "format") && raw.format !== "email")
    fail(at(pointer, "format"), "UNSUPPORTED_CONTRACT");
  const minKey = isString ? "minLength" : "minimum";
  const maxKey = isString ? "maxLength" : "maximum";
  const minimum = own(raw, minKey)
    ? integer(raw[minKey], at(pointer, minKey), isString)
    : isString
      ? 0
      : -Infinity;
  const maximum = own(raw, maxKey) ? integer(raw[maxKey], at(pointer, maxKey), isString) : Infinity;
  if (minimum > maximum) fail(pointer);
  const result: Primitive = {
    type: raw.type,
    pointer,
    minimum,
    maximum,
    ...(raw.format === "email" ? { format: "email" as const } : {}),
  };
  if (own(raw, "enum")) {
    if (!Array.isArray(raw.enum) || raw.enum.length === 0) fail(at(pointer, "enum"));
    const values: Array<string | number> = raw.enum.map((item: unknown) =>
      isString ? string(item, at(pointer, "enum")) : integer(item, at(pointer, "enum")),
    );
    if (new Set(values).size !== values.length) fail(at(pointer, "enum"));
    if (values.some((item) => !accepts(result, item))) fail(at(pointer, "enum"));
    result.enumValues = values;
    result.enumSet = new Set(values);
  }
  return result;
}

function accepts(model: Primitive, value: string | number): boolean {
  if (model.type === "string" ? typeof value !== "string" : typeof value !== "number") return false;
  const metric = typeof value === "string" ? Array.from(value).length : value;
  return (
    metric >= model.minimum &&
    metric <= model.maximum &&
    (!model.enumSet || model.enumSet.has(value))
  );
}

/** Exact domain inclusion for this primitive subset, including enum/bound interactions. */
function subset(left: Primitive, right: Primitive, check: () => void): boolean {
  if (left.type !== right.type) return false;
  if (left.enumValues)
    return left.enumValues.every((value) => {
      check();
      return accepts(right, value);
    });
  if (right.enumValues) {
    if (left.type === "string")
      return left.minimum === 0 && left.maximum === 0 && accepts(right, "");
    const count = left.maximum - left.minimum + 1;
    return (
      Number.isFinite(count) &&
      count <= right.enumValues.length &&
      right.enumValues.filter((value) => {
        check();
        return accepts(left, value);
      }).length === count
    );
  }
  return left.minimum >= right.minimum && left.maximum <= right.maximum;
}

function media(value: unknown, pointer: string, check: () => void): Schema {
  const content = object(value, pointer);
  keys(content, ["application/json"], pointer);
  if (!own(content, "application/json")) fail(pointer, "UNSUPPORTED_CONTRACT");
  const mediaPointer = at(pointer, "application/json");
  const raw = object(content["application/json"], mediaPointer);
  keys(raw, ["schema", "example"], mediaPointer);
  return schema(raw.schema, at(mediaPointer, "schema"), check);
}

function contract(value: unknown, check: () => void): Contract {
  auditJson(value, check);
  const raw = object(value, "");
  keys(raw, ["openapi", "info", "servers", "paths"], "");
  if (raw.openapi !== "3.0.3") fail("/openapi", "UNSUPPORTED_CONTRACT");
  const info = object(raw.info, "/info");
  keys(info, ["title", "version", "description"], "/info");
  string(info.title, "/info/title", true);
  string(info.version, "/info/version", true);
  annotations(info, "/info");
  const servers: string[] = [];
  if (own(raw, "servers")) {
    if (!Array.isArray(raw.servers) || raw.servers.length === 0) fail("/servers");
    for (let index = 0; index < raw.servers.length; index++) {
      const pointer = `/servers/${index}`;
      const server = object(raw.servers[index], pointer);
      keys(server, ["url", "description"], pointer);
      const url = string(server.url, `${pointer}/url`, true);
      if (/[{}]/.test(url) || hasSpaceOrControl(url))
        fail(`${pointer}/url`, "UNSUPPORTED_CONTRACT");
      servers.push(url);
      annotations(server, pointer);
    }
  } else servers.push("/");
  const paths = object(raw.paths, "/paths");
  const operations = new Map<string, Operation>();
  const operationIds = new Set<string>();
  for (const path of sorted(Object.keys(paths))) {
    check();
    const pointer = at("/paths", path);
    if (!path.startsWith("/") || /[{}?#\\]/.test(path) || hasSpaceOrControl(path))
      fail(pointer, "UNSUPPORTED_CONTRACT");
    const pathItem = object(paths[path], pointer);
    keys(pathItem, [...methods, "summary", "description"], pointer);
    annotations(pathItem, pointer);
    for (const method of methods) {
      if (!own(pathItem, method)) continue;
      check();
      if (operations.size >= CONTRACT_LIMITS.operations) fail(pointer, "CONTRACT_LIMIT_EXCEEDED");
      const opPointer = at(pointer, method);
      const op = object(pathItem[method], opPointer);
      keys(
        op,
        ["operationId", "summary", "description", "deprecated", "requestBody", "responses"],
        opPointer,
      );
      annotations(op, opPointer);
      if (own(op, "operationId")) {
        const id = string(op.operationId, at(opPointer, "operationId"), true);
        if (operationIds.has(id)) fail(at(opPointer, "operationId"));
        operationIds.add(id);
      }
      const result: Operation = {
        method: method.toUpperCase(),
        path,
        pointer: opPointer,
        responses: new Map(),
      };
      if (own(op, "requestBody")) {
        const requestPointer = at(opPointer, "requestBody");
        const request = object(op.requestBody, requestPointer);
        keys(request, ["description", "required", "content"], requestPointer);
        annotations(request, requestPointer);
        result.request = {
          required: own(request, "required")
            ? boolean(request.required, at(requestPointer, "required"))
            : false,
          pointer: requestPointer,
          schema: media(request.content, at(requestPointer, "content"), check),
        };
      }
      const responsesPointer = at(opPointer, "responses");
      const responses = object(op.responses, responsesPointer);
      if (Object.keys(responses).length === 0) fail(responsesPointer);
      for (const status of sorted(Object.keys(responses))) {
        const responsePointer = at(responsesPointer, status);
        if (!/^[1-5]\d\d$/.test(status)) fail(responsePointer, "UNSUPPORTED_CONTRACT");
        const response = object(responses[status], responsePointer);
        keys(response, ["description", "content"], responsePointer);
        string(response.description, at(responsePointer, "description"));
        result.responses.set(status, {
          pointer: responsePointer,
          ...(own(response, "content")
            ? { schema: media(response.content, at(responsePointer, "content"), check) }
            : {}),
        });
      }
      operations.set(`${result.method} ${path}`, result);
    }
  }
  return { operations, servers };
}

/** Validate both complete inputs before emitting any structural finding. */
export function compareContracts(
  base: unknown,
  candidate: unknown,
  check: () => void = () => {},
): ContractComparison {
  const before = contract(base, check);
  const after = contract(candidate, check);
  if (JSON.stringify(before.servers) !== JSON.stringify(after.servers))
    fail("/servers", "UNSUPPORTED_CONTRACT");
  const deltas: ContractDelta[] = [];
  function emit(
    op: ContractOperation,
    kind: string,
    compatibility: ContractDelta["compatibility"],
    rationale: string,
    oldPointer?: string,
    newPointer?: string,
  ): void {
    check();
    if (deltas.length >= CONTRACT_LIMITS.deltas) fail(op.pointer, "CONTRACT_LIMIT_EXCEEDED");
    deltas.push({
      ruleId: `openapi.${kind}.v1`,
      kind,
      compatibility,
      support: compatibility === "unknown" ? "unsupported" : "supported",
      method: op.method,
      path: op.path,
      ...(oldPointer === undefined ? {} : { oldPointer }),
      ...(newPointer === undefined ? {} : { newPointer }),
      rationale,
    });
  }
  function compareSchema(left: Schema, right: Schema, direction: Direction, op: Operation): void {
    check();
    if (left.type !== right.type) {
      const opaqueFormat =
        (left.type !== "object" && left.format !== undefined) ||
        (right.type !== "object" && right.format !== undefined);
      emit(
        op,
        `${direction}-type-changed`,
        opaqueFormat ? "unknown" : "breaking",
        opaqueFormat
          ? "The declared type changes, but an opaque format constraint prevents a supported domain-compatibility claim."
          : "The declared value type changes to a disjoint supported type; this is a structural compatibility risk, not runtime proof.",
        left.pointer,
        right.pointer,
      );
      return;
    }
    if (left.type !== "object" && right.type !== "object") {
      if (left.format !== right.format) {
        emit(
          op,
          `${direction}-format-changed`,
          "unknown",
          "The email format marker changes. This comparator does not validate format semantics and cannot establish directional compatibility.",
          left.pointer,
          right.pointer,
        );
        return;
      }
      const oldWithinNew = subset(left, right, check);
      const newWithinOld = subset(right, left, check);
      if (oldWithinNew && newWithinOld) return;
      const safe = direction === "request" ? oldWithinNew : newWithinOld;
      emit(
        op,
        `${direction}-value-constraints-changed`,
        safe ? "nonbreaking" : left.format ? "unknown" : "breaking",
        !safe && left.format
          ? "Primitive bounds or enum constraints change, but the unchanged opaque email format prevents demonstrating a compatible or incompatible value witness."
          : direction === "request"
            ? safe
              ? "All previously declared primitive request values remain accepted by the supported constraints."
              : "Some previously declared primitive request values are excluded by the supported constraints."
            : safe
              ? "The declared primitive response domain remains within the old consumer contract."
              : "The declared primitive response domain permits values outside the old consumer contract.",
        left.pointer,
        right.pointer,
      );
      return;
    }
    if (left.type !== "object" || right.type !== "object") return;
    if (left.additionalProperties !== right.additionalProperties) {
      const tighter = !right.additionalProperties;
      emit(
        op,
        `${direction}-additional-properties-changed`,
        (direction === "request" ? tighter : !tighter) ? "breaking" : "nonbreaking",
        "The allowance for undeclared JSON object properties changes; requests and responses use opposite compatibility directions.",
        left.pointer,
        right.pointer,
      );
    }
    for (const name of sorted(new Set([...left.properties.keys(), ...right.properties.keys()]))) {
      check();
      const oldProp = left.properties.get(name);
      const newProp = right.properties.get(name);
      if (!oldProp && newProp) {
        const compatibility =
          direction === "request"
            ? right.required.has(name)
              ? "breaking"
              : left.additionalProperties
                ? "unknown"
                : "nonbreaking"
            : left.additionalProperties
              ? "nonbreaking"
              : "breaking";
        emit(
          op,
          `${direction}-property-added`,
          compatibility,
          direction === "request"
            ? right.required.has(name)
              ? "A new required request property excludes old callers that omit it."
              : left.additionalProperties
                ? "The added optional field constrains a previously undeclared extension property; this subset does not claim compatibility for existing extension-field callers."
                : "The new request property is optional, so existing declared callers need not send it."
            : left.additionalProperties
              ? "The new response property remains permitted by the old open object contract."
              : "The new response property may violate the old contract's rejection of additional properties.",
          left.pointer,
          newProp.pointer,
        );
      } else if (oldProp && !newProp) {
        const breaking =
          direction === "request"
            ? !right.additionalProperties
            : left.required.has(name) || right.additionalProperties;
        emit(
          op,
          `${direction}-property-removed`,
          breaking ? "breaking" : "nonbreaking",
          direction === "request"
            ? right.additionalProperties
              ? "The removed request-property constraint leaves its values permitted as additional properties."
              : "Previously declared request values containing this property are no longer permitted."
            : left.required.has(name)
              ? "The old required response property is no longer guaranteed."
              : right.additionalProperties
                ? "A formerly constrained response property can now carry unconstrained additional-property values."
                : "An optional response property is removed without permitting new values outside the old contract.",
          oldProp.pointer,
          right.pointer,
        );
      } else if (oldProp && newProp) {
        const wasRequired = left.required.has(name);
        const isRequired = right.required.has(name);
        if (wasRequired !== isRequired) {
          emit(
            op,
            `${direction}-property-required-changed`,
            (direction === "request" ? isRequired : !isRequired) ? "breaking" : "nonbreaking",
            "The property's presence requirement changes; adding a request requirement tightens input, while removing a response guarantee weakens output.",
            oldProp.pointer,
            newProp.pointer,
          );
        }
        compareSchema(oldProp, newProp, direction, op);
      }
    }
  }
  for (const key of sorted(new Set([...before.operations.keys(), ...after.operations.keys()]))) {
    check();
    const left = before.operations.get(key);
    const right = after.operations.get(key);
    if (left && !right) {
      emit(
        left,
        "operation-removed",
        "breaking",
        "This operation is absent from the candidate contract. Contract omission does not prove a live endpoint was retired or renamed.",
        left.pointer,
      );
      continue;
    }
    if (!left && right) {
      emit(
        right,
        "operation-added",
        "nonbreaking",
        "A new operation is declared. Its addition establishes no semantic correspondence with any removed operation.",
        undefined,
        right.pointer,
      );
      continue;
    }
    if (!left || !right) continue;
    if (left.request && right.request) {
      if (left.request.required !== right.request.required) {
        emit(
          left,
          "request-body-required-changed",
          right.request.required ? "breaking" : "nonbreaking",
          "The JSON request body's required presence changes.",
          left.request.pointer,
          right.request.pointer,
        );
      }
      compareSchema(left.request.schema, right.request.schema, "request", left);
    } else if (right.request) {
      emit(
        left,
        "request-body-added",
        right.request.required ? "breaking" : "unknown",
        right.request.required
          ? "A newly required JSON body imposes a new obligation on existing declared callers."
          : "An optional JSON body schema is newly declared, but the old contract did not define existing body semantics; compatibility remains unknown.",
        left.pointer,
        right.request.pointer,
      );
    } else if (left.request) {
      emit(
        left,
        "request-body-removed",
        "unknown",
        "An omitted request-body definition alone does not specify whether existing request bodies are rejected.",
        left.request.pointer,
        right.pointer,
      );
    }
    for (const status of sorted(new Set([...left.responses.keys(), ...right.responses.keys()]))) {
      check();
      const oldResponse = left.responses.get(status);
      const newResponse = right.responses.get(status);
      if (!oldResponse && newResponse) {
        emit(
          left,
          "response-status-added",
          "breaking",
          "The declared response alternatives now include a status outside the old contract; strict old clients may not handle it.",
          at(left.pointer, "responses"),
          newResponse.pointer,
        );
      } else if (oldResponse && !newResponse) {
        emit(
          left,
          "response-status-removed",
          "nonbreaking",
          "Removing a response alternative narrows the declared output domain; this does not establish business equivalence or availability.",
          oldResponse.pointer,
          at(right.pointer, "responses"),
        );
      } else if (oldResponse && newResponse) {
        if (oldResponse.schema && newResponse.schema)
          compareSchema(oldResponse.schema, newResponse.schema, "response", left);
        else if (oldResponse.schema || newResponse.schema)
          emit(
            left,
            "response-body-definition-changed",
            "unknown",
            "The presence or absence of a response content schema is outside this subset's body-compatibility guarantees.",
            oldResponse.pointer,
            newResponse.pointer,
          );
      }
    }
  }
  const order = (item: ContractDelta) =>
    `${item.method}\u0000${item.path}\u0000${item.ruleId}\u0000${item.oldPointer ?? ""}\u0000${item.newPointer ?? ""}`;
  deltas.sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
  return {
    deltas,
    operations: sorted(before.operations.keys()).map((key) => {
      const op = before.operations.get(key)!;
      return { method: op.method, path: op.path, pointer: op.pointer };
    }),
  };
}
