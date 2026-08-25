import { join, resolve } from "node:path";
import {
  EvidenceError,
  isRecord,
  normalizeReportPath,
  parseJsonObject,
  readFreshEvidence,
} from "./evidence.js";

const REQUIRED_THRESHOLD = 6;

export interface CrapValidation {
  readonly digest: string;
  readonly files: number;
  readonly units: number;
  readonly maximumCrap: number;
}

export interface CrapValidationOptions {
  readonly workspace: string;
  readonly invocationStartedAtMs: number;
  readonly processExitCode: number | null;
}

export async function validateCrapReport(
  options: CrapValidationOptions,
): Promise<CrapValidation> {
  assertProcessSuccess(options.processExitCode);
  const workspace = resolve(options.workspace);
  const evidence = await readFreshEvidence(
    join(workspace, "reports/quality/crap.json"),
    "CRAP report",
    options.invocationStartedAtMs,
  );
  const report = parseJsonObject(evidence.content, "CRAP report");
  validateReportHeader(report);
  validateInputs(report, workspace);
  const analyzed = validateSourceInventory(report, workspace);
  const recordedFiles = validateCoverageInventory(report, workspace);
  const metrics = requireArray(report.metrics, "metrics");
  const scores = validateMetrics(metrics, workspace, analyzed, recordedFiles);
  const summary = validateSummary(report, analyzed.length, metrics.length, scores);
  return { digest: evidence.digest, ...summary };
}

function assertProcessSuccess(exitCode: number | null): void {
  if (exitCode === null) {
    throw new EvidenceError("CRAP process did not exit normally.");
  }
  if (exitCode !== 0) {
    throw new EvidenceError(`CRAP process exited with status ${String(exitCode)}.`);
  }
}

function validateReportHeader(report: Record<string, unknown>): void {
  requireEqual(report.schemaVersion, 1, "schemaVersion");
  requireEqual(report.toolVersion, "0.1.2", "toolVersion");
  requireEqual(report.status, "passed", "status");
  requireEqual(report.passed, true, "passed");
  requireEqual(report.threshold, REQUIRED_THRESHOLD, "threshold");
}

function validateInputs(report: Record<string, unknown>, workspace: string): void {
  const inputs = record(report.inputs, "inputs");
  requireEqual(inputs.cwd, workspace, "inputs.cwd");
  requireStringArray(inputs.sourceRoots, "inputs.sourceRoots", ["src"]);
  requireEqual(inputs.coverageFile, "coverage/coverage-final.json", "inputs.coverageFile");
  requireStringArray(inputs.excludes, "inputs.excludes", []);
}

function validateSourceInventory(report: Record<string, unknown>, workspace: string): readonly string[] {
  const sourceInventory = record(report.sourceInventory, "sourceInventory");
  const analyzed = normalizedPaths(workspace, sourceInventory.analyzed, "sourceInventory.analyzed");
  if (analyzed.length === 0) {
    throw new EvidenceError("CRAP report contains no analyzed production files.");
  }
  requireStringArray(sourceInventory.excluded, "sourceInventory.excluded", []);
  normalizedPaths(workspace, sourceInventory.declarations, "sourceInventory.declarations");
  return analyzed;
}

function validateCoverageInventory(report: Record<string, unknown>, workspace: string): ReadonlySet<string> {
  const coverageInventory = record(report.coverageInventory, "coverageInventory");
  requireEqual(coverageInventory.file, "coverage/coverage-final.json", "coverageInventory.file");
  return new Set(
    normalizedPaths(workspace, coverageInventory.recordedFiles, "coverageInventory.recordedFiles"),
  );
}

function validateMetrics(
  metrics: readonly unknown[],
  workspace: string,
  analyzed: readonly string[],
  recordedFiles: ReadonlySet<string>,
): readonly number[] {
  if (metrics.length === 0) {
    throw new EvidenceError("CRAP report contains no executable units.");
  }
  const analyzedFiles = new Set(analyzed);
  return metrics.map((value, index) => validateMetric(
    value,
    index,
    workspace,
    analyzedFiles,
    recordedFiles,
  ));
}

function validateMetric(
  value: unknown,
  index: number,
  workspace: string,
  analyzedFiles: ReadonlySet<string>,
  recordedFiles: ReadonlySet<string>,
): number {
  const metric = record(value, `metrics[${String(index)}]`);
  const file = normalizeReportPath(workspace, metric.file, `metrics[${String(index)}].file`);
  if (!analyzedFiles.has(file) || !recordedFiles.has(file)) {
    throw new EvidenceError(`CRAP metric refers to incomplete source or coverage scope: ${file}`);
  }
  requireEqual(metric.violatesThreshold, false, `metrics[${String(index)}].violatesThreshold`);
  const score = finiteNumber(metric.crap, `metrics[${String(index)}].crap`);
  if (score > REQUIRED_THRESHOLD) {
    throw new EvidenceError(`CRAP metric exceeds threshold 6: ${score.toString()}.`);
  }
  return score;
}

function validateSummary(
  report: Record<string, unknown>,
  analyzedFiles: number,
  metrics: number,
  scores: readonly number[],
): Pick<CrapValidation, "files" | "units" | "maximumCrap"> {
  requireStringArray(report.diagnostics, "diagnostics", []);
  const summary = record(report.summary, "summary");
  const files = positiveInteger(summary.files, "summary.files");
  const units = positiveInteger(summary.units, "summary.units");
  requireEqual(summary.violations, 0, "summary.violations");
  const maximumCrap = finiteNumber(summary.maximumCrap, "summary.maximumCrap");
  if (files !== analyzedFiles || units !== metrics) {
    throw new EvidenceError("CRAP summary contradicts its file or unit inventory.");
  }
  if (maximumCrap !== Math.max(...scores)) {
    throw new EvidenceError("CRAP summary maximum contradicts its metrics or threshold.");
  }
  return { files, units, maximumCrap };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new EvidenceError(`CRAP report ${label} must be an object.`);
  }
  return value;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new EvidenceError(`CRAP report ${label} must be an array.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string, exact?: readonly string[]): readonly string[] {
  const items = requireArray(value, label);
  for (const item of items) {
    if (typeof item !== "string") {
      throw new EvidenceError(`CRAP report ${label} must be a string array.`);
    }
  }
  if (exact !== undefined) {
    requireExactStrings(items as readonly string[], exact, label);
  }
  return items as readonly string[];
}

function requireExactStrings(value: readonly string[], exact: readonly string[], label: string): void {
  if (value.length !== exact.length) {
    throw new EvidenceError(`CRAP report ${label} must be a string array.`);
  }
  for (const [index, item] of value.entries()) {
    if (item !== exact[index]) {
      throw new EvidenceError(`CRAP report ${label} does not match the required value.`);
    }
  }
}

function normalizedPaths(workspace: string, value: unknown, label: string): readonly string[] {
  const paths = requireStringArray(value, label).map((path) => normalizeReportPath(workspace, path, label));
  if (new Set(paths).size !== paths.length) {
    throw new EvidenceError(`CRAP report ${label} contains ambiguous duplicate paths.`);
  }
  return paths;
}

function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new EvidenceError(`CRAP report ${label} must be ${JSON.stringify(expected)}.`);
  }
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new EvidenceError(`CRAP report ${label} must be a positive integer.`);
  }
  return value as number;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new EvidenceError(`CRAP report ${label} must be a finite nonnegative number.`);
  }
  return value;
}
