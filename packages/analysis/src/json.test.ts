import { describe, expect, it } from "vitest";

import { InputError } from "./errors.ts";
import { decodeUtf8, JSON_LIMITS, parseBoundedJson } from "./json.ts";

describe("bounded JSON data parsing", () => {
  it("parses supported JSON without changing decoded values", () => {
    const text = String.raw`{"s":"Unicode 雪 😀 \u0061 \"","n":-1.25e2,"a":[true,false,null,{}]}`;
    expect(parseBoundedJson(text)).toEqual(JSON.parse(text));
    expect(parseBoundedJson(" \r\n\t42\t ")).toBe(42);
  });

  it.each([
    "",
    "undefined",
    "NaN",
    "Infinity",
    "01",
    "1.",
    "--1",
    "true false",
    '{"a":1,}',
    "{a:1}",
    '{"a" 1}',
    "[1,]",
    '"unterminated',
    '"bad\\escape"',
    '"raw\nnewline"',
    '{"a":1}//comment',
  ])("rejects malformed JSON %j", (text) => {
    expect(() => parseBoundedJson(text)).toThrow(new InputError("INVALID_JSON"));
  });

  it.each(['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"x":{"a":1,"a":2}}'])(
    "rejects duplicate decoded keys %s",
    (text) => {
      expect(() => parseBoundedJson(text)).toThrow(new InputError("DUPLICATE_JSON_KEY"));
    },
  );

  it.each(["__proto__", "constructor", "prototype"])("rejects unsafe object key %s", (key) => {
    expect(() => parseBoundedJson(`{"${key}":{}}`)).toThrow(new InputError("UNSAFE_JSON_KEY"));
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("permits independent repeated keys in separate objects", () => {
    expect(parseBoundedJson('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("bounds depth, total nodes, token size, text size, and numeric overflow", () => {
    expect(() => parseBoundedJson("[".repeat(49) + "0" + "]".repeat(49))).toThrow(
      new InputError("JSON_DEPTH_LIMIT"),
    );
    expect(() => parseBoundedJson(`[${Array<string>(50_000).fill("0").join(",")}]`)).toThrow(
      new InputError("JSON_NODE_LIMIT"),
    );
    expect(() => parseBoundedJson(JSON.stringify("x".repeat(JSON_LIMITS.maxTokenUnits)))).toThrow(
      new InputError("JSON_TOKEN_LIMIT"),
    );
    expect(() => parseBoundedJson("1".repeat(JSON_LIMITS.maxTokenUnits + 1))).toThrow(
      new InputError("JSON_TOKEN_LIMIT"),
    );
    expect(() => parseBoundedJson(" ".repeat(JSON_LIMITS.maxTextUnits + 1))).toThrow(
      new InputError("JSON_SIZE_LIMIT"),
    );
    expect(() => parseBoundedJson("1e9999")).toThrow(new InputError("NONFINITE_JSON_NUMBER"));
  });

  it("invokes cancellation/budget checks during large tokens and whitespace", () => {
    for (const text of ['"' + "a".repeat(20_000) + '"', " ".repeat(20_000) + "0"]) {
      let calls = 0;
      expect(() =>
        parseBoundedJson(text, () => {
          if (++calls > 5) throw new InputError("CANCELLED");
        }),
      ).toThrow(new InputError("CANCELLED"));
    }
  });
});

describe("exact UTF-8 decoding", () => {
  it("preserves CRLF and Unicode with exact byte round trip", () => {
    const text = "// 雪 😀\r\nconst x = 1;\n";
    const bytes = new TextEncoder().encode(text);
    expect(decodeUtf8(bytes)).toBe(text);
    expect(new TextEncoder().encode(decodeUtf8(bytes))).toEqual(bytes);
  });

  it.each([[0xff], [0xc0, 0xaf], [0xe2, 0x82], [0xed, 0xa0, 0x80]])(
    "rejects malformed UTF-8 bytes %j",
    (...bytes) => {
      expect(() => decodeUtf8(new Uint8Array(bytes))).toThrow(new InputError("INVALID_UTF8"));
    },
  );

  it("rejects BOM and NUL instead of silently normalizing", () => {
    expect(() => decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toThrow(
      new InputError("UTF8_BOM_UNSUPPORTED"),
    );
    expect(() => parseBoundedJson("\ufeff{}")).toThrow(new InputError("UTF8_BOM_UNSUPPORTED"));
    expect(() => decodeUtf8(new Uint8Array([97, 0, 98]))).toThrow(new InputError("NUL_BYTE"));
  });
});
