import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CommandRequest, CommandRunner } from "../../src/application/ports.js";
import type { ProcessArtifact } from "../../src/domain/types.js";
import type { SonarApi, SonarApiRequest } from "../../src/quality/sonar-api.js";
import { runSonarQualityGate, type SonarGateRuntime } from "../../src/quality/sonar-gate.js";
import { validateCoverage } from "../../src/quality/coverage.js";

const token = "sonar-runner-secret";

describe("Sonar quality gate wrapper", () => {
  it("runs the scanner and validates current computed server evidence", async () => {
    const root = await createFixture();
    await writeFile(join(root, ".scannerwork/report-task.txt"), "stale", "utf8");
    await writeJson(join(root, "reports/quality/sonar-summary.json"), { stale: true });
    const runner = new FakeRunner(async () => {
      await expect(access(join(root, ".scannerwork/report-task.txt"))).rejects.toThrow();
      await expect(access(join(root, "reports/quality/sonar-summary.json"))).rejects.toThrow();
      await writeTaskReport(root);
      return exited(`scanner ${token}`, `debug ${token}`);
    });
    const api = passingApi();

    const result = await runSonarQualityGate(root, runtime(runner, api));

    expect(result).toMatchObject({
      exitCode: 0,
      process: { stdout: "scanner [REDACTED]", stderr: "debug [REDACTED]" },
      summary: { gateId: "sonar", status: "passed", process: { kind: "exited", exitCode: 0 } },
    });
    expect(result.summary.command).toEqual({
      executable: "node_modules/.bin/sonar-scanner-npm",
      args: [],
    });
    expect(result.summary.inputDigests).toEqual({
      "src/domain/value.ts": expect.stringMatching(/^[a-f0-9]{64}$/u),
      "coverage/coverage-final.json": expect.stringMatching(/^[a-f0-9]{64}$/u),
      "coverage/lcov.info": expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(result.summary.thresholds).toEqual({
      openIssues: 0,
      reviewedSecurityHotspots: 100,
      coverage: 90,
      duplicatedLines: 3,
      qualityGate: "OK",
      waitSeconds: 300,
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(Object.keys(result.summary.outputDigests)).toEqual([
      ".scannerwork/report-task.txt",
      "sonar:compute-task",
      "sonar:quality-gate",
      "sonar:remote-policy",
    ]);
    expect(runner.requests).toHaveLength(1);
    expect(runner.requests[0]).toMatchObject({
      args: [],
      cwd: root,
      environmentKeys: ["SONAR_HOST_URL", "SONAR_TOKEN", "SONAR_ORGANIZATION"],
      stdin: null,
      timeoutMs: 360_000,
    });
    expect(basename(runner.requests[0]!.executable)).toBe("sonar-scanner-npm");
    expect(api.requests.map(({ path, parameters }) => ({ path, parameters }))).toEqual([
      { path: "/api/ce/task", parameters: { id: "task-1" } },
      { path: "/api/qualitygates/project_status", parameters: { analysisId: "analysis-1" } },
      { path: "/api/qualitygates/get_by_project", parameters: { project: "tsqh-test" } },
      { path: "/api/qualitygates/show", parameters: { name: "TSQH strict" } },
      {
        path: "/api/qualityprofiles/search",
        parameters: { language: "ts", project: "tsqh-test" },
      },
      {
        path: "/api/new_code_periods/show",
        parameters: { branch: "main", project: "tsqh-test" },
      },
    ]);
    expect(api.requests.every((request) => request.token === token)).toBe(true);
  });

  it("blocks missing credentials before spawning or requesting", async () => {
    const root = await createFixture();
    const runner = new FakeRunner(async () => exited());
    const api = passingApi();

    const result = await runSonarQualityGate(root, {
      ...runtime(runner, api),
      environment: {},
    });

    expect(result).toMatchObject({
      exitCode: 1,
      process: null,
      summary: { status: "blocked", reason: expect.stringMatching(/SONAR_TOKEN is missing/u) },
    });
    expect(runner.requests).toEqual([]);
    expect(api.requests).toEqual([]);
  });

  it("preserves scanner failure and does not trust or query downstream evidence", async () => {
    const root = await createFixture();
    const runner = new FakeRunner(async () => exited("green-looking output", "", 2));
    const api = passingApi();

    const result = await runSonarQualityGate(root, runtime(runner, api));

    expect(result).toMatchObject({
      exitCode: 2,
      summary: { status: "failed", reason: "sonar process exited with status 2." },
    });
    expect(api.requests).toEqual([]);
  });

  it.each(["spawn-error", "timeout", "signal"] as const)(
    "blocks an abnormal scanner %s result",
    async (kind) => {
      const root = await createFixture();
      const runner = new FakeRunner(async () => ({
        ...exited(),
        kind,
        exitCode: null,
        signal: kind === "signal" ? "SIGTERM" : null,
      }));

      const result = await runSonarQualityGate(root, runtime(runner, passingApi()));

      expect(result).toMatchObject({ exitCode: 1, summary: { status: "blocked" } });
    },
  );

  it("blocks a missing task report after scanner success", async () => {
    const root = await createFixture();
    const api = passingApi();

    const result = await runSonarQualityGate(
      root,
      runtime(new FakeRunner(async () => exited()), api),
    );

    expect(result.summary.reason).toMatch(/Sonar task report is missing/u);
    expect(api.requests).toEqual([]);
  });

  it("blocks a red computed gate", async () => {
    const root = await createFixture();
    const runner = taskWritingRunner(root);
    const api = passingApi({
      "/api/qualitygates/project_status": {
        projectStatus: { status: "ERROR", ignoredConditions: false, conditions: conditions() },
      },
    });

    const result = await runSonarQualityGate(root, runtime(runner, api));

    expect(result).toMatchObject({
      exitCode: 1,
      summary: { status: "blocked", reason: expect.stringMatching(/computed quality gate/u) },
    });
  });

  it("blocks a mismatched assigned policy", async () => {
    const root = await createFixture();
    const api = passingApi({
      "/api/qualitygates/get_by_project": { qualityGate: { name: "Other" } },
    });

    const result = await runSonarQualityGate(root, runtime(taskWritingRunner(root), api));

    expect(result.summary.reason).toMatch(/quality-gate definition name/u);
  });

  it.each([
    ["missing", undefined, /definition response must be an object/u],
    [
      "duplicate",
      { name: "TSQH strict", conditions: [...configuredConditions(), configuredConditions()[0]] },
      /repeats condition/u,
    ],
    [
      "stale",
      {
        name: "TSQH strict",
        conditions: configuredConditions().map((condition) =>
          condition.metric === "coverage" ? { ...condition, error: "80" } : condition
        ),
      },
      /coverage threshold/u,
    ],
    ["malformed", { name: "TSQH strict", conditions: null }, /conditions are missing/u],
  ] as const)("blocks a %s gate-definition response", async (_label, response, message) => {
    const root = await createFixture();
    const api = passingApi({ "/api/qualitygates/show": response });

    const result = await runSonarQualityGate(root, runtime(taskWritingRunner(root), api));

    expect(result).toMatchObject({
      exitCode: 1,
      summary: { status: "blocked", reason: expect.stringMatching(message) },
    });
  });

  it("redacts secrets from API failures and the summary", async () => {
    const root = await createFixture();
    const api = new FakeApi(async () => Promise.reject(new Error(`failure ${token}`)));

    const result = await runSonarQualityGate(root, runtime(taskWritingRunner(root), api));

    expect(result.summary.reason).toBe("failure [REDACTED]");
    expect(JSON.stringify(result)).not.toContain(token);
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

class FakeApi implements SonarApi {
  public readonly requests: SonarApiRequest[] = [];

  public constructor(private readonly handler: (request: SonarApiRequest) => Promise<unknown>) {}

  public async getJson(request: SonarApiRequest): Promise<unknown> {
    this.requests.push(request);
    return this.handler(request);
  }
}

function runtime(commandRunner: CommandRunner, sonarApi: SonarApi): SonarGateRuntime {
  return {
    commandRunner,
    environment: {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
    },
    now: () => 0,
    sonarApi,
  };
}

function passingApi(overrides: Readonly<Record<string, unknown>> = {}): FakeApi {
  const responses: Readonly<Record<string, unknown>> = {
    "/api/ce/task": {
      task: { id: "task-1", componentKey: "tsqh-test", status: "SUCCESS", analysisId: "analysis-1" },
    },
    "/api/qualitygates/project_status": {
      projectStatus: { status: "OK", ignoredConditions: false },
    },
    "/api/qualitygates/get_by_project": { qualityGate: { name: "TSQH strict" } },
    "/api/qualitygates/show": { name: "TSQH strict", conditions: configuredConditions() },
    "/api/qualityprofiles/search": {
      profiles: [{ name: "TSQH TypeScript", language: "ts" }],
    },
    "/api/new_code_periods/show": {
      projectKey: "tsqh-test",
      branchKey: "main",
      type: "PREVIOUS_VERSION",
    },
    ...overrides,
  };
  return new FakeApi(async ({ path }) => responses[path]);
}

function taskWritingRunner(root: string): FakeRunner {
  return new FakeRunner(async () => {
    await writeTaskReport(root);
    return exited();
  });
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-sonar-gate-"));
  await mkdir(join(root, "src/domain"), { recursive: true });
  await mkdir(join(root, "test"));
  await mkdir(join(root, "coverage"));
  await mkdir(join(root, ".scannerwork"));
  const source = join(root, "src/domain/value.ts");
  await writeFile(source, "export const value = 1;\n", "utf8");
  await writeJson(join(root, "package.json"), { name: "tsqh-mvp" });
  await writeJson(join(root, "node_modules/@sonar/scan/package.json"), {
    name: "@sonar/scan",
    version: "5.0.0",
  });
  await writeFile(join(root, "vitest.config.ts"), "export default {};\n", "utf8");
  await writeFile(join(root, "sonar-project.properties"), sonarProperties(), "utf8");
  await writeJson(join(root, "sonar-policy.json"), sonarPolicy());
  await writeJson(join(root, "coverage/coverage-final.json"), {
    [source]: {
      path: source,
      statementMap: { "0": { start: { line: 1, column: 0 }, end: { line: 1, column: 23 } } },
      fnMap: {},
      branchMap: {},
      s: { "0": 1 },
      f: {},
      b: {},
    },
  });
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
  return root;
}

async function writeTaskReport(root: string): Promise<void> {
  await mkdir(join(root, ".scannerwork"), { recursive: true });
  await writeFile(
    join(root, ".scannerwork/report-task.txt"),
    [
      "projectKey=tsqh-test",
      "serverUrl=https://sonar.example.test",
      "ceTaskId=task-1",
      "ceTaskUrl=https://sonar.example.test/api/ce/task?id=task-1",
      "",
    ].join("\n"),
    "utf8",
  );
}

function exited(stdout = "", stderr = "", exitCode = 0): ProcessArtifact {
  return {
    kind: "exited",
    exitCode,
    signal: null,
    stdout,
    stderr,
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

function sonarProperties(): string {
  return [
    "sonar.projectKey=tsqh-test",
    "sonar.sources=src",
    "sonar.tests=test",
    "sonar.sourceEncoding=UTF-8",
    "sonar.javascript.lcov.reportPaths=coverage/lcov.info",
    "sonar.exclusions=dist/**,coverage/**,reports/**,.scannerwork/**,.stryker-tmp/**",
    "sonar.qualitygate.wait=true",
    "sonar.qualitygate.timeout=300",
    "sonar.qualitygate.ignoreSmallChanges=false",
    "",
  ].join("\n");
}

function sonarPolicy(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    hostUrl: "https://sonar.example.test",
    projectKey: "tsqh-test",
    organization: null,
    qualityGate: "TSQH strict",
    typescriptProfile: "TSQH TypeScript",
    newCodeDefinition: "PREVIOUS_VERSION",
  };
}

function conditions(): readonly Record<string, unknown>[] {
  const values = {
    violations: ["GT", "0"],
    new_violations: ["GT", "0"],
    security_hotspots_reviewed: ["LT", "100"],
    new_security_hotspots_reviewed: ["LT", "100"],
    coverage: ["LT", "90"],
    new_coverage: ["LT", "90"],
    duplicated_lines_density: ["GT", "3"],
    new_duplicated_lines_density: ["GT", "3"],
  } as const;
  return Object.entries(values).map(([metricKey, [comparator, errorThreshold]]) => ({
    metricKey,
    comparator,
    errorThreshold,
    status: "OK",
  }));
}

function configuredConditions(): readonly Record<string, unknown>[] {
  return conditions().map(({ metricKey, comparator, errorThreshold }) => ({
    metric: metricKey,
    op: comparator,
    error: errorThreshold,
  }));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}
