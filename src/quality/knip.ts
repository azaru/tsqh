import { EvidenceError, isRecord, parseJsonObject } from "./evidence.js";

export interface KnipValidation {
  readonly findings: 0;
}

export interface KnipValidationOptions {
  readonly processExitCode: number | null;
  readonly stdout: string;
}

export function validateKnipResult(options: KnipValidationOptions): KnipValidation {
  if (options.stdout.trim().length === 0) {
    throw new EvidenceError("Knip produced no JSON report.");
  }
  const report = parseJsonObject(options.stdout, "Knip report");
  if (!Array.isArray(report.issues)) {
    throw new EvidenceError("Knip report issues must be an array.");
  }
  const findings = countFindings(report.issues);
  assertNoFindings(findings);
  assertProcessSuccess(options.processExitCode);
  return { findings: 0 };
}

function countFindings(issues: readonly unknown[]): number {
  let findings = 0;
  for (const [index, value] of issues.entries()) {
    findings += countIssue(value, index);
  }
  return findings;
}

function countIssue(value: unknown, index: number): number {
  const issue = requireIssue(value, index);
  const count = countIssueFields(issue);
  if (count === 0) {
    throw new EvidenceError(`Knip issue ${String(index)} contains no findings.`);
  }
  return count;
}

function requireIssue(value: unknown, index: number): Record<string, unknown> {
  if (!isRecord(value) || typeof value.file !== "string" || value.file.length === 0) {
    throw new EvidenceError(`Knip issue ${String(index)} is malformed.`);
  }
  return value;
}

function countIssueFields(value: Record<string, unknown>): number {
  let count = 0;
  for (const [key, items] of Object.entries(value)) {
    count += countIssueField(key, items);
  }
  return count;
}

function countIssueField(key: string, items: unknown): number {
  if (key === "file" || key === "owners") {
    return 0;
  }
  if (!Array.isArray(items)) {
    throw new EvidenceError(`Knip issue field '${key}' must be an array.`);
  }
  return items.length;
}

function assertNoFindings(findings: number): void {
  if (findings !== 0) {
    throw new EvidenceError(`Knip reported ${String(findings)} finding(s).`);
  }
}

function assertProcessSuccess(exitCode: number | null): void {
  if (exitCode === null) {
    throw new EvidenceError("Knip process did not exit normally.");
  }
  if (exitCode !== 0) {
    const reason = exitCode === 1
      ? "configuration or tag hints"
      : `process status ${String(exitCode)}`;
    throw new EvidenceError(`Knip failed with ${reason}.`);
  }
}
