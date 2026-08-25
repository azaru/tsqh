import { join, resolve } from "node:path";
import {
  EvidenceError,
  isRecord,
  normalizeReportPath,
  parseJsonObject,
  readFreshEvidence,
} from "./evidence.js";

const PLUGINS = [
  "@stryker-mutator/vitest-runner",
  "@stryker-mutator/typescript-checker",
] as const;
const REPORTERS = ["clear-text", "progress", "json"] as const;

export interface MutationValidation {
  readonly digest: string;
  readonly files: number;
  readonly killed: number;
  readonly compileErrors: number;
}

export interface MutationValidationOptions {
  readonly workspace: string;
  readonly invocationStartedAtMs: number;
  readonly processExitCode: number | null;
}

export async function validateMutationReport(
  options: MutationValidationOptions,
): Promise<MutationValidation> {
  assertProcessSuccess(options.processExitCode);
  const workspace = resolve(options.workspace);
  const evidence = await readFreshEvidence(
    join(workspace, "reports/mutation/mutation.json"),
    "Mutation report",
    options.invocationStartedAtMs,
  );
  const report = parseJsonObject(evidence.content, "Mutation report");
  validateReportHeader(report, workspace);
  validateFramework(report);
  validateConfiguration(record(report.config, "config"));
  const inventory = validateFiles(report.files, workspace);
  return { digest: evidence.digest, ...inventory };
}

function assertProcessSuccess(exitCode: number | null): void {
  if (exitCode === null) {
    throw new EvidenceError("Mutation process did not exit normally.");
  }
  if (exitCode !== 0) {
    throw new EvidenceError(`Mutation process exited with status ${String(exitCode)}.`);
  }
}

function validateReportHeader(report: Record<string, unknown>, workspace: string): void {
  if (report.schemaVersion !== "1.0") {
    throw new EvidenceError('Mutation report schemaVersion must be "1.0".');
  }
  requireEqual(report.projectRoot, workspace, "projectRoot");
  validateThresholds(report.thresholds, "thresholds");
}

function validateFramework(report: Record<string, unknown>): void {
  const framework = record(report.framework, "framework");
  requireEqual(framework.name, "Stryker", "framework.name");
  requireEqual(framework.version, "10.0.0", "framework.version");
}

function validateFiles(
  value: unknown,
  workspace: string,
): Pick<MutationValidation, "files" | "killed" | "compileErrors"> {
  const files = record(value, "files");
  if (Object.keys(files).length === 0) {
    throw new EvidenceError("Mutation report contains no mutated files.");
  }
  const seenPaths = new Set<string>();
  const seenIds = new Set<string>();
  let killed = 0;
  let compileErrors = 0;
  for (const [reportedPath, value] of Object.entries(files)) {
    const path = validateMutationPath(workspace, reportedPath, seenPaths);
    const counts = validateMutationFile(value, path, seenIds);
    killed += counts.killed;
    compileErrors += counts.compileErrors;
  }
  if (killed === 0) {
    throw new EvidenceError("Mutation report contains zero runnable mutants.");
  }

  return { files: seenPaths.size, killed, compileErrors };
}

function validateMutationPath(
  workspace: string,
  reportedPath: string,
  seenPaths: Set<string>,
): string {
  const path = normalizeReportPath(workspace, reportedPath, "Mutation file path");
  if (!path.startsWith("src/") || !path.endsWith(".ts") || path.endsWith(".d.ts")) {
    throw new EvidenceError(`Mutation report contains a file outside production scope: ${path}`);
  }
  if (seenPaths.has(path)) {
    throw new EvidenceError(`Mutation report contains ambiguous duplicate paths for ${path}.`);
  }
  seenPaths.add(path);
  return path;
}

interface MutationCounts {
  readonly killed: number;
  readonly compileErrors: number;
}

function validateMutationFile(
  value: unknown,
  path: string,
  seenIds: Set<string>,
): MutationCounts {
  const file = record(value, `files.${path}`);
  requireEqual(file.language, "typescript", `files.${path}.language`);
  if (typeof file.source !== "string" || file.source.length === 0) {
    throw new EvidenceError(`Mutation report files.${path}.source must be nonempty.`);
  }
  if (!Array.isArray(file.mutants)) {
    throw new EvidenceError(`Mutation report files.${path}.mutants must be an array.`);
  }
  let killed = 0;
  let compileErrors = 0;
  for (const [index, value] of file.mutants.entries()) {
    const status = validateMutant(value, path, index, seenIds);
    killed += status === "Killed" ? 1 : 0;
    compileErrors += status === "CompileError" ? 1 : 0;
  }
  return { killed, compileErrors };
}

function validateMutant(
  value: unknown,
  path: string,
  index: number,
  seenIds: Set<string>,
): "Killed" | "CompileError" {
  const mutant = record(value, `files.${path}.mutants[${String(index)}]`);
  const id = requireMutantId(mutant.id, path, seenIds);
  if (mutant.status === "Killed") {
    return "Killed";
  }
  if (mutant.status === "CompileError") {
    requireCompileErrorReason(mutant.statusReason, id);
    return "CompileError";
  }
  const status = typeof mutant.status === "string" ? mutant.status : "missing";
  throw new EvidenceError(`Mutation report contains rejected runnable status '${status}' for ${id}.`);
}

function requireCompileErrorReason(value: unknown, id: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new EvidenceError(`CompileError mutant ${id} must have a nonempty statusReason.`);
  }
}

function requireMutantId(value: unknown, path: string, seenIds: Set<string>): string {
  if (typeof value !== "string" || value.length === 0 || seenIds.has(value)) {
    throw new EvidenceError(`Mutation report contains a missing or duplicate mutant id in ${path}.`);
  }
  seenIds.add(value);
  return value;
}

function validateConfiguration(config: Record<string, unknown>): void {
  requireStringArray(config.checkers, ["typescript"], "config.checkers");
  requireEqual(config.cleanTempDir, "always", "config.cleanTempDir");
  requireEqual(config.concurrency, 2, "config.concurrency");
  requireEqual(config.coverageAnalysis, "all", "config.coverageAnalysis");
  requireEqual(config.dryRunTimeoutMinutes, 5, "config.dryRunTimeoutMinutes");
  requireEqual(config.ignoreStatic, false, "config.ignoreStatic");
  requireEqual(config.incremental, false, "config.incremental");
  requireStringArray(
    config.mutate,
    ["src/**/*.ts", "!src/**/*.d.ts"],
    "config.mutate",
  );
  requireStringArray(config.plugins, PLUGINS, "config.plugins");
  requireStringArray(config.reporters, REPORTERS, "config.reporters");
  requireEqual(config.tempDirName, ".stryker-tmp", "config.tempDirName");
  requireEqual(config.testRunner, "vitest", "config.testRunner");
  requireEqual(config.timeoutMS, 10_000, "config.timeoutMS");
  requireEqual(config.tsconfigFile, "tsconfig.json", "config.tsconfigFile");
  validateThresholds(config.thresholds, "config.thresholds");

  const jsonReporter = record(config.jsonReporter, "config.jsonReporter");
  requireEqual(jsonReporter.fileName, "reports/mutation/mutation.json", "config.jsonReporter.fileName");
  const vitest = record(config.vitest, "config.vitest");
  requireEqual(vitest.related, false, "config.vitest.related");
}

function validateThresholds(value: unknown, label: string): void {
  const thresholds = record(value, label);
  requireEqual(thresholds.high, 100, `${label}.high`);
  requireEqual(thresholds.low, 100, `${label}.low`);
  requireEqual(thresholds.break, 100, `${label}.break`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new EvidenceError(`Mutation report ${label} must be an object.`);
  }
  return value;
}

function requireStringArray(
  actual: unknown,
  expected: readonly string[],
  label: string,
): void {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new EvidenceError(`Mutation report ${label} does not match required policy.`);
  }
}

function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new EvidenceError(`Mutation report ${label} must be ${JSON.stringify(expected)}.`);
  }
}
