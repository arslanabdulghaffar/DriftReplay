import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const packages = new Map();
async function visit(node) {
  if (
    node.path &&
    node.path.startsWith(resolve(root) + sep) &&
    node.path.includes(`${sep}node_modules${sep}`)
  ) {
    try {
      const manifest = JSON.parse(await readFile(join(node.path, "package.json"), "utf8"));
      const lifecycle = Object.fromEntries(
        Object.entries(manifest.scripts ?? {}).filter(([name]) =>
          ["preinstall", "install", "postinstall"].includes(name),
        ),
      );
      packages.set(`${manifest.name}@${manifest.version}`, {
        name: manifest.name,
        version: manifest.version,
        license: manifest.license ?? "UNDECLARED",
        lifecycle,
        private: manifest.private === true,
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const group of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const dependency of Object.values(node[group] ?? {})) await visit(dependency);
  }
}
const tree = JSON.parse(
  await readFile(join(root, "docs", "validation", "dependency-tree.json"), "utf8"),
);
for (const project of tree) await visit(project);
const inventory = [...packages.values()].sort((a, b) =>
  `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
);
const result = {
  kind: "installed-package-metadata-not-legal-or-security-audit",
  packages: inventory,
};
if (process.argv.includes("--write")) {
  await mkdir(join(root, "docs", "validation"), { recursive: true });
  await writeFile(
    join(root, "docs", "validation", "dependency-inventory.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify(
    {
      count: inventory.length,
      lifecycle: inventory.filter((item) => Object.keys(item.lifecycle).length > 0),
    },
    null,
    2,
  ),
);
