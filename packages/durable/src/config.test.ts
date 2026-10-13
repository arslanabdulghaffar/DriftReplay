import { describe, expect, it } from "vitest";
import { parseConnection } from "./config.ts";

describe("local connection boundary", () => {
  const valid = {
    host: "127.0.0.1",
    port: 54329,
    database: "synthetic_test",
    user: "synthetic_runtime",
    password: "synthetic-test-password-only",
  };
  it("allows only explicit local connection fields", () => {
    expect(parseConnection(valid)).toEqual(valid);
    for (const host of ["localhost", "0.0.0.0", "::1", "example.invalid", "/tmp/socket"])
      expect(() => parseConnection({ ...valid, host })).toThrow(
        "LOCAL_DATABASE_CONFIGURATION_REQUIRED",
      );
    for (const extra of [
      { connectionString: "postgres://example.invalid" },
      { options: "-c role=admin" },
      { ssl: false },
    ])
      expect(() => parseConnection({ ...valid, ...extra })).toThrow(
        "LOCAL_DATABASE_CONFIGURATION_REQUIRED",
      );
  });
  it("does not reveal malformed credentials in errors", () => {
    expect(() => parseConnection({ ...valid, password: "CANARY" })).toThrow(
      /^LOCAL_DATABASE_CONFIGURATION_REQUIRED$/,
    );
  });
});
