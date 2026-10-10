import { createHash } from "node:crypto";

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Stable code-unit ordering; never locale-dependent. Undefined is not an input value.
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const result = JSON.stringify(value);
    if (result === undefined) throw new Error("NON_JSON_VALUE");
    return result;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

export function identity(value: unknown): string {
  return sha256(canonical(value));
}
export function ordered<T>(values: readonly T[]): T[] {
  return [...values].sort((a, b) => {
    const x = canonical(a),
      y = canonical(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
