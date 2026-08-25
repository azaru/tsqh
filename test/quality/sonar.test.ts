import { mkdir, mkdtemp, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readRemoteSonarPolicy,
  redactSecrets,
  validateSonarPolicy,
  validateSonarPreflight,
  validateSonarResult,
  type SonarResultOptions,
} from "../../src/quality/sonar.js";

const token = "sonar-test-secret";

describe("Sonar evidence", () => {
  it("rejects missing environment credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-sonar-env-"));

    await expect(validateSonarPreflight(root, {})).rejects.toThrow(/SONAR_TOKEN is missing/u);
  });

  it("accepts non-secret configuration with current LCOV", async () => {
    const root = await createPreflightFixture();

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
    })).resolves.toMatchObject({
      hostUrl: "https://sonar.example.test",
      projectKey: "tsqh-test",
      organization: null,
    });
  });

  it("rejects an absent LCOV import", async () => {
    const root = await createPreflightFixture(false);

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
    })).rejects.toThrow(/LCOV report is missing/u);
  });

  it.each([
    [{ SONAR_TOKEN: token }, /SONAR_HOST_URL is missing/u],
    [{ SONAR_TOKEN: ` ${token}`, SONAR_HOST_URL: "https://sonar.example.test" }, /surrounding whitespace/u],
    [{ SONAR_TOKEN: token, SONAR_HOST_URL: "not-a-url" }, /SONAR_HOST_URL is not a valid URL/u],
    [{ SONAR_TOKEN: token, SONAR_HOST_URL: "ftp://sonar.example.test" }, /HTTP\(S\)/u],
    [{ SONAR_TOKEN: token, SONAR_HOST_URL: "https://user@sonar.example.test" }, /HTTP\(S\)/u],
    [{ SONAR_TOKEN: token, SONAR_HOST_URL: "https://sonar.example.test?query=1" }, /HTTP\(S\)/u],
    [{ SONAR_TOKEN: token, SONAR_HOST_URL: "https://sonar.example.test#hash" }, /HTTP\(S\)/u],
  ])("rejects invalid Sonar environment %#", async (environment, message) => {
    const root = await createPreflightFixture();

    await expect(validateSonarPreflight(root, environment)).rejects.toThrow(message);
  });

  it.each([
    ["persisted token", (content: string) => `${content}sonar.note=${token}\n`, /contains SONAR_TOKEN/u],
    ["required property", (content: string) => content.replace("sonar.sources=src", "sonar.sources=lib"), /sonar.sources/u],
    ["secret property", (content: string) => `${content}sonar.login=stored\n`, /secret-bearing property/u],
    ["project key", (content: string) => content.replace("sonar.projectKey=tsqh-test", "sonar.projectKey=bad key"), /projectKey.*invalid/u],
    ["duplicate property", (content: string) => `${content}sonar.sources=src\n`, /Duplicate property/u],
    ["malformed property", (content: string) => `${content}malformed\n`, /Malformed property/u],
  ])("rejects invalid Sonar configuration: %s", async (_label, mutate, message) => {
    const root = await createPreflightFixture();
    await writeFile(join(root, "sonar-project.properties"), mutate(sonarProperties()), "utf8");

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
    })).rejects.toThrow(message);
  });

  it("requires exact organization agreement", async () => {
    const root = await createPreflightFixture();
    await writeFile(
      join(root, "sonar-project.properties"),
      `${sonarProperties()}sonar.organization=expected\n`,
      "utf8",
    );

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
      SONAR_ORGANIZATION: "other",
    })).rejects.toThrow(/does not match sonar.organization/u);
  });

  it("accepts one explicitly matching organization", async () => {
    const root = await createPreflightFixture();
    await writeFile(
      join(root, "sonar-project.properties"),
      `${sonarProperties()}sonar.organization=expected\n`,
      "utf8",
    );
    await writePolicy(root, { organization: "expected" });

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
      SONAR_ORGANIZATION: "expected",
    })).resolves.toMatchObject({ organization: "expected" });
  });

  it("rejects a policy organization that differs from matching configuration and environment", async () => {
    const root = await createPreflightFixture();
    await writeFile(
      join(root, "sonar-project.properties"),
      `${sonarProperties()}sonar.organization=expected\n`,
      "utf8",
    );
    await writePolicy(root, { organization: "other" });

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
      SONAR_ORGANIZATION: "expected",
    })).rejects.toThrow(/Sonar approved organization/u);
  });

  it("accepts whitespace around properties and leading whitespace before comments", async () => {
    const root = await createPreflightFixture();
    const spaced = sonarProperties()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const separator = line.indexOf("=");
        return `  ${line.slice(0, separator)} = ${line.slice(separator + 1)}  `;
      });
    await writeFile(
      join(root, "sonar-project.properties"),
      [`   # approved configuration`, ...spaced, ""].join("\n"),
      "utf8",
    );

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
    })).resolves.toMatchObject({ projectKey: "tsqh-test" });
  });

  it("reports the exact malformed property line and rejects an empty key", async () => {
    const root = await createPreflightFixture();
    await writeFile(join(root, "sonar-project.properties"), "# comment\n\n=value\n", "utf8");

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
    })).rejects.toThrow(/Malformed property on line 3/u);
  });

  it("accepts the approved HTTP protocol and rejects password-only URL metadata", async () => {
    const root = await createPreflightFixture();
    await writePolicy(root, { hostUrl: "http://sonar.example.test" });

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "http://sonar.example.test",
      SONAR_TOKEN: token,
    })).resolves.toMatchObject({ hostUrl: "http://sonar.example.test" });
    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://:password@sonar.example.test",
      SONAR_TOKEN: token,
    })).rejects.toThrow(/HTTP\(S\).*without credentials/u);
  });

  it.each([
    ["missing", async (root: string) => unlink(join(root, "sonar-policy.json")), /policy identity is missing/u],
    ["secret", async (root: string) => writeFile(join(root, "sonar-policy.json"), JSON.stringify({ ...sonarPolicy(), qualityGate: token })), /contains SONAR_TOKEN/u],
    ["unknown field", async (root: string) => writeFile(join(root, "sonar-policy.json"), JSON.stringify({ ...sonarPolicy(), extra: true })), /missing or unknown/u],
    ["host mismatch", async (root: string) => writeFile(join(root, "sonar-policy.json"), JSON.stringify({ ...sonarPolicy(), hostUrl: "https://other.example.test" })), /approved host URL/u],
    ["project mismatch", async (root: string) => writeFile(join(root, "sonar-policy.json"), JSON.stringify({ ...sonarPolicy(), projectKey: "other" })), /approved project key/u],
    ["key inventory", async (root: string) => {
      const policy = sonarPolicy();
      delete policy.schemaVersion;
      await writeFile(join(root, "sonar-policy.json"), JSON.stringify({ ...policy, replacement: 1 }));
    }, /missing or unknown/u],
    ["schema version", async (root: string) => writePolicy(root, { schemaVersion: 2 }), /schemaVersion must be 1/u],
    ["project prefix", async (root: string) => writePolicy(root, { projectKey: " bad" }), /policy project key is invalid/u],
    ["project suffix", async (root: string) => writePolicy(root, { projectKey: "bad " }), /policy project key is invalid/u],
    ["missing project", async (root: string) => writePolicy(root, { projectKey: null }), /Sonar policy project key is missing/u],
    ["organization type", async (root: string) => writePolicy(root, { organization: 1 }), /Sonar policy organization is missing/u],
    ["quality gate", async (root: string) => writePolicy(root, { qualityGate: null }), /Sonar policy quality gate is missing/u],
    ["profile", async (root: string) => writePolicy(root, { typescriptProfile: null }), /Sonar policy TypeScript profile is missing/u],
    ["new code", async (root: string) => writePolicy(root, { newCodeDefinition: null }), /Sonar policy new-code definition is missing/u],
    ["malformed JSON", async (root: string) => writeFile(join(root, "sonar-policy.json"), "{") , /Sonar policy identity is malformed JSON/u],
  ] as const)("rejects invalid Sonar policy identity: %s", async (_label, mutate, message) => {
    const root = await createPreflightFixture();
    await mutate(root);

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
    })).rejects.toThrow(message);
  });

  it("normalizes an empty optional organization to no organization", async () => {
    const root = await createPreflightFixture();
    await writePolicy(root, { organization: "" });

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
    })).resolves.toMatchObject({ organization: null });
  });

  it("labels a missing Sonar configuration exactly", async () => {
    const root = await createPreflightFixture();
    await unlink(join(root, "sonar-project.properties"));

    await expect(validateSonarPreflight(root, {
      SONAR_HOST_URL: "https://sonar.example.test",
      SONAR_TOKEN: token,
    })).rejects.toThrow(/Sonar configuration is missing/u);
  });

  it("accepts a computed OK gate and redacts scanner output", async () => {
    const options = await createResultOptions();
    options.process = {
      kind: "exited",
      exitCode: 0,
      stdout: `analysis complete ${token}`,
      stderr: `debug ${token}`,
    };

    const result = await validateSonarResult(options);

    expect(result).toMatchObject({ gateStatus: "OK", taskId: "task-1", analysisId: "analysis-1" });
    expect(result.redactedStdout).toBe("analysis complete [REDACTED]");
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it.each([
    [{ kind: "spawn-error", exitCode: null }, /spawn-error/u],
    [{ kind: "timeout", exitCode: null }, /timeout/u],
    [{ kind: "signal", exitCode: null }, /signal/u],
    [{ kind: "exited", exitCode: 1 }, /status 1/u],
  ] as const)("rejects scanner process failure %#", async (process, message) => {
    const options = await createResultOptions();
    options.process = { ...process, stdout: "", stderr: "" };

    await expect(validateSonarResult(options)).rejects.toThrow(message);
  });

  it("rejects a missing computed gate", async () => {
    const options = await createResultOptions();
    options.qualityGateResponse = {};

    await expect(validateSonarResult(options)).rejects.toThrow(/project status must be an object/u);
  });

  it("rejects a red computed gate", async () => {
    const options = await createResultOptions();
    options.qualityGateResponse = {
      projectStatus: { status: "ERROR", ignoredConditions: false, conditions: conditions() },
    };

    await expect(validateSonarResult(options)).rejects.toThrow(/computed quality gate must be "OK"/u);
  });

  it("accepts a computed gate that omits conditions without computed measures", async () => {
    const options = await createResultOptions();
    delete projectStatus(options).conditions;

    await expect(validateSonarResult(options)).resolves.toMatchObject({ gateStatus: "OK" });
  });

  it("rejects a mismatched profile or new-code definition", async () => {
    const options = await createResultOptions();
    options.remotePolicy = { ...options.remotePolicy, typescriptProfile: "Unapproved profile" };

    await expect(validateSonarResult(options)).rejects.toThrow(/typescriptProfile.*approved policy/u);
  });

  it.each([
    ["compute response", (options: MutableResultOptions) => options.computeTaskResponse = null, /compute-task response must be an object/u],
    ["compute task", (options: MutableResultOptions) => options.computeTaskResponse = { task: null }, /compute task must be an object/u],
    ["task id", (options: MutableResultOptions) => task(options).id = "wrong", /compute task id/u],
    ["component key", (options: MutableResultOptions) => task(options).componentKey = "wrong", /project key/u],
    ["task status", (options: MutableResultOptions) => task(options).status = "FAILED", /task status/u],
    ["analysis id", (options: MutableResultOptions) => task(options).analysisId = "", /analysis id is missing/u],
    ["quality response", (options: MutableResultOptions) => options.qualityGateResponse = null, /quality-gate response must be an object/u],
    ["ignored conditions", (options: MutableResultOptions) => projectStatus(options).ignoredConditions = true, /ignored conditions/u],
    ["condition inventory", (options: MutableResultOptions) => projectStatus(options).conditions = null, /conditions are malformed/u],
    ["condition object", (options: MutableResultOptions) => projectStatus(options).conditions = [null], /condition must be an object/u],
    ["condition key", (options: MutableResultOptions) => projectStatus(options).conditions = [{ metricKey: "" }], /metric key is missing/u],
    ["duplicate condition", (options: MutableResultOptions) => projectStatus(options).conditions = [...conditions(), conditions()[0]], /repeats condition/u],
    ["condition status", (options: MutableResultOptions) => condition(options, "coverage").status = "ERROR", /computed coverage status/u],
    ["empty approved policy", (options: MutableResultOptions) => options.expectedPolicy = { ...options.expectedPolicy, qualityGate: "" }, /qualityGate.*approved policy/u],
  ])("rejects invalid Sonar result: %s", async (_label, mutate, message) => {
    const options = await createResultOptions();
    mutate(options);

    await expect(validateSonarResult(options)).rejects.toThrow(message);
  });

  it.each([
    ["secret", (content: string) => `${content}${token}\n`, /task report contains a secret/u],
    ["missing task id", (content: string) => content.replace(/^ceTaskId=.*\n/mu, ""), /task id is missing/u],
    ["project key", (content: string) => content.replace("projectKey=tsqh-test", "projectKey=wrong"), /task project key/u],
    ["server URL", (content: string) => content.replaceAll("https://sonar.example.test", "https://other.example.test"), /task server URL/u],
    ["task URL", (content: string) => content.replace("id=task-1", "id=wrong"), /does not match/u],
    ["task URL origin", (content: string) => content.replace("ceTaskUrl=https://sonar.example.test", "ceTaskUrl=https://other.example.test"), /does not match/u],
    ["invalid task URL", (content: string) => content.replace("ceTaskUrl=https://sonar.example.test/api/ce/task?id=task-1", "ceTaskUrl=not-a-url"), /Sonar compute task URL is not a valid URL/u],
    ["missing task URL", (content: string) => content.replace(/^ceTaskUrl=.*\n/mu, ""), /Sonar compute task URL is missing/u],
  ])("rejects invalid scanner task report: %s", async (_label, mutate, message) => {
    const options = await createResultOptions();
    await writeFile(
      join(options.workspace, ".scannerwork/report-task.txt"),
      mutate(taskReport()),
      "utf8",
    );

    await expect(validateSonarResult(options)).rejects.toThrow(message);
  });

  it("labels a missing task report exactly", async () => {
    const options = await createResultOptions();
    await unlink(join(options.workspace, ".scannerwork/report-task.txt"));

    await expect(validateSonarResult(options)).rejects.toThrow(/Sonar task report is missing/u);
  });

  it("rejects secrets returned by remote endpoints", async () => {
    const compute = await createResultOptions();
    compute.computeTaskResponse = { task: { note: token } };
    await expect(validateSonarResult(compute)).rejects.toThrow(/compute-task response contains a secret/u);

    const quality = await createResultOptions();
    quality.qualityGateResponse = { projectStatus: { note: token } };
    await expect(validateSonarResult(quality)).rejects.toThrow(/quality-gate response contains a secret/u);
  });

  it("reads the assigned remote policy identity", () => {
    expect(readRemoteSonarPolicy(policyResponses(), token, "tsqh-test")).toEqual({
      qualityGate: "TSQH strict",
      typescriptProfile: "TSQH TypeScript",
      newCodeDefinition: "PREVIOUS_VERSION",
    });
  });

  it("retains the assigned value in a parameterized new-code definition", () => {
    const responses = policyResponses();
    responses.newCodePeriod = {
      projectKey: "tsqh-test",
      branchKey: "main",
      type: "NUMBER_OF_DAYS",
      value: "30",
      inherited: false,
    };

    expect(readRemoteSonarPolicy(responses, token, "tsqh-test").newCodeDefinition).toBe("NUMBER_OF_DAYS:30");
  });

  it("treats an empty new-code value as absent", () => {
    const responses = policyResponses();
    responses.newCodePeriod = {
      projectKey: "tsqh-test",
      branchKey: "main",
      type: "PREVIOUS_VERSION",
      value: "",
      inherited: false,
    };

    expect(readRemoteSonarPolicy(responses, token, "tsqh-test").newCodeDefinition).toBe("PREVIOUS_VERSION");
  });

  it("rejects a secret in the remote policy response and ignores an empty token", () => {
    const secretBearing = policyResponses();
    secretBearing.newCodePeriod = {
      projectKey: "tsqh-test",
      branchKey: "main",
      type: "PREVIOUS_VERSION",
      note: token,
    };
    expect(() => readRemoteSonarPolicy(secretBearing, token, "tsqh-test")).toThrow(
      /Sonar remote policy response contains a secret/u,
    );
    expect(() => readRemoteSonarPolicy(policyResponses(), "", "tsqh-test")).not.toThrow();
  });

  it("rejects matching empty approved and remote policy identities", () => {
    const empty = { qualityGate: "", typescriptProfile: "", newCodeDefinition: "" };

    expect(() => validateSonarPolicy(empty, empty)).toThrow(/qualityGate.*approved policy/u);
  });

  it.each([
    ["gate", { ...policyResponses(), qualityGateAssignment: {} }, /assigned quality gate must be an object/u],
    ["gate response", { ...policyResponses(), qualityGateAssignment: null }, /quality-gate assignment response must be an object/u],
    ["gate name", { ...policyResponses(), qualityGateAssignment: { qualityGate: {} } }, /assigned quality-gate name is missing/u],
    ["definition response", { ...policyResponses(), qualityGateDefinition: null }, /quality-gate definition response must be an object/u],
    ["stale definition", { ...policyResponses(), qualityGateDefinition: { name: "Old gate", conditions: configuredConditions() } }, /definition name/u],
    ["definition conditions", { ...policyResponses(), qualityGateDefinition: { name: "TSQH strict", conditions: null } }, /definition conditions are missing/u],
    ["definition condition", { ...policyResponses(), qualityGateDefinition: { name: "TSQH strict", conditions: [null] } }, /definition condition must be an object/u],
    ["condition metric", { ...policyResponses(), qualityGateDefinition: { name: "TSQH strict", conditions: [{ op: "GT", error: "0" }] } }, /condition metric key is missing/u],
    ["duplicate condition", duplicateConfiguredConditionResponses(), /repeats condition/u],
    ["missing condition", missingConfiguredConditionResponses(), /missing required condition violations/u],
    ["stale comparator", staleConfiguredConditionResponses("coverage", { op: "GT" }), /coverage comparator/u],
    ["stale threshold", staleConfiguredConditionResponses("coverage", { error: "80" }), /coverage threshold/u],
    ["unapproved condition", extraConfiguredConditionResponses(), /unapproved conditions/u],
    ["profile response", { ...policyResponses(), qualityProfiles: null }, /quality-profile response must be an object/u],
    ["profiles", { ...policyResponses(), qualityProfiles: { profiles: [] } }, /missing or ambiguous/u],
    ["profile object", { ...policyResponses(), qualityProfiles: { profiles: [null] } }, /TypeScript quality profile must be an object/u],
    ["profile name", { ...policyResponses(), qualityProfiles: { profiles: [{ language: "ts" }] } }, /TypeScript quality-profile name is missing/u],
    ["profile language", { ...policyResponses(), qualityProfiles: { profiles: [{ name: "TSQH TypeScript", language: "js" }] } }, /profile language/u],
    ["new-code response", { ...policyResponses(), newCodePeriod: null }, /new-code definition response must be an object/u],
    ["stale project", { ...policyResponses(), newCodePeriod: { projectKey: "other", branchKey: "main", type: "PREVIOUS_VERSION" } }, /definition project key/u],
    ["stale branch", { ...policyResponses(), newCodePeriod: { projectKey: "tsqh-test", branchKey: "old", type: "PREVIOUS_VERSION" } }, /definition branch key/u],
    ["inherited new code", { ...policyResponses(), newCodePeriod: { projectKey: "tsqh-test", branchKey: "main", type: "PREVIOUS_VERSION", inherited: true } }, /inheritance/u],
    ["new-code type", { ...policyResponses(), newCodePeriod: { projectKey: "tsqh-test", branchKey: "main" } }, /new-code definition type is missing/u],
    ["new-code value", { ...policyResponses(), newCodePeriod: { projectKey: "tsqh-test", branchKey: "main", type: "NUMBER_OF_DAYS", value: 30 } }, /new-code definition value is missing/u],
  ])("rejects invalid remote policy: %s", (_label, responses, message) => {
    expect(() => readRemoteSonarPolicy(responses, token, "tsqh-test")).toThrow(message);
  });

  it("ignores empty redaction values", () => {
    expect(redactSecrets("unchanged", [""])).toBe("unchanged");
  });
});

async function createPreflightFixture(includeLcov = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-sonar-preflight-"));
  await mkdir(join(root, "src/domain"), { recursive: true });
  await mkdir(join(root, "test"));
  await mkdir(join(root, "coverage"));
  const sourcePath = join(root, "src/domain/value.ts");
  await writeFile(sourcePath, "export function value() { return 1; }\n", "utf8");
  await writeFile(join(root, "sonar-project.properties"), sonarProperties(), "utf8");
  await writeFile(join(root, "sonar-policy.json"), JSON.stringify(sonarPolicy()), "utf8");
  const coverage = {
    [sourcePath]: {
      path: sourcePath,
      statementMap: { "0": { start: { line: 1, column: 0 }, end: { line: 1, column: 38 } } },
      fnMap: { "0": { name: "value" } },
      branchMap: {},
      s: { "0": 1 },
      f: { "0": 1 },
      b: {},
    },
  };
  await writeFile(join(root, "coverage/coverage-final.json"), JSON.stringify(coverage), "utf8");
  if (includeLcov) {
    await writeFile(
      join(root, "coverage/lcov.info"),
      [`SF:${sourcePath}`, "FNF:1", "FNH:1", "BRF:0", "BRH:0", "LF:1", "LH:1", "end_of_record", ""].join("\n"),
      "utf8",
    );
  }
  return root;
}

async function createResultOptions(): Promise<SonarResultOptions & {
  process: SonarResultOptions["process"];
  computeTaskResponse: unknown;
  qualityGateResponse: unknown;
  expectedPolicy: SonarResultOptions["expectedPolicy"];
  remotePolicy: SonarResultOptions["remotePolicy"];
}> {
  const workspace = await mkdtemp(join(tmpdir(), "tsqh-sonar-result-"));
  await mkdir(join(workspace, ".scannerwork"));
  await writeFile(
    join(workspace, ".scannerwork/report-task.txt"),
    taskReport(),
    "utf8",
  );
  const policy = {
    qualityGate: "TSQH strict",
    typescriptProfile: "TSQH TypeScript",
    newCodeDefinition: "previous_version",
  };
  return {
    workspace,
    invocationStartedAtMs: 0,
    hostUrl: "https://sonar.example.test",
    projectKey: "tsqh-test",
    token,
    process: { kind: "exited", exitCode: 0, stdout: "", stderr: "" },
    computeTaskResponse: {
      task: { id: "task-1", componentKey: "tsqh-test", status: "SUCCESS", analysisId: "analysis-1" },
    },
    qualityGateResponse: {
      projectStatus: { status: "OK", ignoredConditions: false, conditions: conditions() },
    },
    expectedPolicy: policy,
    remotePolicy: policy,
  };
}

type MutableResultOptions = Awaited<ReturnType<typeof createResultOptions>>;

function task(options: MutableResultOptions): Record<string, unknown> {
  return (options.computeTaskResponse as Record<string, unknown>).task as Record<string, unknown>;
}

function projectStatus(options: MutableResultOptions): Record<string, unknown> {
  return (options.qualityGateResponse as Record<string, unknown>).projectStatus as Record<string, unknown>;
}

function condition(options: MutableResultOptions, metricKey: string): Record<string, unknown> {
  return (projectStatus(options).conditions as Record<string, unknown>[])
    .find((item) => item.metricKey === metricKey)!;
}

function taskReport(): string {
  return [
    "projectKey=tsqh-test",
    "serverUrl=https://sonar.example.test",
    "ceTaskId=task-1",
    "ceTaskUrl=https://sonar.example.test/api/ce/task?id=task-1",
    "dashboardUrl=https://sonar.example.test/dashboard?id=tsqh-test",
    "",
  ].join("\n");
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

function policyResponses(): {
  qualityGateAssignment: unknown;
  qualityGateDefinition: unknown;
  qualityProfiles: unknown;
  newCodePeriod: unknown;
} {
  return {
    qualityGateAssignment: { qualityGate: { name: "TSQH strict" } },
    qualityGateDefinition: { name: "TSQH strict", conditions: configuredConditions() },
    qualityProfiles: { profiles: [{ name: "TSQH TypeScript", language: "ts" }] },
    newCodePeriod: {
      projectKey: "tsqh-test",
      branchKey: "main",
      type: "PREVIOUS_VERSION",
    },
  };
}

function duplicateConfiguredConditionResponses(): ReturnType<typeof policyResponses> {
  const responses = policyResponses();
  definitionConditions(responses).push({ ...definitionConditions(responses)[0]! });
  return responses;
}

function missingConfiguredConditionResponses(): ReturnType<typeof policyResponses> {
  const responses = policyResponses();
  definitionConditions(responses).shift();
  return responses;
}

function staleConfiguredConditionResponses(
  metric: string,
  replacement: Readonly<Record<string, unknown>>,
): ReturnType<typeof policyResponses> {
  const responses = policyResponses();
  const condition = definitionConditions(responses).find((item) => item.metric === metric)!;
  Object.assign(condition, replacement);
  return responses;
}

function extraConfiguredConditionResponses(): ReturnType<typeof policyResponses> {
  const responses = policyResponses();
  definitionConditions(responses).push({ metric: "reliability_rating", op: "GT", error: "1" });
  return responses;
}

function definitionConditions(
  responses: ReturnType<typeof policyResponses>,
): Record<string, unknown>[] {
  const definition = responses.qualityGateDefinition as Record<string, unknown>;
  return definition.conditions as Record<string, unknown>[];
}

async function writePolicy(
  root: string,
  overrides: Readonly<Record<string, unknown>>,
): Promise<void> {
  await writeFile(
    join(root, "sonar-policy.json"),
    JSON.stringify({ ...sonarPolicy(), ...overrides }),
    "utf8",
  );
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

function configuredConditions(): Record<string, unknown>[] {
  return conditions().map(({ metricKey, comparator, errorThreshold }) => ({
    metric: metricKey,
    op: comparator,
    error: errorThreshold,
  }));
}
