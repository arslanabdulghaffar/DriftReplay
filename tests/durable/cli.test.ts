import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
const execute = promisify(execFile);
const cli = "packages/durable/src/cli.ts";

describe("D25 D29: real local CLI privacy and connection diagnostics", () => {
  it("doctor reports the loopback client target separately from the server address observation", async () => {
    const { stdout, stderr } = await execute(process.execPath, [cli, "doctor"], {
      windowsHide: true,
    });
    expect(stderr).toBe("");
    const result: unknown = JSON.parse(stdout);
    expect(result).toMatchObject({
      database: "ready",
      version: expect.stringMatching(/^17\.11(?:\s|$)/),
      loopbackOnlyConnection: true,
      serverAddressIsLoopback: expect.any(Boolean),
      runtimeSuperuser: false,
      modelInvocations: 0,
    });
    expect(stdout).not.toContain("password");
    expect(stdout).not.toContain("A:\\");
    expect(result).not.toHaveProperty("address");
  });

  it.each([
    ["submit", "--workspace-id", "forged"],
    ["worker", "--command", "CANARY_COMMAND"],
    ["submit", "--url", "http://169.254.169.254/CANARY_SECRET"],
    ["gc", "--apply", "--dry-run"],
    ["verify", "--run-id", "CANARY_INVALID_ID"],
  ])("rejects unsupported or forged input without echoing it: %j", async (...args) => {
    try {
      await execute(process.execPath, [cli, ...args], { windowsHide: true });
      throw new Error("UNEXPECTED_SUCCESS");
    } catch (error) {
      expect(error).toHaveProperty("stderr");
      const stderr = (error as { stderr: string }).stderr;
      expect(stderr).not.toContain("CANARY");
      expect(stderr).not.toContain("169.254");
      expect(JSON.parse(stderr)).toMatchObject({ scope: "local-static-analysis-only" });
    }
  });
});
