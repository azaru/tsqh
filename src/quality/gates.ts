import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CommandRunner } from "../application/ports.js";
import type { ProcessArtifact } from "../domain/types.js";
import { assertCurrentCoverageSummary, validateCoverage } from "./coverage.js";
import { validateCrapReport } from "./crap.js";
import {
  assertNativeQualitySuccess,
  assertQualityWorkspace,
  classifyQualityFailure,
  cleanQualityPaths,
  digestText,
  digestQualityFiles,
  loadPinnedToolVersions,
  summarizeQualityProcess,
} from "./gate-support.js";
import { validateKnipResult } from "./knip.js";
import { validateMutationReport } from "./mutation.js";
import {
  validateQualitySummary,
  writeQualitySummary,
  type QualityStatus,
  type QualitySummary,
} from "./summary.js";

export type LocalQualityGateId = "coverage" | "crap" | "knip" | "mutation";

interface GateSpec {
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly packages: Readonly<Record<string, string>>;
  readonly configFiles: readonly string[];
  readonly scope: readonly string[];
  readonly thresholds: Readonly<Record<string, number | string | boolean>>;
  readonly cleanPaths: readonly string[];
}

function gateSpec(gateId: LocalQualityGateId): GateSpec {
  return {
    coverage: {
      executable: "node_modules/.bin/vitest",
      args: ["run", "--coverage"],
      timeoutMs: 900_000,
      packages: { vitest: "4.1.11", "@vitest/coverage-v8": "4.1.11" },
      configFiles: ["package.json", "vitest.config.ts", "tsconfig.json", "tsconfig.test.json"],
      scope: ["src/**/*.ts", "test/**/*.ts"],
      thresholds: { global: 90, domain: 100 },
      cleanPaths: ["coverage"],
    },
    crap: {
      executable: "node_modules/.bin/tscrap",
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
      packages: { "@azaru/tscrap": "0.1.2" },
      configFiles: ["package.json", "vitest.config.ts"],
      scope: ["src/**/*.ts"],
      thresholds: { crap: 6 },
      cleanPaths: ["reports/quality/crap.json"],
    },
    knip: {
      executable: "node_modules/.bin/knip",
      args: ["--config", "knip.json", "--reporter", "json"],
      timeoutMs: 900_000,
      packages: { knip: "6.32.2" },
      configFiles: ["package.json", "knip.json"],
      scope: ["complete project"],
      thresholds: { findings: 0, configurationHints: 0, tagHints: 0 },
      cleanPaths: ["reports/quality/knip.json"],
    },
    mutation: {
      executable: "node_modules/.bin/stryker",
      args: ["run", "stryker.config.mjs"],
      timeoutMs: 3_600_000,
      packages: {
        "@stryker-mutator/core": "10.0.0",
        "@stryker-mutator/vitest-runner": "10.0.0",
        "@stryker-mutator/typescript-checker": "10.0.0",
      },
      configFiles: ["package.json", "stryker.config.mjs", "tsconfig.json", "vitest.config.ts"],
      scope: ["src/**/*.ts", "!src/**/*.d.ts"],
      thresholds: {
        runnableMutationScore: 100,
        survived: 0,
        uncovered: 0,
        runtimeErrors: 0,
        compileErrors: "reported separately",
      },
      cleanPaths: ["reports/mutation", ".stryker-tmp"],
    },
  }[gateId];
}

export interface QualityGateRuntime {
  readonly commandRunner: CommandRunner;
  now(): number;
}

export interface QualityGateRunResult {
  readonly exitCode: number;
  readonly process: ProcessArtifact | null;
  readonly summary: QualitySummary;
  readonly summaryDigest: string;
}

export async function runLocalQualityGate(
  gateId: LocalQualityGateId,
  workspacePath: string,
  runtime: QualityGateRuntime,
): Promise<QualityGateRunResult> {
  const workspace = resolve(workspacePath);
  const spec = gateSpec(gateId);
  const invocationStartedAtMs = runtime.now();
  let process: ProcessArtifact | null = null;
  let toolVersions: Readonly<Record<string, string>> = {};
  let configDigests: Readonly<Record<string, string>> = {};
  let inputDigests: Readonly<Record<string, string>> = {};
  let outputDigests: Readonly<Record<string, string>> = {};
  let status: QualityStatus;
  let reason: string;
  let exitCode: number;

  try {
    await assertQualityWorkspace(workspace);
    await cleanQualityPaths(workspace, gateId, spec.cleanPaths);
    configDigests = await digestQualityFiles(workspace, spec.configFiles);
    toolVersions = await loadPinnedToolVersions(workspace, spec.packages);
    if (gateId === "crap") {
      const coverage = await validateCoverage({ workspace, invocationStartedAtMs: 0 });
      await assertCurrentCoverageSummary(workspace, coverage);
      inputDigests = {
        ...coverage.sourceDigests,
        "coverage/coverage-final.json": coverage.coverageDigest,
        "coverage/lcov.info": coverage.lcovDigest,
      };
    }

    process = await runtime.commandRunner.run({
      executable: join(workspace, spec.executable),
      args: spec.args,
      cwd: workspace,
      stdin: null,
      timeoutMs: spec.timeoutMs,
    });
    assertNativeQualitySuccess(gateId, process);
    const evidence = await validateGateEvidence(gateId, workspace, invocationStartedAtMs, process);
    inputDigests = { ...inputDigests, ...evidence.inputDigests };
    outputDigests = evidence.outputDigests;
    status = "passed";
    reason = `${gateId} evidence is current, complete, and satisfies policy.`;
    exitCode = 0;
  } catch (error) {
    const failure = classifyQualityFailure(error, process);
    status = failure.status;
    reason = failure.reason;
    exitCode = failure.exitCode;
  }

  const summary: QualitySummary = {
    schemaVersion: 1,
    gateId,
    generatedAt: new Date(runtime.now()).toISOString(),
    toolVersions,
    command: { executable: spec.executable, args: spec.args },
    scope: spec.scope,
    thresholds: spec.thresholds,
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
  });
  return { exitCode, process, summary, summaryDigest };
}

async function validateGateEvidence(
  gateId: LocalQualityGateId,
  workspace: string,
  invocationStartedAtMs: number,
  process: ProcessArtifact,
): Promise<{
  readonly inputDigests: Readonly<Record<string, string>>;
  readonly outputDigests: Readonly<Record<string, string>>;
}> {
  if (gateId === "coverage") {
    const result = await validateCoverage({ workspace, invocationStartedAtMs });
    return {
      inputDigests: result.sourceDigests,
      outputDigests: {
        "coverage/coverage-final.json": result.coverageDigest,
        "coverage/lcov.info": result.lcovDigest,
      },
    };
  }
  if (gateId === "crap") {
    const result = await validateCrapReport({
      workspace,
      invocationStartedAtMs,
      processExitCode: process.exitCode,
    });
    return { inputDigests: {}, outputDigests: { "reports/quality/crap.json": result.digest } };
  }
  if (gateId === "knip") {
    validateKnipResult({ processExitCode: process.exitCode, stdout: process.stdout });
    await mkdir(join(workspace, "reports/quality"), { recursive: true });
    await writeFile(join(workspace, "reports/quality/knip.json"), process.stdout, "utf8");
    return { inputDigests: {}, outputDigests: { "reports/quality/knip.json": digestText(process.stdout) } };
  }
  const result = await validateMutationReport({
    workspace,
    invocationStartedAtMs,
    processExitCode: process.exitCode,
  });
  return { inputDigests: {}, outputDigests: { "reports/mutation/mutation.json": result.digest } };
}
