import { mkdir, mkdtemp, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCrapReport } from "../../src/quality/crap.js";

describe("CRAP evidence", () => {
  it("accepts a fresh complete passing report", async () => {
    const fixture = await createCrapFixture();

    await expect(validate(fixture.root, 0)).resolves.toMatchObject({
      files: 1,
      units: 1,
      maximumCrap: 2,
    });
  });

  it.each([1, 2])("propagates process exit status %i as failure", async (exitCode) => {
    const fixture = await createCrapFixture();

    await expect(validate(fixture.root, exitCode)).rejects.toThrow(`exited with status ${String(exitCode)}`);
  });

  it("rejects a missing report after process success", async () => {
    const fixture = await createCrapFixture();
    await unlink(fixture.reportPath);

    await expect(validate(fixture.root, 0)).rejects.toThrow(/CRAP report is missing/u);
  });

  it("rejects stale and malformed reports", async () => {
    const fixture = await createCrapFixture();
    const old = new Date(0);
    await utimes(fixture.reportPath, old, old);
    await expect(validateCrapReport({
      workspace: fixture.root,
      invocationStartedAtMs: 1,
      processExitCode: 0,
    })).rejects.toThrow(/stale/u);

    await writeFile(fixture.reportPath, "{bad\n", "utf8");
    await expect(validate(fixture.root, 0)).rejects.toThrow(/CRAP report is malformed JSON/u);
  });

  it("rejects contradictory green evidence", async () => {
    const fixture = await createCrapFixture({
      status: "failed",
      passed: false,
      summary: { files: 1, units: 1, violations: 1, maximumCrap: 7 },
    });

    await expect(validate(fixture.root, 0)).rejects.toThrow(/status must be "passed"/u);
  });

  it("rejects empty production or unit inventories", async () => {
    const fixture = await createCrapFixture({
      sourceInventory: { analyzed: [], excluded: [], declarations: [] },
      metrics: [],
      summary: { files: 0, units: 0, violations: 0, maximumCrap: null },
    });

    await expect(validate(fixture.root, 0)).rejects.toThrow(/no analyzed production files/u);
  });

  it("rejects an empty executable-unit inventory after accepting production scope", async () => {
    const fixture = await createCrapFixture({
      metrics: [],
      summary: { files: 1, units: 0, violations: 0, maximumCrap: null },
    });

    await expect(validate(fixture.root, 0)).rejects.toThrow(/no executable units/u);
  });

  it("accepts CRAP scores at zero and at the threshold", async () => {
    for (const score of [0, 6]) {
      const fixture = await createCrapFixture({
        metrics: [{ file: "src/value.ts", crap: score, violatesThreshold: false }],
        summary: { files: 1, units: 1, violations: 0, maximumCrap: score },
      });

      await expect(validate(fixture.root, 0)).resolves.toMatchObject({ maximumCrap: score });
    }
  });

  it("accepts a multi-unit maximum computed from all scores", async () => {
    const fixture = await createCrapFixture({
      metrics: [
        { file: "src/value.ts", crap: 2, violatesThreshold: false },
        { file: "src/value.ts", crap: 4, violatesThreshold: false },
      ],
      summary: { files: 1, units: 2, violations: 0, maximumCrap: 4 },
    });

    await expect(validate(fixture.root, 0)).resolves.toMatchObject({ units: 2, maximumCrap: 4 });
  });

  it("rejects a process that did not exit normally", async () => {
    const fixture = await createCrapFixture();

    await expect(validateCrapReport({
      workspace: fixture.root,
      invocationStartedAtMs: 0,
      processExitCode: null,
    })).rejects.toThrow(/did not exit normally/u);
  });

  it.each([
    ["schema version", { schemaVersion: 2 }, /schemaVersion must be 1/u],
    ["tool version", { toolVersion: "other" }, /toolVersion must be "0\.1\.2"/u],
    ["passed", { passed: false }, /passed must be true/u],
    ["threshold", { threshold: 7 }, /threshold must be 6/u],
    ["inputs object", { inputs: null }, /inputs must be an object/u],
    ["working directory", { inputs: baseInputs("/wrong") }, /inputs.cwd/u],
    ["source roots", { inputs: { ...baseInputs("ROOT"), sourceRoots: [] } }, /sourceRoots/u],
    ["source root value", { inputs: { ...baseInputs("ROOT"), sourceRoots: ["test"] } }, /sourceRoots does not match/u],
    ["coverage file", { inputs: { ...baseInputs("ROOT"), coverageFile: "other.json" } }, /inputs.coverageFile/u],
    ["excludes", { inputs: { ...baseInputs("ROOT"), excludes: ["generated"] } }, /excludes/u],
    ["exclude type", { inputs: { ...baseInputs("ROOT"), excludes: [1] } }, /inputs.excludes must be a string array/u],
    ["source inventory", { sourceInventory: null }, /sourceInventory must be an object/u],
    ["analyzed inventory", { sourceInventory: { analyzed: null, excluded: [], declarations: [] } }, /sourceInventory.analyzed must be an array/u],
    ["excluded inventory", { sourceInventory: { analyzed: ["src/value.ts"], excluded: [1], declarations: [] } }, /sourceInventory.excluded must be a string array/u],
    ["declaration inventory", { sourceInventory: { analyzed: ["src/value.ts"], excluded: [], declarations: [null] } }, /sourceInventory.declarations must be a string array/u],
    ["duplicate sources", {
      sourceInventory: {
        analyzed: ["src/value.ts", "src/value.ts"],
        excluded: [],
        declarations: [],
      },
    }, /duplicate paths/u],
    ["coverage inventory", { coverageInventory: null }, /coverageInventory must be an object/u],
    ["coverage inventory file", { coverageInventory: { file: "other", recordedFiles: ["src/value.ts"] } }, /coverageInventory.file/u],
    ["recorded files", { coverageInventory: { file: "coverage/coverage-final.json", recordedFiles: null } }, /coverageInventory.recordedFiles must be an array/u],
    ["metrics array", { metrics: null }, /metrics must be an array/u],
    ["metric object", { metrics: [null] }, /metrics\[0\] must be an object/u],
    ["metric file", { metrics: [{ file: null, crap: 2, violatesThreshold: false }] }, /metrics\[0\]\.file/u],
    ["metric scope", { metrics: [{ file: "src/other.ts", crap: 2, violatesThreshold: false }] }, /incomplete/u],
    ["metric partial scope", {
      sourceInventory: { analyzed: ["src/value.ts"], excluded: [], declarations: [] },
      coverageInventory: { file: "coverage/coverage-final.json", recordedFiles: ["src/other.ts"] },
      metrics: [{ file: "src/value.ts", crap: 2, violatesThreshold: false }],
    }, /incomplete/u],
    ["metric violation", { metrics: [{ file: "src/value.ts", crap: 2, violatesThreshold: true }] }, /violatesThreshold/u],
    ["metric score", { metrics: [{ file: "src/value.ts", crap: 7, violatesThreshold: false }] }, /exceeds threshold/u],
    ["negative metric score", { metrics: [{ file: "src/value.ts", crap: -1, violatesThreshold: false }] }, /metrics\[0\]\.crap must be a finite nonnegative/u],
    ["diagnostics", { diagnostics: ["warning"] }, /diagnostics/u],
    ["diagnostic type", { diagnostics: [1] }, /diagnostics must be a string array/u],
    ["summary files", { summary: { files: 0, units: 1, violations: 0, maximumCrap: 2 } }, /summary.files must be a positive integer/u],
    ["invalid summary units", { summary: { files: 1, units: 0, violations: 0, maximumCrap: 2 } }, /summary.units must be a positive integer/u],
    ["summary units", { summary: { files: 1, units: 2, violations: 0, maximumCrap: 2 } }, /summary contradicts/u],
    ["summary object", { summary: null }, /summary must be an object/u],
    ["summary violations", { summary: { files: 1, units: 1, violations: 1, maximumCrap: 2 } }, /summary.violations/u],
    ["summary maximum value", { summary: { files: 1, units: 1, violations: 0, maximumCrap: null } }, /summary.maximumCrap/u],
    ["summary maximum", { summary: { files: 1, units: 1, violations: 0, maximumCrap: 3 } }, /maximum contradicts/u],
  ])("rejects invalid %s", async (_label, overrides, message) => {
    const fixture = await createCrapFixture(overrides);

    await expect(validate(fixture.root, 0)).rejects.toThrow(message);
  });

  it("rejects a summary file count that alone contradicts the analyzed inventory", async () => {
    const fixture = await createCrapFixture({
      sourceInventory: {
        analyzed: ["src/value.ts", "src/other.ts"],
        excluded: [],
        declarations: [],
      },
      summary: { files: 1, units: 1, violations: 0, maximumCrap: 2 },
    });

    await expect(validate(fixture.root, 0)).rejects.toThrow(/summary contradicts/u);
  });
});

async function validate(root: string, processExitCode: number): ReturnType<typeof validateCrapReport> {
  return validateCrapReport({ workspace: root, invocationStartedAtMs: 0, processExitCode });
}

async function createCrapFixture(overrides: Record<string, unknown> = {}): Promise<{
  readonly root: string;
  readonly reportPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-crap-"));
  const reportRoot = join(root, "reports/quality");
  await mkdir(reportRoot, { recursive: true });
  const reportPath = join(reportRoot, "crap.json");
  const resolvedOverrides = structuredClone(overrides);
  const overrideInputs = resolvedOverrides.inputs;
  if (
    typeof overrideInputs === "object" &&
    overrideInputs !== null &&
    !Array.isArray(overrideInputs) &&
    (overrideInputs as Record<string, unknown>).cwd === "ROOT"
  ) {
    (overrideInputs as Record<string, unknown>).cwd = root;
  }
  const report = {
    schemaVersion: 1,
    toolVersion: "0.1.2",
    status: "passed",
    passed: true,
    threshold: 6,
    inputs: {
      cwd: root,
      sourceRoots: ["src"],
      coverageFile: "coverage/coverage-final.json",
      excludes: [],
    },
    sourceInventory: { analyzed: ["src/value.ts"], excluded: [], declarations: [] },
    coverageInventory: {
      file: "coverage/coverage-final.json",
      recordedFiles: ["src/value.ts"],
    },
    metrics: [{ file: "src/value.ts", crap: 2, violatesThreshold: false }],
    diagnostics: [],
    summary: { files: 1, units: 1, violations: 0, maximumCrap: 2 },
    ...resolvedOverrides,
  };
  await writeFile(reportPath, `${JSON.stringify(report)}\n`, "utf8");
  return { root, reportPath };
}

function baseInputs(cwd: string): Record<string, unknown> {
  return {
    cwd,
    sourceRoots: ["src"],
    coverageFile: "coverage/coverage-final.json",
    excludes: [],
  };
}
