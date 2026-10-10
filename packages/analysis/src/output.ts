import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { InputError } from "./errors.ts";
import type { AnalysisResult } from "./model.ts";
import { canonical } from "./identity.ts";
import { renderMarkdown } from "./report.ts";
import { validateRoot } from "./ingestion.ts";

async function safeDirectory(path: string): Promise<void> {
  const absolute = resolve(path),
    root = parse(absolute).root;
  let cursor = root;
  for (const segment of absolute.slice(root.length).split(/[\\/]/).filter(Boolean)) {
    cursor = join(cursor, segment);
    const stat = await lstat(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new InputError("UNSAFE_OUTPUT_DIRECTORY");
  }
}
export async function writeReports(root: string, result: AnalysisResult): Promise<string[]> {
  root = validateRoot(root);
  await safeDirectory(root);
  const approved = await realpath(root);
  let output = approved;
  for (const segment of [".local", "phase-2"]) {
    output = join(output, segment);
    try {
      await mkdir(output);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST")
        throw new InputError("OUTPUT_WRITE_FAILED");
    }
    await safeDirectory(output);
  }
  const files = [
    ["analysis.json", canonical(result) + "\n"],
    ["analysis.md", renderMarkdown(result)],
  ] as const;
  for (const [name, text] of files) {
    const destination = join(output, name),
      temporary = join(output, `.report-${randomUUID()}.tmp`);
    try {
      const previous = await lstat(destination);
      if (previous.isSymbolicLink() || !previous.isFile() || previous.nlink !== 1)
        throw new InputError("UNSAFE_OUTPUT_FILE");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    let created = false;
    try {
      await safeDirectory(dirname(destination));
      const handle = await open(temporary, "wx", 0o600);
      created = true;
      try {
        await handle.writeFile(text, "utf8");
      } finally {
        await handle.close();
      }
      await safeDirectory(dirname(destination));
      await rename(temporary, destination);
      created = false;
    } finally {
      if (created) await unlink(temporary);
    }
  }
  return files.map(([name]) => `.local/phase-2/${name}`);
}
