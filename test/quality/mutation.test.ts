import { mkdir, mkdtemp, readFile, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateMutationReport } from "../../src/quality/mutation.js";

describe("mutation evidence", () => {
  it("accepts a fresh nonzero all-killed inventory", async () => {
    const fixture = await createMutationFixture();

    await expect(validate(fixture.root, 0)).resolves.toMatchObject({ files: 1, killed: 1 });
  });

  it("propagates native process failure", async () => {
    const fixture = await createMutationFixture();

    await expect(validate(fixture.root, 1)).rejects.toThrow(/exited with status 1/u);
  });

  it("rejects absent, stale, and malformed reports", async () => {
    const absent = await createMutationFixture();
    await unlink(absent.reportPath);
    await expect(validate(absent.root, 0)).rejects.toThrow(/Mutation report is missing/u);

    const stale = await createMutationFixture();
    const old = new Date(0);
    await utimes(stale.reportPath, old, old);
    await expect(validateMutationReport({
      workspace: stale.root,
      invocationStartedAtMs: 1,
      processExitCode: 0,
    })).rejects.toThrow(/stale/u);

    const malformed = await createMutationFixture();
    await writeFile(malformed.reportPath, "{bad\n", "utf8");
    await expect(validate(malformed.root, 0)).rejects.toThrow(/Mutation report is malformed JSON/u);
  });

  it("rejects a zero-mutant inventory", async () => {
    const fixture = await createMutationFixture({ mutants: [] });

    await expect(validate(fixture.root, 0)).rejects.toThrow(/zero generated mutants/u);
  });

  it.each([
    "Survived",
    "NoCoverage",
    "CompileError",
    "RuntimeError",
    "Timeout",
    "Ignored",
    "Pending",
    "Unknown",
  ])("rejects non-killed status %s", async (status) => {
    const fixture = await createMutationFixture({ mutants: [mutant(status)] });

    await expect(validate(fixture.root, 0)).rejects.toThrow(`non-killed status '${status}'`);
  });

  it("rejects contradictory or incremental configuration", async () => {
    const fixture = await createMutationFixture({
      config: { ...configuration(), incremental: true },
    });

    await expect(validate(fixture.root, 0)).rejects.toThrow(/config\.incremental must be false/u);
  });

  it("rejects a process that did not exit normally", async () => {
    const fixture = await createMutationFixture();

    await expect(validateMutationReport({
      workspace: fixture.root,
      invocationStartedAtMs: 0,
      processExitCode: null,
    })).rejects.toThrow(/did not exit normally/u);
  });

  it.each([
    ["schema", { report: { schemaVersion: 1 } }, /schemaVersion/u],
    ["project root", { report: { projectRoot: "/wrong" } }, /projectRoot/u],
    ["thresholds", { report: { thresholds: null } }, /thresholds must be an object/u],
    ["threshold high", { report: { thresholds: { high: 99, low: 100, break: 100 } } }, /thresholds.high/u],
    ["threshold low", { report: { thresholds: { high: 100, low: 99, break: 100 } } }, /thresholds.low/u],
    ["threshold break", { report: { thresholds: { high: 100, low: 100, break: 99 } } }, /thresholds.break/u],
    ["framework", { report: { framework: null } }, /framework must be an object/u],
    ["framework name", { report: { framework: { name: "Other", version: "10.0.0" } } }, /framework.name/u],
    ["framework version", { report: { framework: { name: "Stryker", version: "other" } } }, /framework.version/u],
    ["configuration", { report: { config: null } }, /config must be an object/u],
    ["configuration policy", { config: { ...configuration(), checkers: [] } }, /checkers.*policy/u],
    ["clean temp", configChange("cleanTempDir", false), /config.cleanTempDir/u],
    ["concurrency", configChange("concurrency", 3), /config.concurrency/u],
    ["dry run timeout", configChange("dryRunTimeoutMinutes", 4), /config.dryRunTimeoutMinutes/u],
    ["ignore static", configChange("ignoreStatic", true), /config.ignoreStatic/u],
    ["mutate", configChange("mutate", ["src/**/*.ts"]), /config.mutate.*policy/u],
    ["plugins", configChange("plugins", ["wrong", "@stryker-mutator/typescript-checker"]), /config.plugins.*policy/u],
    ["reporters", configChange("reporters", ["clear-text", "json", "progress"]), /config.reporters.*policy/u],
    ["temp directory", configChange("tempDirName", "other"), /config.tempDirName/u],
    ["test runner", configChange("testRunner", "other"), /config.testRunner/u],
    ["timeout", configChange("timeoutMS", 1), /config.timeoutMS/u],
    ["tsconfig", configChange("tsconfigFile", "other.json"), /config.tsconfigFile/u],
    ["config thresholds", configChange("thresholds", null), /config.thresholds must be an object/u],
    ["config threshold high", configChange("thresholds", { high: 99, low: 100, break: 100 }), /config.thresholds.high/u],
    ["JSON reporter", configChange("jsonReporter", null), /config.jsonReporter must be an object/u],
    ["JSON reporter file", configChange("jsonReporter", { fileName: "other" }), /config.jsonReporter.fileName/u],
    ["Vitest policy", configChange("vitest", null), /config.vitest must be an object/u],
    ["Vitest related", configChange("vitest", { related: true }), /config.vitest.related/u],
    ["file inventory object", { report: { files: null } }, /files must be an object/u],
    ["empty file inventory", { report: { files: {} } }, /no mutated files/u],
    ["file scope", { filePath: "test/value.ts" }, /outside production scope/u],
    ["file extension", { filePath: "src/value.js" }, /outside production scope/u],
    ["declaration file", { filePath: "src/value.d.ts" }, /outside production scope/u],
    ["file path", { filePath: "../value.ts" }, /Mutation file path resolves outside/u],
    ["file object", { report: { files: { "src/value.ts": null } } }, /files\.src\/value\.ts must be an object/u],
    ["language", { file: { language: "javascript" } }, /language/u],
    ["source", { file: { source: "" } }, /source must be nonempty/u],
    ["mutant inventory", { file: { mutants: null } }, /mutants must be an array/u],
    ["mutant object", { mutants: [null] }, /files\.src\/value\.ts\.mutants\[0\] must be an object/u],
    ["mutant id", { mutants: [{ id: "", status: "Killed" }] }, /missing or duplicate mutant id/u],
    ["duplicate mutant id", { mutants: [mutant("Killed"), mutant("Killed")] }, /missing or duplicate/u],
    ["missing mutant status", { mutants: [{ id: "0" }] }, /status 'missing'/u],
  ] as const)("rejects invalid %s", async (_label, options, message) => {
    const fixture = await createMutationFixture(options as MutationFixtureOptions);

    await expect(validate(fixture.root, 0)).rejects.toThrow(message);
  });

  it("rejects normalized duplicate mutation file paths", async () => {
    const fixture = await createMutationFixture();
    const report = JSON.parse(await readFile(fixture.reportPath, "utf8")) as Record<string, unknown>;
    const files = report.files as Record<string, unknown>;
    files[join(fixture.root, "src/value.ts")] = files["src/value.ts"];
    await writeFile(fixture.reportPath, `${JSON.stringify(report)}\n`, "utf8");

    await expect(validate(fixture.root, 0)).rejects.toThrow(/ambiguous duplicate paths/u);
  });
});

async function validate(root: string, processExitCode: number): ReturnType<typeof validateMutationReport> {
  return validateMutationReport({ workspace: root, invocationStartedAtMs: 0, processExitCode });
}

interface MutationFixtureOptions {
  readonly config?: Record<string, unknown>;
  readonly file?: Record<string, unknown>;
  readonly filePath?: string;
  readonly mutants?: readonly unknown[];
  readonly report?: Record<string, unknown>;
}

async function createMutationFixture(options: MutationFixtureOptions = {}): Promise<{
  readonly root: string;
  readonly reportPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-mutation-"));
  const reportRoot = join(root, "reports/mutation");
  await mkdir(reportRoot, { recursive: true });
  const reportPath = join(reportRoot, "mutation.json");
  const file = {
    language: "typescript",
    source: "export const value = 1;\n",
    mutants: options.mutants ?? [mutant("Killed")],
    ...options.file,
  };
  const report = {
    schemaVersion: "1.0",
    projectRoot: root,
    thresholds: { high: 100, low: 100, break: 100 },
    framework: { name: "Stryker", version: "10.0.0" },
    config: options.config ?? configuration(),
    files: { [options.filePath ?? "src/value.ts"]: file },
    ...options.report,
  };
  await writeFile(reportPath, `${JSON.stringify(report)}\n`, "utf8");
  return { root, reportPath };
}

function configuration(): Record<string, unknown> {
  return {
    checkers: ["typescript"],
    cleanTempDir: "always",
    concurrency: 2,
    coverageAnalysis: "all",
    dryRunTimeoutMinutes: 5,
    ignoreStatic: false,
    incremental: false,
    jsonReporter: { fileName: "reports/mutation/mutation.json" },
    mutate: ["src/**/*.ts", "!src/**/*.d.ts"],
    plugins: ["@stryker-mutator/vitest-runner", "@stryker-mutator/typescript-checker"],
    reporters: ["clear-text", "progress", "json"],
    tempDirName: ".stryker-tmp",
    testRunner: "vitest",
    thresholds: { high: 100, low: 100, break: 100 },
    timeoutMS: 10_000,
    tsconfigFile: "tsconfig.json",
    vitest: { related: false },
  };
}

function configChange(key: string, value: unknown): MutationFixtureOptions {
  return { config: { ...configuration(), [key]: value } };
}

function mutant(status: string): Record<string, unknown> {
  return { id: "0", status };
}
