import { describe, expect, it } from "vitest";

import { sha256Bytes, treeDigest } from "./digests.js";

const bytes = (value: string) => new TextEncoder().encode(value);

describe("actual-byte SHA-256", () => {
  it("matches established empty and ASCII test vectors", () => {
    expect(sha256Bytes(bytes(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Bytes(bytes("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("preserves whitespace, encoding, and Windows newline differences", () => {
    expect(sha256Bytes(bytes("a\nb"))).not.toBe(sha256Bytes(bytes("a\r\nb")));
    expect(sha256Bytes(bytes('{"a":1}'))).not.toBe(sha256Bytes(bytes('{ "a": 1 }')));
  });
});

describe("documented artifact tree serialization", () => {
  const a = { path: "fixtures/a.json", sha256: sha256Bytes(bytes("a")) };
  const b = { path: "fixtures/b.json", sha256: sha256Bytes(bytes("b")) };

  it("uses sorted paths, colons, one LF per record, and no implicit manifest", () => {
    const expected = sha256Bytes(bytes(`${a.path}:${a.sha256}\n${b.path}:${b.sha256}\n`));
    expect(treeDigest([b, a])).toBe(expected);
    expect(treeDigest([a, b])).toBe(expected);
  });

  it("changes when bytes or an artifact path change", () => {
    expect(treeDigest([a, b])).not.toBe(
      treeDigest([a, { ...b, sha256: sha256Bytes(bytes("changed")) }]),
    );
    expect(treeDigest([a, b])).not.toBe(treeDigest([a, { ...b, path: "fixtures/c.json" }]));
  });

  it("rejects empty, duplicated, malformed, and traversing references", () => {
    expect(() => treeDigest([])).toThrow("at least one artifact");
    expect(() => treeDigest([a, a])).toThrow("duplicate paths");
    expect(() => treeDigest([{ ...a, sha256: "fake" }])).toThrow();
    expect(() => treeDigest([{ ...a, path: "../a.json" }])).toThrow();
  });
});
