import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  EvidenceError,
  isRecord,
  parseJsonObject,
  readFreshEvidence,
} from "./evidence.js";

const SUMMARY_KEYS = [
  "schemaVersion",
  "gateId",
  "generatedAt",
  "toolVersions",
  "command",
  "scope",
  "thresholds",
  "configDigests",
  "inputDigests",
  "outputDigests",
  "process",
  "status",
  "reason",
] as const;

export type QualityStatus = "passed" | "failed" | "blocked";

export interface QualityProcessSummary {
  readonly kind: "not-run" | "exited" | "spawn-error" | "timeout" | "signal";
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly stdoutDigest: string;
  readonly stderrDigest: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}

export interface QualitySummary {
  readonly schemaVersion: 1;
  readonly gateId: string;
  readonly generatedAt: string;
  readonly toolVersions: Readonly<Record<string, string>>;
  readonly command: {
    readonly executable: string;
    readonly args: readonly string[];
  };
  readonly scope: readonly string[];
  readonly thresholds: Readonly<Record<string, number | string | boolean>>;
  readonly configDigests: Readonly<Record<string, string>>;
  readonly inputDigests: Readonly<Record<string, string>>;
  readonly outputDigests: Readonly<Record<string, string>>;
  readonly process: QualityProcessSummary;
  readonly status: QualityStatus;
  readonly reason: string;
}

export interface SummaryValidationOptions {
  readonly workspace: string;
  readonly invocationStartedAtMs: number;
  readonly expected: QualitySummary;
  readonly secrets?: readonly string[];
}

export async function writeQualitySummary(
  workspacePath: string,
  summary: QualitySummary,
): Promise<string> {
  const directory = join(resolve(workspacePath), "reports/quality");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${summary.gateId}-summary.json`);
  await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return path;
}

export async function validateQualitySummary(
  options: SummaryValidationOptions,
): Promise<string> {
  const path = join(
    resolve(options.workspace),
    `reports/quality/${options.expected.gateId}-summary.json`,
  );
  const evidence = await readFreshEvidence(
    path,
    `${options.expected.gateId} quality summary`,
    options.invocationStartedAtMs,
  );
  for (const secret of options.secrets ?? []) {
    if (secret.length > 0 && evidence.content.includes(secret)) {
      throw new EvidenceError(`${options.expected.gateId} quality summary contains a secret.`);
    }
  }
  const actual = parseJsonObject(evidence.content, `${options.expected.gateId} quality summary`);
  assertExactKeys(actual, SUMMARY_KEYS, "quality summary");
  validateShape(actual);
  if (!isDeepStrictEqual(actual, options.expected)) {
    throw new EvidenceError(`${options.expected.gateId} quality summary contradicts current gate facts.`);
  }
  return evidence.digest;
}

function validateShape(summary: Record<string, unknown>): void {
  validateHeader(summary);
  const passed = summary.status === "passed";
  validateEvidenceFacts(summary, passed);
  const process = validateProcess(summary.process);
  nonemptyString(summary.reason, "reason");
  validateProcessConsistency(process, passed);
}

function validateHeader(summary: Record<string, unknown>): void {
  if (summary.schemaVersion !== 1) {
    throw new EvidenceError("Quality summary schemaVersion must be 1.");
  }
  nonemptyString(summary.gateId, "gateId");
  const timestamp = Date.parse(nonemptyString(summary.generatedAt, "generatedAt"));
  if (!Number.isFinite(timestamp)) {
    throw new EvidenceError("Quality summary generatedAt must be an ISO timestamp.");
  }
  if (!["passed", "failed", "blocked"].includes(String(summary.status))) {
    throw new EvidenceError("Quality summary status is invalid.");
  }
}

function validateEvidenceFacts(summary: Record<string, unknown>, passed: boolean): void {
  stringRecord(summary.toolVersions, "toolVersions", !passed);
  const command = record(summary.command, "command");
  assertExactKeys(command, ["executable", "args"], "command");
  nonemptyString(command.executable, "command.executable");
  stringArray(command.args, "command.args", true);
  stringArray(summary.scope, "scope", false);
  scalarRecord(summary.thresholds, "thresholds");
  digestRecord(summary.configDigests, "configDigests", !passed);
  digestRecord(summary.inputDigests, "inputDigests", true);
  digestRecord(summary.outputDigests, "outputDigests", !passed);
}

function validateProcess(value: unknown): Record<string, unknown> {
  const process = record(value, "process");
  assertExactKeys(process, [
    "kind",
    "exitCode",
    "signal",
    "stdoutDigest",
    "stderrDigest",
    "stdoutTruncated",
    "stderrTruncated",
  ], "process");
  validateProcessKind(process.kind);
  validateProcessExitCode(process.exitCode);
  validateProcessSignal(process.signal);
  digest(process.stdoutDigest, "process.stdoutDigest");
  digest(process.stderrDigest, "process.stderrDigest");
  validateProcessTruncation(process);
  return process;
}

function validateProcessKind(value: unknown): void {
  if (!["not-run", "exited", "spawn-error", "timeout", "signal"].includes(String(value))) {
    throw new EvidenceError("Quality summary process.kind is invalid.");
  }
}

function validateProcessExitCode(value: unknown): void {
  if (value !== null && !Number.isSafeInteger(value)) {
    throw new EvidenceError("Quality summary process.exitCode is invalid.");
  }
}

function validateProcessSignal(value: unknown): void {
  if (value !== null && typeof value !== "string") {
    throw new EvidenceError("Quality summary process.signal is invalid.");
  }
}

function validateProcessTruncation(process: Record<string, unknown>): void {
  if (typeof process.stdoutTruncated !== "boolean" || typeof process.stderrTruncated !== "boolean") {
    throw new EvidenceError("Quality summary truncation facts must be booleans.");
  }
}

function validateProcessConsistency(process: Record<string, unknown>, passed: boolean): void {
  if (passed && (process.kind !== "exited" || process.exitCode !== 0)) {
    throw new EvidenceError("A passed quality summary contradicts its native process result.");
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new EvidenceError(`Quality summary ${label} must be an object.`);
  }
  return value;
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (!isDeepStrictEqual(actual, sortedExpected)) {
    throw new EvidenceError(`Quality summary ${label} has missing or unknown properties.`);
  }
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new EvidenceError(`Quality summary ${label} must be nonempty.`);
  }
  return value;
}

function stringArray(value: unknown, label: string, allowEmpty: boolean): void {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new EvidenceError(`Quality summary ${label} must be a string array.`);
  }
}

function stringRecord(value: unknown, label: string, allowEmpty: boolean): void {
  const data = record(value, label);
  if (
    (!allowEmpty && Object.keys(data).length === 0) ||
    Object.values(data).some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new EvidenceError(`Quality summary ${label} must contain nonempty strings.`);
  }
}

function scalarRecord(value: unknown, label: string): void {
  const data = record(value, label);
  if (
    Object.values(data).some((item) =>
      typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean"
    )
  ) {
    throw new EvidenceError(`Quality summary ${label} contains a non-scalar value.`);
  }
}

function digestRecord(value: unknown, label: string, allowEmpty: boolean): void {
  const data = record(value, label);
  if (!allowEmpty && Object.keys(data).length === 0) {
    throw new EvidenceError(`Quality summary ${label} must not be empty.`);
  }
  for (const [key, value] of Object.entries(data)) {
    digest(value, `${label}.${key}`);
  }
}

function digest(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new EvidenceError(`Quality summary ${label} must be a SHA-256 digest.`);
  }
}
