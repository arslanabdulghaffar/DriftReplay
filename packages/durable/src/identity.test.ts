import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stoppedResult } from "../../analysis/src/analysis.ts";
import { FIXTURE_SELECTIONS } from "../../analysis/src/fixture.ts";
import { captureLocalInputs, type CapturedInput } from "../../analysis/src/ingestion.ts";
import { sha256 } from "../../analysis/src/identity.ts";
import { POLICY_HASH } from "../../analysis/src/policy.ts";
import { makeManifest, verifyManifest } from "./identity.ts";

const workspace = "3dc12df4-cd5e-4e42-808a-b69d985a55d9";
const bytes = (text: string) => new TextEncoder().encode(text);
const captured = (): CapturedInput[] => [
  { path: "base.json", role: "base-contract", bytes: bytes("not supported A") },
  { path: "candidate.json", role: "candidate-contract", bytes: bytes("not supported B") },
  { path: "source.ts", role: "source", bytes: bytes("function source() {}") },
];
describe("independent durable input/request identities", () => {
  it("binds actual MercuryPay raw bytes and analyzer metadata in canonical order", async () => {
    const input = await captureLocalInputs(resolve("."), FIXTURE_SELECTIONS);
    const actual = makeManifest(workspace, input);
    expect(actual.policyHash).toBe(POLICY_HASH);
    expect(actual.manifest.map((entry) => entry.path)).toEqual(
      input.map((entry) => entry.path).sort(),
    );
    for (const entry of actual.manifest) {
      const original = input.find((item) => item.path === entry.path)!;
      expect(entry.sha256).toBe(sha256(original.bytes));
      expect(entry.byteLength).toBe(original.bytes.byteLength);
    }
    expect(actual).toEqual(makeManifest(workspace, [...input].reverse()));
    expect(verifyManifest(actual, workspace)).toEqual(actual);
    expect(Object.isFrozen(actual.manifest[0])).toBe(true);
  });
  it("changes identity with workspace, source content and role/path while retaining diagnostic separation", () => {
    const original = captured();
    const first = makeManifest(workspace, original);
    original[0]!.bytes[0] = 33;
    const second = makeManifest(workspace, original);
    expect(second.requestKey).not.toBe(first.requestKey);
    expect(second.inputSetDigest).not.toBe(first.inputSetDigest);
    expect(makeManifest(randomUUID(), captured()).requestKey).not.toBe(first.requestKey);
    const renamed = captured();
    renamed[2] = { ...renamed[2]!, path: "renamed.ts" };
    expect(makeManifest(workspace, renamed).requestKey).not.toBe(first.requestKey);
    const swapped = captured();
    swapped[0] = { ...swapped[0]!, role: "candidate-contract" };
    swapped[1] = { ...swapped[1]!, role: "base-contract" };
    expect(makeManifest(workspace, swapped).requestKey).not.toBe(first.requestKey);
    expect(stoppedResult("INVALID_JSON").runDigest).not.toBe(first.requestKey);
    expect(stoppedResult("INVALID_JSON").runDigest).not.toBe(second.requestKey);
  });
  it.each(["requestKey", "inputSetDigest", "policyHash"])("rejects forged %s", (field) => {
    const good = makeManifest(workspace, captured());
    expect(() => verifyManifest({ ...good, [field]: "a".repeat(64) }, workspace)).toThrow(
      "INVALID_MANIFEST",
    );
  });
  it("rejects mismatched scope, altered entry bytes metadata, unknown fields and unsorted manifests", () => {
    const good = makeManifest(workspace, captured());
    expect(() => verifyManifest(good, randomUUID())).toThrow("INVALID_MANIFEST");
    expect(() => verifyManifest({ ...good, tenant: "privileged" })).toThrow("INVALID_MANIFEST");
    expect(() => verifyManifest({ ...good, manifest: [...good.manifest].reverse() })).toThrow(
      "INVALID_MANIFEST",
    );
    expect(() => verifyManifest({ ...good, engine: { ...good.engine, version: "0.1.0" } })).toThrow(
      "INVALID_MANIFEST",
    );
    expect(() =>
      verifyManifest({
        ...good,
        manifest: good.manifest.map((entry, index) =>
          index ? entry : { ...entry, byteLength: 1 },
        ),
      }),
    ).toThrow("INVALID_MANIFEST");
  });
  it("does not invoke accessors on captured inputs or stored manifests", () => {
    let invoked = false;
    const fake = {
      get path() {
        invoked = true;
        return "base.json";
      },
      role: "base-contract",
      bytes: bytes("a"),
    };
    expect(() => makeManifest(workspace, [fake as CapturedInput, ...captured().slice(1)])).toThrow(
      "INVALID_MANIFEST",
    );
    const good = makeManifest(workspace, captured());
    expect(() =>
      verifyManifest({
        ...good,
        get engine() {
          invoked = true;
          return good.engine;
        },
      }),
    ).toThrow("INVALID_MANIFEST");
    expect(invoked).toBe(false);
  });
  it("denies unsafe paths, wrong cardinality, shared memory and oversized source bytes", () => {
    for (const path of ["../source.ts", "C:/source.ts", "source.TS"]) {
      const values = captured();
      values[2] = { ...values[2]!, path };
      expect(() => makeManifest(workspace, values)).toThrow("INVALID_MANIFEST");
    }
    expect(() => makeManifest(workspace, captured().slice(0, 2))).toThrow("INVALID_MANIFEST");
    const oversized = captured();
    oversized[2] = { ...oversized[2]!, bytes: new Uint8Array(256 * 1024 + 1) };
    expect(() => makeManifest(workspace, oversized)).toThrow("INVALID_MANIFEST");
    const shared = captured();
    shared[2] = { ...shared[2]!, bytes: new Uint8Array(new SharedArrayBuffer(10)) };
    expect(() => makeManifest(workspace, shared)).toThrow("INVALID_MANIFEST");
  });
});
