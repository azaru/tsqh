import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(".");
const packageManifestPath = join(packageRoot, "package.json");

const requiredPackedAssets = [
  "README.md",
  "schemas/project-config.schema.json",
  "schemas/workflow.schema.json",
  "workflows/simple/README.md",
  "workflows/simple/workflow.json",
  "workflows/simple/prompts/implementer.md",
  "workflows/simple/prompts/tester.md",
  "workflows/tdd-pipeline/README.md",
  "workflows/tdd-pipeline/workflow.json",
  "workflows/tdd-pipeline/prompts/architect.md",
  "workflows/tdd-pipeline/prompts/cleaner.md",
  "workflows/tdd-pipeline/prompts/hardener.md",
  "workflows/tdd-pipeline/prompts/implementer.md",
  "workflows/tdd-pipeline/prompts/specifier.md",
  "workflows/tdd-pipeline/prompts/tester.md",
  "knip.json",
  "stryker.config.mjs",
  "sonar-policy.json",
  "sonar-project.properties",
] as const;

const requiredExportedAssets = requiredPackedAssets.filter((path) => path !== "README.md");

const forbiddenPackedPathPatterns = [
  /^src\//u,
  /^test\//u,
  /^scripts\//u,
  /^specs\//u,
  /^workflows\/[^/]+\/task\.md$/u,
  /^(?:tmp|coverage|reports|\.scannerwork|\.stryker-tmp)\//u,
  /(?:^|\/)(?:\.env(?:\.[^/]+)?|credentials?(?:\.(?:json|ya?ml|txt|env|ini|pem|key))?|secrets?(?:\.(?:json|ya?ml|txt|env|ini|pem|key))?)$/iu,
];

let ownedPackDirectory: string | undefined;
let packedPackagePromise: Promise<PackedPackage> | undefined;

describe("public package boundary", () => {
  it("[acceptance:publishable-metadata] declares publishable metadata, the supported Node.js engine, and tsqh", async () => {
    const manifest = await readPackageManifest();
    const bin = typeof manifest.bin === "string" ? { tsqh: manifest.bin } : manifest.bin;

    expect(manifest.private).not.toBe(true);
    expect(manifest.engines?.node).toBe(">=22.12.0");
    expect(bin).toMatchObject({ tsqh: "dist/cli.js" });
  });

  it("[acceptance:packed-public-assets] packs an identified artifact with the CLI, schemas, workflows, prompts, quality assets, and docs", async () => {
    const packed = await packPackage();
    const packedPaths = new Set(packed.files.map(({ path }) => path));

    expect(packed.filename).toMatch(/^tsqh-mvp-.+\.tgz$/u);
    const artifactDetails = await stat(packed.artifactPath);
    expect(artifactDetails.isFile()).toBe(true);
    for (const asset of requiredPackedAssets) {
      expect(packedPaths, `missing packed asset ${asset}`).toContain(asset);
    }
    expect(packedPaths).toContain("dist/cli.js");
  });

  it("[acceptance:bounded-package-content] excludes checkout inputs, task files, caches, reports, credentials, and temporary content", async () => {
    const packed = await packPackage();
    const forbiddenPaths = packed.files
      .map(({ path }) => path)
      .filter((path) => forbiddenPackedPathPatterns.some((pattern) => pattern.test(path)));

    expect(forbiddenPaths).toEqual([]);
  });

  it("[acceptance:resolvable-public-exports] resolves required assets only through package-local declared exports", async () => {
    const manifest = await readPackageManifest();
    const packed = await packPackage();
    const packedPaths = new Set(packed.files.map(({ path }) => path));
    const mappings = collectExportMappings(manifest.exports);

    expect(mappings.length).toBeGreaterThan(0);
    expect(mappings.some(({ specifier, target }) => specifier === "." && target === "./dist/cli.js")).toBe(true);

    for (const asset of requiredExportedAssets) {
      const target = resolveExportTarget(mappings, `./${asset}`);
      expect(target, `no declared export resolves ./${asset}`).toBeDefined();

      const targetPath = resolvePackageTarget(target!);
      await expect(access(targetPath)).resolves.toBeUndefined();
      expect(packedPaths, `export target for ./${asset} is not packed`).toContain(relative(packageRoot, targetPath));
    }
  });
});

afterAll(async () => {
  if (ownedPackDirectory !== undefined) {
    await rm(ownedPackDirectory, { recursive: true, force: true });
  }
});

interface PackageManifest {
  readonly private?: boolean;
  readonly engines?: { readonly node?: string };
  readonly bin?: string | Readonly<Record<string, string>>;
  readonly exports?: unknown;
}

interface PackedFile {
  readonly path: string;
}

interface PackedPackage {
  readonly filename: string;
  readonly artifactPath: string;
  readonly files: readonly PackedFile[];
}

interface ExportMapping {
  readonly specifier: string;
  readonly target: string;
}

async function readPackageManifest(): Promise<PackageManifest> {
  return JSON.parse(await readFile(packageManifestPath, "utf8")) as PackageManifest;
}

async function packPackage(): Promise<PackedPackage> {
  packedPackagePromise ??= createPackedPackage();
  return packedPackagePromise;
}

async function createPackedPackage(): Promise<PackedPackage> {
  const taskTemporaryRoot = join(packageRoot, "tmp/codex-mvp008-task01");
  await mkdir(taskTemporaryRoot, { recursive: true });
  ownedPackDirectory = await mkdtemp(join(taskTemporaryRoot, "pack-"));

  const result = await execFileAsync(
    "npm",
    ["pack", "--json", "--pack-destination", ownedPackDirectory],
    {
      cwd: packageRoot,
      shell: false,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, npm_config_cache: join(ownedPackDirectory, "npm-cache") },
    },
  );
  const parsed = JSON.parse(result.stdout) as unknown;
  const descriptions = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? Object.values(parsed)
      : [];
  if (descriptions.length !== 1 || !isRecord(descriptions[0])) {
    throw new Error("npm pack did not return one JSON artifact description.");
  }

  const filename = descriptions[0].filename;
  const files = descriptions[0].files;
  if (typeof filename !== "string" || !Array.isArray(files)) {
    throw new Error("npm pack returned an invalid artifact description.");
  }

  return {
    filename,
    artifactPath: join(ownedPackDirectory, filename),
    files: files.flatMap((file) => (isRecord(file) && typeof file.path === "string" ? [{ path: file.path }] : [])),
  };
}

function collectExportMappings(exportsValue: unknown): readonly ExportMapping[] {
  if (typeof exportsValue === "string") {
    return [{ specifier: ".", target: exportsValue }];
  }
  if (!isRecord(exportsValue)) {
    return [];
  }

  const mappings: ExportMapping[] = [];
  for (const [specifier, value] of Object.entries(exportsValue)) {
    if (!specifier.startsWith(".")) {
      continue;
    }
    collectConditionalTargets(specifier, value, mappings);
  }
  return mappings;
}

function collectConditionalTargets(
  specifier: string,
  value: unknown,
  mappings: ExportMapping[],
): void {
  if (typeof value === "string") {
    mappings.push({ specifier, target: value });
    return;
  }
  if (Array.isArray(value)) {
    for (const candidate of value) {
      collectConditionalTargets(specifier, candidate, mappings);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const candidate of Object.values(value)) {
    collectConditionalTargets(specifier, candidate, mappings);
  }
}

function resolveExportTarget(mappings: readonly ExportMapping[], requestedSpecifier: string): string | undefined {
  for (const mapping of mappings) {
    if (mapping.specifier === requestedSpecifier) {
      return mapping.target;
    }

    const wildcardIndex = mapping.specifier.indexOf("*");
    if (wildcardIndex < 0) {
      continue;
    }
    const prefix = mapping.specifier.slice(0, wildcardIndex);
    const suffix = mapping.specifier.slice(wildcardIndex + 1);
    if (!requestedSpecifier.startsWith(prefix) || !requestedSpecifier.endsWith(suffix)) {
      continue;
    }
    const capture = requestedSpecifier.slice(prefix.length, requestedSpecifier.length - suffix.length);
    return mapping.target.replaceAll("*", capture);
  }
  return undefined;
}

function resolvePackageTarget(target: string): string {
  expect(target.startsWith("./"), `export target must be package-relative: ${target}`).toBe(true);
  const targetPath = resolve(packageRoot, target.slice(2));
  const outsidePackage = isAbsolute(relative(packageRoot, targetPath)) || relative(packageRoot, targetPath).startsWith("..");
  expect(outsidePackage, `export target escapes the package: ${target}`).toBe(false);
  return targetPath;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
