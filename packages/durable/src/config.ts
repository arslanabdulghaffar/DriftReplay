import { lstat, open } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";
import { z } from "zod";

const ConnectionSchema = z.strictObject({
  host: z.literal("127.0.0.1"),
  port: z.number().int().min(1024).max(65535),
  database: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
  user: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
  password: z.string().min(16).max(256),
});
export type LocalConnection = z.infer<typeof ConnectionSchema>;

export class ConfigurationError extends Error {
  constructor() {
    super("LOCAL_DATABASE_CONFIGURATION_REQUIRED");
  }
}

/** Process environment is operator configuration, never a caller-supplied connection URL. */
export async function loadConnection(migration = false): Promise<LocalConnection> {
  try {
    const prefix = migration ? "DRIFT_MIGRATION_" : "DRIFT_DB_";
    if (process.env[`${prefix}PASSWORD`] !== undefined) {
      return ConnectionSchema.parse({
        host: process.env.DRIFT_DB_HOST,
        port: Number(process.env.DRIFT_DB_PORT),
        database: process.env.DRIFT_DB_DATABASE,
        user: process.env[`${prefix}USER`],
        password: process.env[`${prefix}PASSWORD`],
      });
    }
    const path = resolve(
      ".local/durable",
      migration ? "migration-connection.json" : "connection.json",
    );
    let parent = dirname(path);
    while (parent !== parse(parent).root) {
      const stat = await lstat(parent);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new ConfigurationError();
      parent = dirname(parent);
    }
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 4096)
      throw new ConfigurationError();
    const handle = await open(path, "r");
    try {
      const current = await handle.stat();
      if (current.ino !== before.ino || current.dev !== before.dev) throw new ConfigurationError();
      const data = Buffer.alloc(4097);
      const { bytesRead } = await handle.read(data, 0, data.length, 0);
      if (bytesRead !== before.size) throw new ConfigurationError();
      const after = await lstat(path);
      if (
        after.ino !== before.ino ||
        after.mtimeMs !== before.mtimeMs ||
        after.size !== before.size
      )
        throw new ConfigurationError();
      return ConnectionSchema.parse(JSON.parse(data.subarray(0, bytesRead).toString("utf8")));
    } finally {
      await handle.close();
    }
  } catch {
    throw new ConfigurationError();
  }
}

export function parseConnection(input: unknown): LocalConnection {
  try {
    return ConnectionSchema.parse(input);
  } catch {
    throw new ConfigurationError();
  }
}
