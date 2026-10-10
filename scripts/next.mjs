import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const allowedCommands = new Set(["dev", "build"]);
const [command, ...args] = process.argv.slice(2);
if (!allowedCommands.has(command)) throw new Error("Only local dev and build are supported.");

const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), command, ...args], {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
