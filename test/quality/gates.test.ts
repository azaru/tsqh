import { access, mkdir, mkdtemp, readFile, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CommandRequest, CommandRunner } from "../../src/application/ports.js";
import type { ProcessArtifact } from "../../src/domain/types.js";
import {
  runLocalQualityGate,
  type LocalQualityGateId,
} from "../../src/quality/gates.js";
import { validateCoverage } from "../../src/quality/coverage.js";

const PACKAGE_VERSIONS = {
  vitest: "4.1.11",
  "@vitest/coverage-v8": "4.1.11",
  "@azaru/tscrap": "0.1.2",
  knip: "6.32.2",
  "@stryker-mutator/core": "10.0.0",
  "@stryker-mutator/vitest-runner": "10.0.0",
  "@stryker-mutator/typescript-checker": "10.0.0",
} as const;

interface ExpectedGate {
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly toolVersions: Readonly<Record<string, string>>;
  readonly scope: readonly string[];
  readonly thresholds: Readonly<Record<string, number | string>>;
  readonly cleanPaths: readonly string[];
  readonly outputFiles: readonly string[];
}

const EXPECTED_GATES: Readonly<Record<LocalQualityGateId, ExpectedGate>> = {
  coverage: {
    executable: "vitest",
    args: ["run", "--coverage"],
    timeoutMs: 900_000,
    toolVersions: { vitest: "4.1.11", "@vitest/coverage-v8": "4.1.11" },
    scope: ["src/**/*.ts", "test/**/*.ts"],
    thresholds: { global: 90, domain: 100 },
    cleanPaths: ["coverage"],
    outputFiles: ["coverage/coverage-final.json", "coverage/lcov.info"],
  },
  crap: {
    executable: "tscrap",
    args: [
      "--src",
      "src",
      "--coverage",
      "coverage/coverage-final.json",
      "--threshold",
      "6",
      "--format",
      "json",
      "--output",
      "reports/quality/crap.json",
    ],
    timeoutMs: 900_000,
    toolVersions: { "@azaru/tscrap": "0.1.2" },
    scope: ["src/**/*.ts"],
    thresholds: { crap: 6 },
    cleanPaths: ["reports/quality/crap.json"],
    outputFiles: ["reports/quality/crap.json"],
  },
  knip: {
    executable: "knip",
    args: ["--config", "knip.json", "--reporter", "json"],
    timeoutMs: 900_000,
    toolVersions: { knip: "6.32.2" },
    scope: ["complete project"],
    thresholds: { findings: 0, configurationHints: 0, tagHints: 0 },
    cleanPaths: ["reports/quality/knip.json"],
    outputFiles: ["reports/quality/knip.json"],
  },
  mutation: {
    executable: "stryker",
    args: ["run", "stryker.config.mjs"],
    timeoutMs: 3_600_000,
    toolVersions: {
      "@stryker-mutator/core": "10.0.0",
      "@stryker-mutator/vitest-runner": "10.0.0",
      "@stryker-mutator/typescript-checker": "10.0.0",
    },
    scope: ["src/**/*.ts", "!src/**/*.d.ts"],
    thresholds: {
      runnableMutationScore: 100,
      survived: 0,
      uncovered: 0,
      runtimeErrors: 0,
      compileErrors: "reported separately",
    },
    cleanPaths: ["reports/mutation", ".stryker-tmp"],
    outputFiles: ["reports/mutation/mutation.json"],
  },
};

describe("local quality gate wrappers", () => {
  it.each(["coverage", "crap", "knip", "mutation"] as const)(
    "runs and validates the %s gate",
    async (gateId) => {
      const root = await createFixture();
      if (gateId === "crap") {
        await writeCoverage(root);
      }
      const expected = EXPECTED_GATES[gateId];
      await writeStaleGateArtifacts(root, expected.cleanPaths);
      const runner = new FakeRunner(async () => {
        await expectGateArtifactsRemoved(root, expected.cleanPaths);
        if (gateId === "knip") {
          await rm(join(root, "reports"), { recursive: true });
        }
        await writePassingEvidence(gateId, root);
        return exited(gateId === "knip" ? '{"issues":[]}\n' : "");
      });

      const result = await runLocalQualityGate(gateId, root, { commandRunner: runner, now: () => 0 });

      expect(result).toMatchObject({
        exitCode: 0,
        summary: {
          gateId,
          toolVersions: expected.toolVersions,
          command: { executable: `node_modules/.bin/${expected.executable}`, args: expected.args },
          scope: expected.scope,
          thresholds: expected.thresholds,
          status: "passed",
          reason: `${gateId} evidence is current, complete, and satisfies policy.`,
        },
      });
      expect(Object.keys(result.summary.inputDigests).sort()).toEqual(
        gateId === "coverage"
          ? ["src/domain/value.ts"]
          : gateId === "crap"
            ? ["coverage/coverage-final.json", "coverage/lcov.info", "src/domain/value.ts"]
            : [],
      );
      expect(Object.keys(result.summary.outputDigests).sort()).toEqual([...expected.outputFiles].sort());
      expect(result.summaryDigest).toMatch(/^[a-f0-9]{64}$/u);
      expect(runner.requests).toHaveLength(1);
      expect(runner.requests[0]).toEqual({
        executable: join(root, `node_modules/.bin/${expected.executable}`),
        args: expected.args,
        cwd: root,
        stdin: null,
        timeoutMs: expected.timeoutMs,
      });
    },
  );

  it("preserves a native gate failure", async () => {
    const root = await createFixture();
    await writeCoverage(root);
    const runner = new FakeRunner(async () => exited("", 2));

    const result = await runLocalQualityGate("crap", root, { commandRunner: runner, now: () => 0 });

    expect(result).toMatchObject({
      exitCode: 2,
      summary: { status: "failed", reason: "crap process exited with status 2." },
    });
  });

  it("blocks CRAP when coverage was generated for different production sources", async () => {
    const root = await createFixture();
    await writeCoverage(root);
    const source = join(root, "src/domain/value.ts");
    await writeFile(source, "export const value = 2;\n", "utf8");
    await utimes(source, 0, 0);
    const runner = new FakeRunner(async () => exited());

    const result = await runLocalQualityGate("crap", root, { commandRunner: runner, now: () => 0 });

    expect(result).toMatchObject({
      exitCode: 1,
      process: null,
      summary: {
        status: "blocked",
        reason: "Coverage quality summary is bound to different production sources.",
      },
    });
    expect(runner.requests).toEqual([]);
  });

  it.each([
    ["gate id", (summary: Record<string, unknown>) => { summary.gateId = "other"; }, /not a passed coverage gate/u],
    ["gate status", (summary: Record<string, unknown>) => { summary.status = "failed"; }, /not a passed coverage gate/u],
    ["missing process", (summary: Record<string, unknown>) => { summary.process = null; }, /successful process/u],
    ["process kind", (summary: Record<string, unknown>) => { summary.process = { kind: "spawn-error", exitCode: 0 }; }, /successful process/u],
    ["process exit", (summary: Record<string, unknown>) => { summary.process = { kind: "exited", exitCode: 1 }; }, /successful process/u],
    ["missing source digests", (summary: Record<string, unknown>) => { summary.inputDigests = null; }, /different production sources/u],
    ["different source keys", (summary: Record<string, unknown>) => { summary.inputDigests = { "src/other.ts": "digest" }; }, /different production sources/u],
    ["different source digest", (summary: Record<string, unknown>) => { summary.inputDigests = { "src/domain/value.ts": "different" }; }, /different production sources/u],
    ["missing report digests", (summary: Record<string, unknown>) => { summary.outputDigests = null; }, /different coverage reports/u],
    ["different coverage digest", (summary: Record<string, unknown>) => {
      const outputDigests = summary.outputDigests as Record<string, unknown>;
      summary.outputDigests = { ...outputDigests, "coverage/coverage-final.json": "different" };
    }, /different coverage reports/u],
    ["different LCOV digest", (summary: Record<string, unknown>) => {
      const outputDigests = summary.outputDigests as Record<string, unknown>;
      summary.outputDigests = { ...outputDigests, "coverage/lcov.info": "different" };
    }, /different coverage reports/u],
  ] as const)("blocks CRAP for invalid coverage summary: %s", async (_label, mutate, message) => {
    const root = await createFixture();
    await writeCoverage(root);
    const summaryPath = join(root, "reports/quality/coverage-summary.json");
    const summary = JSON.parse(await readFile(summaryPath, "utf8")) as Record<string, unknown>;
    mutate(summary);
    await writeJson(summaryPath, summary);
    const runner = new FakeRunner(async () => exited());

    const result = await runLocalQualityGate("crap", root, { commandRunner: runner, now: () => 0 });

    expect(result).toMatchObject({
      exitCode: 1,
      process: null,
      summary: { status: "blocked", reason: expect.stringMatching(message) },
    });
    expect(runner.requests).toEqual([]);
  });

  it.each([
    ["missing", async (path: string) => unlink(path), /Coverage quality summary is missing/u],
    ["malformed", async (path: string) => writeFile(path, "{\n", "utf8"), /Coverage quality summary is malformed JSON/u],
  ] as const)("labels %s coverage summary evidence", async (_label, mutate, message) => {
    const root = await createFixture();
    await writeCoverage(root);
    const summaryPath = join(root, "reports/quality/coverage-summary.json");
    await mutate(summaryPath);
    const runner = new FakeRunner(async () => exited());

    const result = await runLocalQualityGate("crap", root, { commandRunner: runner, now: () => 0 });

    expect(result).toMatchObject({
      exitCode: 1,
      process: null,
      summary: { status: "blocked", reason: expect.stringMatching(message) },
    });
    expect(runner.requests).toEqual([]);
  });

  it("blocks green native output without required evidence", async () => {
    const root = await createFixture();
    const runner = new FakeRunner(async () => exited());

    const result = await runLocalQualityGate("mutation", root, {
      commandRunner: runner,
      now: () => 0,
    });

    expect(result.exitCode).toBe(1);
    expect(result.summary.status).toBe("blocked");
    expect(result.summary.reason).toMatch(/Mutation report is missing/u);
  });

  it("blocks before spawning when the pinned tool is unavailable", async () => {
    const root = await createFixture();
    await unlink(join(root, "node_modules/vitest/package.json"));
    const runner = new FakeRunner(async () => exited());

    const result = await runLocalQualityGate("coverage", root, {
      commandRunner: runner,
      now: () => 0,
    });

    expect(result).toMatchObject({
      exitCode: 1,
      process: null,
      summary: { status: "blocked", process: { kind: "not-run" } },
    });
    expect(result.summary.reason).toMatch(/vitest package manifest is missing/u);
    expect(runner.requests).toEqual([]);
  });

  it("blocks the wrong workspace root and wrong installed version", async () => {
    const wrongRoot = await createFixture();
    await writeJson(join(wrongRoot, "package.json"), { name: "other" });
    const runner = new FakeRunner(async () => exited());
    await expect(runLocalQualityGate("knip", wrongRoot, {
      commandRunner: runner,
      now: () => 0,
    })).resolves.toMatchObject({ summary: { status: "blocked", reason: expect.stringMatching(/package root/u) } });

    const wrongVersion = await createFixture();
    await writeJson(join(wrongVersion, "node_modules/knip/package.json"), {
      name: "knip",
      version: "0.0.0",
    });
    await expect(runLocalQualityGate("knip", wrongVersion, {
      commandRunner: runner,
      now: () => 0,
    })).resolves.toMatchObject({ summary: { status: "blocked", reason: expect.stringMatching(/version must be/u) } });
    expect(runner.requests).toEqual([]);
  });

  it.each([
    ["spawn-error", null],
    ["exited", null],
  ] as const)("blocks an abnormal %s process result", async (kind, exitCode) => {
    const root = await createFixture();
    const runner = new FakeRunner(async () => ({ ...exited(), kind, exitCode }));

    const result = await runLocalQualityGate("knip", root, { commandRunner: runner, now: () => 0 });

    expect(result).toMatchObject({ exitCode: 1, summary: { status: kind === "exited" ? "failed" : "blocked" } });
  });

  it("sanitizes a non-Error runner rejection into a blocker", async () => {
    const root = await createFixture();
    const runner = new FakeRunner(async () => Promise.reject("runner rejected"));

    const result = await runLocalQualityGate("knip", root, { commandRunner: runner, now: () => 0 });

    expect(result).toMatchObject({
      exitCode: 1,
      summary: { status: "blocked", reason: "runner rejected" },
    });
  });

  it("does not create a Knip report for another gate's stdout", async () => {
    const root = await createFixture();
    const runner = new FakeRunner(async () => {
      await writeCoverage(root);
      return exited("not Knip JSON");
    });

    const result = await runLocalQualityGate("coverage", root, {
      commandRunner: runner,
      now: () => 0,
    });

    expect(result.exitCode).toBe(0);
    await expect(access(join(root, "reports/quality/knip.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("blocks empty Knip output with the exact diagnostic", async () => {
    const root = await createFixture();
    const runner = new FakeRunner(async () => exited());

    const result = await runLocalQualityGate("knip", root, {
      commandRunner: runner,
      now: () => 0,
    });

    expect(result).toMatchObject({
      exitCode: 1,
      summary: { status: "blocked", reason: "Knip produced no JSON report." },
    });
  });
});

class FakeRunner implements CommandRunner {
  public readonly requests: CommandRequest[] = [];

  public constructor(
    private readonly handler: (request: CommandRequest) => Promise<ProcessArtifact>,
  ) {}

  public async run(request: CommandRequest): Promise<ProcessArtifact> {
    this.requests.push(request);
    return this.handler(request);
  }
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-gates-"));
  await mkdir(join(root, "src/domain"), { recursive: true });
  await writeFile(join(root, "src/domain/value.ts"), "export const value = 1;\n", "utf8");
  await Promise.all([
    writeJson(join(root, "package.json"), { name: "tsqh-mvp" }),
    writeFile(join(root, "vitest.config.ts"), "export default {};\n", "utf8"),
    writeJson(join(root, "tsconfig.json"), {}),
    writeJson(join(root, "tsconfig.test.json"), {}),
    writeJson(join(root, "knip.json"), {}),
    writeFile(join(root, "stryker.config.mjs"), "export default {};\n", "utf8"),
  ]);
  for (const [packageName, version] of Object.entries(PACKAGE_VERSIONS)) {
    await writeJson(join(root, "node_modules", packageName, "package.json"), {
      name: packageName,
      version,
    });
  }
  return root;
}

async function writePassingEvidence(gateId: LocalQualityGateId, root: string): Promise<void> {
  if (gateId === "coverage") {
    await writeCoverage(root);
  } else if (gateId === "crap") {
    await writeCrapReport(root);
  } else if (gateId === "mutation") {
    await writeMutationReport(root);
  }
}

async function writeStaleGateArtifacts(root: string, paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    const target = join(root, path);
    if (path.endsWith(".json")) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, "stale\n", "utf8");
    } else {
      await mkdir(target, { recursive: true });
      await writeFile(join(target, "stale"), "stale\n", "utf8");
    }
  }
}

async function expectGateArtifactsRemoved(root: string, paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    await expect(access(join(root, path))).rejects.toMatchObject({ code: "ENOENT" });
  }
}

async function writeCoverage(root: string): Promise<void> {
  const source = join(root, "src/domain/value.ts");
  const report = {
    [source]: {
      path: source,
      statementMap: { "0": { start: { line: 1, column: 0 }, end: { line: 1, column: 23 } } },
      fnMap: {},
      branchMap: {},
      s: { "0": 1 },
      f: {},
      b: {},
    },
  };
  await writeJson(join(root, "coverage/coverage-final.json"), report);
  await writeFile(
    join(root, "coverage/lcov.info"),
    [`SF:${source}`, "FNF:0", "FNH:0", "BRF:0", "BRH:0", "LF:1", "LH:1", "end_of_record", ""].join("\n"),
    "utf8",
  );
  const validation = await validateCoverage({ workspace: root, invocationStartedAtMs: 0 });
  await writeJson(join(root, "reports/quality/coverage-summary.json"), {
    gateId: "coverage",
    status: "passed",
    process: { kind: "exited", exitCode: 0 },
    inputDigests: validation.sourceDigests,
    outputDigests: {
      "coverage/coverage-final.json": validation.coverageDigest,
      "coverage/lcov.info": validation.lcovDigest,
    },
  });
}

async function writeCrapReport(root: string): Promise<void> {
  await writeJson(join(root, "reports/quality/crap.json"), {
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
    sourceInventory: { analyzed: ["src/domain/value.ts"], excluded: [], declarations: [] },
    coverageInventory: {
      file: "coverage/coverage-final.json",
      recordedFiles: ["src/domain/value.ts"],
    },
    metrics: [{ file: "src/domain/value.ts", crap: 1, violatesThreshold: false }],
    diagnostics: [],
    summary: { files: 1, units: 1, violations: 0, maximumCrap: 1 },
  });
}

async function writeMutationReport(root: string): Promise<void> {
  const thresholds = { high: 100, low: 100, break: 100 };
  await writeJson(join(root, "reports/mutation/mutation.json"), {
    schemaVersion: "1.0",
    projectRoot: root,
    thresholds,
    framework: { name: "StrykerJS", version: "10.0.0" },
    files: {
      "src/domain/value.ts": {
        language: "typescript",
        source: "export const value = 1;\n",
        mutants: [
          { id: "0", status: "Killed" },
          {
            id: "1",
            status: "CompileError",
            statusReason: "TypeScript rejected the generated mutation.",
          },
        ],
      },
    },
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

function exited(stdout = "", exitCode = 0): ProcessArtifact {
  return {
    kind: "exited",
    exitCode,
    signal: null,
    stdout,
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}
