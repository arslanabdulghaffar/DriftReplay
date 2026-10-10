import { InputError } from "./errors.ts";

export const JSON_LIMITS = Object.freeze({
  maxDepth: 48,
  maxTokenUnits: 65_536,
  maxNodes: 50_000,
  maxTextUnits: 2 * 1024 * 1024,
});

/** No BOM normalization: the text corresponds exactly to the captured UTF-8 bytes. */
export function decodeUtf8(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) throw new InputError("INVALID_BYTES");
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new InputError("UTF8_BOM_UNSUPPORTED");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new InputError("INVALID_UTF8");
  }
  if (text.includes("\0")) throw new InputError("NUL_BYTE");
  return text;
}

/**
 * A bounded JSON data parser. It rejects duplicate decoded keys before object construction,
 * including escaped equivalents, and never invokes object hooks or resolves references.
 */
export function parseBoundedJson(text: string, check: () => void = () => {}): unknown {
  if (typeof text !== "string") throw new InputError("INVALID_JSON_INPUT");
  if (text.length > JSON_LIMITS.maxTextUnits) throw new InputError("JSON_SIZE_LIMIT");
  if (text.charCodeAt(0) === 0xfeff) throw new InputError("UTF8_BOM_UNSUPPORTED");
  let offset = 0;
  let nodes = 0;
  const fail = (): never => {
    throw new InputError("INVALID_JSON");
  };
  const tick = () => {
    if ((offset & 1023) === 0) check();
  };
  const whitespace = () => {
    while (/^[\x20\t\r\n]$/.test(text[offset] ?? "")) {
      offset++;
      tick();
    }
  };
  const string = (): string => {
    const start = offset;
    if (text[offset++] !== '"') return fail();
    let escaped = false;
    while (offset < text.length) {
      tick();
      const character = text[offset++];
      if (offset - start > JSON_LIMITS.maxTokenUnits) {
        throw new InputError("JSON_TOKEN_LIMIT");
      }
      if (!escaped && character === '"') {
        try {
          return JSON.parse(text.slice(start, offset)) as string;
        } catch {
          return fail();
        }
      }
      if (!escaped && character === "\\") escaped = true;
      else escaped = false;
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    check();
    if (depth > JSON_LIMITS.maxDepth) throw new InputError("JSON_DEPTH_LIMIT");
    if (++nodes > JSON_LIMITS.maxNodes) throw new InputError("JSON_NODE_LIMIT");
    whitespace();
    const character = text[offset];
    if (character === '"') return string();
    if (character === "{") {
      offset++;
      whitespace();
      const result: Record<string, unknown> = {};
      const keys = new Set<string>();
      if (text[offset] === "}") {
        offset++;
        return result;
      }
      while (true) {
        const key = string();
        if (keys.has(key)) throw new InputError("DUPLICATE_JSON_KEY");
        if (["__proto__", "constructor", "prototype"].includes(key)) {
          throw new InputError("UNSAFE_JSON_KEY");
        }
        keys.add(key);
        whitespace();
        if (text[offset++] !== ":") return fail();
        result[key] = value(depth + 1);
        whitespace();
        const separator = text[offset++];
        if (separator === "}") return result;
        if (separator !== ",") return fail();
        whitespace();
      }
    }
    if (character === "[") {
      offset++;
      whitespace();
      const result: unknown[] = [];
      if (text[offset] === "]") {
        offset++;
        return result;
      }
      while (true) {
        result.push(value(depth + 1));
        whitespace();
        const separator = text[offset++];
        if (separator === "]") return result;
        if (separator !== ",") return fail();
      }
    }
    for (const [token, parsed] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (text.startsWith(token, offset)) {
        offset += token.length;
        return parsed;
      }
    }
    const start = offset;
    while (/^[0-9eE+.-]$/.test(text[offset] ?? "")) {
      offset++;
      tick();
      if (offset - start > JSON_LIMITS.maxTokenUnits) {
        throw new InputError("JSON_TOKEN_LIMIT");
      }
    }
    if (start === offset) return fail();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.slice(start, offset)) as unknown;
    } catch {
      return fail();
    }
    if (typeof parsed !== "number") return fail();
    if (!Number.isFinite(parsed)) throw new InputError("NONFINITE_JSON_NUMBER");
    return parsed;
  };
  check();
  const result = value(0);
  whitespace();
  if (offset !== text.length) return fail();
  check();
  return result;
}
