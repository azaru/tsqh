import { join, resolve } from "node:path";
import type { ProcessArtifact } from "../domain/types.js";
import {
  assertNativeQualitySuccess,
  assertQualityWorkspace,
  classifyQualityFailure,
  cleanQualityPaths,
  digestQualityFiles,
  digestText,
  loadPinnedToolVersions,
  summarizeQualityProcess,
} from "./gate-support.js";
import type { QualityGateRunResult, QualityGateRuntime } from "./gates.js";
import type { SonarApi } from "./sonar-api.js";
import {
  readRemoteSonarPolicy,
  readSonarTaskIdentity,
  redactSecrets,
  validateSonarComputeTask,
  validateSonarPolicy,
  validateSonarPreflight,
  validateSonarQualityGate,
  type SonarEnvironment,
  type SonarPolicyResponses,
} from "./sonar.js";
import {
  validateQualitySummary,
  writeQualitySummary,
  type QualityStatus,
  type QualitySummary,
} from "./summary.js";

const ENVIRONMENT_KEYS = ["SONAR_HOST_URL", "SONAR_TOKEN", "SONAR_ORGANIZATION"] as const;
const CONFIG_FILES = [
  "package.json",
  "sonar-project.properties",
  "sonar-policy.json",
  "vitest.config.ts",
] as const;

export interface SonarGateRuntime extends QualityGateRuntime {
  readonly environment: SonarEnvironment;
  readonly sonarApi: SonarApi;
}

export async function runSonarQualityGate(
  workspacePath: string,
  runtime: SonarGateRuntime,
): Promise<QualityGateRunResult> {
  const workspace = resolve(workspacePath);
  const invocationStartedAtMs = runtime.now();
  const token = runtime.environment.SONAR_TOKEN ?? "";
  let process: ProcessArtifact | null = null;
  let toolVersions: Readonly<Record<string, string>> = {};
  let configDigests: Readonly<Record<string, string>> = {};
  let inputDigests: Readonly<Record<string, string>> = {};
  let outputDigests: Readonly<Record<string, string>> = {};
  let status: QualityStatus;
  let reason: string;
  let exitCode: number;

  try {
    const executable = sonarExecutable();
    await assertQualityWorkspace(workspace);
    await cleanQualityPaths(workspace, "sonar", [".scannerwork"]);
    const preflight = await validateSonarPreflight(workspace, runtime.environment);
    configDigests = await digestQualityFiles(workspace, CONFIG_FILES);
    toolVersions = await loadPinnedToolVersions(workspace, { "@sonar/scan": "5.0.0" });
    inputDigests = { "coverage/lcov.info": preflight.coverageDigest };

    const rawProcess = await runtime.commandRunner.run({
      executable: join(workspace, executable),
      args: [],
      cwd: workspace,
      stdin: null,
      timeoutMs: 360_000,
      environmentKeys: ENVIRONMENT_KEYS,
    });
    process = redactProcess(rawProcess, token);
    assertNativeQualitySuccess("sonar", process);

    const task = await readSonarTaskIdentity({
      workspace,
      invocationStartedAtMs,
      hostUrl: preflight.hostUrl,
      projectKey: preflight.projectKey,
      token,
    });
    const computeTask = await request(runtime.sonarApi, preflight.hostUrl, token, "/api/ce/task", {
      id: task.taskId,
    });
    const analysisId = validateSonarComputeTask(
      computeTask,
      task.taskId,
      preflight.projectKey,
      token,
    );
    const qualityGate = await request(
      runtime.sonarApi,
      preflight.hostUrl,
      token,
      "/api/qualitygates/project_status",
      { analysisId },
    );
    validateSonarQualityGate(qualityGate, token);
    const policyResponses = await readPolicyResponses(runtime.sonarApi, preflight.hostUrl, token, preflight.projectKey);
    validateSonarPolicy(preflight.expectedPolicy, readRemoteSonarPolicy(policyResponses, token));

    outputDigests = {
      ".scannerwork/report-task.txt": task.digest,
      "sonar:compute-task": digestJson(computeTask),
      "sonar:quality-gate": digestJson(qualityGate),
      "sonar:remote-policy": digestJson(policyResponses),
    };
    status = "passed";
    reason = `Sonar analysis ${analysisId} has computed gate OK and the approved remote policy.`;
    exitCode = 0;
  } catch (error) {
    const failure = classifyQualityFailure(error, process);
    status = failure.status;
    reason = redactSecrets(failure.reason, [token]);
    exitCode = failure.exitCode;
  }

  const summary: QualitySummary = {
    schemaVersion: 1,
    gateId: "sonar",
    generatedAt: new Date(runtime.now()).toISOString(),
    toolVersions,
    command: { executable: sonarExecutable(), args: [] },
    scope: ["src/**/*.ts", "test/**/*.ts"],
    thresholds: {
      openIssues: 0,
      reviewedSecurityHotspots: 100,
      coverage: 90,
      duplicatedLines: 3,
      qualityGate: "OK",
      waitSeconds: 300,
    },
    configDigests,
    inputDigests,
    outputDigests,
    process: summarizeQualityProcess(process),
    status,
    reason,
  };
  await writeQualitySummary(workspace, summary);
  const summaryDigest = await validateQualitySummary({
    workspace,
    invocationStartedAtMs,
    expected: summary,
    secrets: [token],
  });
  return { exitCode, process, summary, summaryDigest };
}

async function readPolicyResponses(
  api: SonarApi,
  hostUrl: string,
  token: string,
  projectKey: string,
): Promise<SonarPolicyResponses> {
  const qualityGate = await request(api, hostUrl, token, "/api/qualitygates/get_by_project", {
    project: projectKey,
  });
  const qualityProfiles = await request(api, hostUrl, token, "/api/qualityprofiles/search", {
    language: "ts",
    project: projectKey,
  });
  const newCodePeriod = await request(api, hostUrl, token, "/api/new_code_periods/show", {
    project: projectKey,
  });
  return { qualityGate, qualityProfiles, newCodePeriod };
}

function request(
  api: SonarApi,
  hostUrl: string,
  token: string,
  path: string,
  parameters: Readonly<Record<string, string>>,
): Promise<unknown> {
  return api.getJson({ hostUrl, path, parameters, token });
}

function redactProcess(process: ProcessArtifact, token: string): ProcessArtifact {
  return {
    ...process,
    stdout: redactSecrets(process.stdout, [token]),
    stderr: redactSecrets(process.stderr, [token]),
  };
}

function digestJson(value: unknown): string {
  return digestText(JSON.stringify(value));
}

function sonarExecutable(): string {
  return "node_modules/.bin/sonar-scanner-npm";
}
