import { mkdir, mkdtemp, readFile, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateMutationReport } from "../../src/quality/mutation.js";

describe("mutation evidence", () => {
  it("accepts a fresh nonzero all-killed inventory", async () => {
    const fixture = await createMutationFixture();

    await expect(validate(fixture.root, 0)).resolves.toMatchObject({
      files: 1,
      killed: 1,
      compileErrors: 0,
    });
  });

  it("accepts checker-rejected CompileError mutants separately from runnable mutants", async () => {
    const fixture = await createMutationFixture({
      mutants: [
        mutant("Killed", "0"),
        mutant("CompileError", "1", "TypeScript rejected the generated mutation."),
      ],
    });

    await expect(validate(fixture.root, 0)).resolves.toMatchObject({
      files: 1,
      killed: 1,
      compileErrors: 1,
    });
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

    await expect(validate(fixture.root, 0)).rejects.toThrow(/zero runnable mutants/u);
  });

  it("rejects an inventory containing only checker-rejected mutants", async () => {
    const fixture = await createMutationFixture({
      mutants: [mutant("CompileError", "0", "TypeScript rejected it.")],
    });

    await expect(validate(fixture.root, 0)).rejects.toThrow(/zero runnable mutants/u);
  });

  it.each([
    "Survived",
    "NoCoverage",
    "RuntimeError",
    "Timeout",
    "TestFailure",
    "Ignored",
    "Pending",
    "Unknown",
  ])("rejects runnable status %s", async (status) => {
    const fixture = await createMutationFixture({ mutants: [mutant(status)] });

    await expect(validate(fixture.root, 0)).rejects.toThrow(`rejected runnable status '${status}'`);
  });

  it.each([undefined, "", "   ", 1])(
    "rejects a CompileError without a nonempty statusReason (%s)",
    async (statusReason) => {
      const fixture = await createMutationFixture({
        mutants: [mutant("Killed", "0"), mutant("CompileError", "1", statusReason)],
      });

      await expect(validate(fixture.root, 0)).rejects.toThrow(/nonempty statusReason/u);
    },
  );

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
    ["framework name", { report: { framework: { name: "Stryker", version: "10.0.0" } } }, /framework.name/u],
    ["framework version", { report: { framework: { name: "StrykerJS", version: "other" } } }, /framework.version/u],
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
    framework: { name: "StrykerJS", version: "10.0.0" },
    files: { [options.filePath ?? "src/value.ts"]: file },
    ...options.report,
  };
  await writeFile(reportPath, `${JSON.stringify(report)}\n`, "utf8");
  return { root, reportPath };
}

function mutant(
  status: string,
  id = "0",
  statusReason?: unknown,
): Record<string, unknown> {
  return { id, status, ...(statusReason === undefined ? {} : { statusReason }) };
}
