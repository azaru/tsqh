import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const domainRoot = new URL("../src/domain/", import.meta.url);
const forbiddenImports = /from\s+["'](?:node:|ajv|vitest|[^"']*\/(?:application|adapters|cli)\/)/;

const entries = await readdir(domainRoot, { withFileTypes: true });
const violations = [];
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith(".ts")) {
    continue;
  }
  const source = await readFile(join(domainRoot.pathname, entry.name), "utf8");
  if (forbiddenImports.test(source)) {
    violations.push(entry.name);
  }
}

if (violations.length > 0) {
  process.stderr.write(`Domain dependency boundary violated: ${violations.join(", ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Domain dependency boundary passed (${String(entries.length)} entries inspected).\n`);
}
