import { lstat, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Blocker, ProcessArtifact } from "../domain/types.js";

const MAX_TASK_BYTES = 1_048_576;
const MAX_TEST_FILE_BYTES = 1_048_576;
const MAX_TEST_FILES = 4_096;
const MAX_TEST_BYTES = 16_777_216;
const ACCEPTANCE_ID = "AC-[A-Za-z0-9][A-Za-z0-9_-]{0,63}";
const CRITERION_LINE = new RegExp(
  `^\\s*(?:[-*]\\s+|\\d+[.)]\\s+)?(${ACCEPTANCE_ID})\\s*:\\s+\\S.*$`,
  "gmu",
);
const ACCEPTANCE_HEADING = /^##\s+Acceptance\b.*$/imu;
const NEXT_SECTION_HEADING = /^##\s+/gmu;
const TEST_TITLE_MARKER = new RegExp("\\[(" + ACCEPTANCE_ID + ")\\]", "gu");
const TEST_FILE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".mjs", ".mts", ".ts", ".tsx"]);

export interface AcceptanceTestSource {
  readonly path: string;
  readonly content: string;
}

export interface AcceptanceCriterionCoverage {
  readonly id: string;
  readonly testFiles: readonly string[];
}

export interface AcceptanceCoverage {
  readonly criteria: readonly AcceptanceCriterionCoverage[];
  readonly missingIds: readonly string[];
  readonly unknownIds: readonly string[];
}

export interface TaskAcceptanceGateInput {
  readonly stepId: string;
  readonly taskPath: string;
  readonly workspacePath: string;
  readonly runDirectory: string;
  readonly testPaths: readonly string[];
}

export interface TaskAcceptanceGateResult {
  readonly process: ProcessArtifact | null;
  readonly blocker: Blocker | null;
}

interface TaskAcceptanceReport {
  readonly schemaVersion: 1;
  readonly status: "passed" | "failed";
  readonly criteria: readonly AcceptanceCriterionCoverage[];
  readonly missingIds: readonly string[];
  readonly unknownIds: readonly string[];
}

export async function runTaskAcceptanceGate(
  input: TaskAcceptanceGateInput,
): Promise<TaskAcceptanceGateResult> {
  try {
    const task = await readBoundedText(input.taskPath, MAX_TASK_BYTES, "task");
    const criteria = parseAcceptanceCriteria(task);
    if (criteria.length === 0) {
      return invalidTaskBlocker(input.stepId, "The task declares no AC-* acceptance criteria.");
    }

    const sources = await readTestSources(input.workspacePath, input.testPaths);
    const coverage = inspectAcceptanceCoverage(criteria, sources);
    const report: TaskAcceptanceReport = {
      schemaVersion: 1,
      status: coverage.missingIds.length === 0 && coverage.unknownIds.length === 0 ? "passed" : "failed",
      criteria: coverage.criteria,
      missingIds: coverage.missingIds,
      unknownIds: coverage.unknownIds,
    };
    await writeFile(
      join(input.runDirectory, "task-acceptance.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );

    if (report.status === "failed") {
      return {
        process: validationProcess(1, acceptanceFailureMessage(coverage)),
        blocker: null,
      };
    }
    return {
      process: validationProcess(0, acceptanceSuccessMessage(criteria)),
      blocker: null,
    };
  } catch (error) {
    return invalidTaskBlocker(input.stepId, errorMessage(error));
  }
}

export function parseAcceptanceCriteria(task: string): readonly string[] {
  const criteria: string[] = [];
  const seen = new Set<string>();
  const section = acceptanceSection(task);
  CRITERION_LINE.lastIndex = 0;
  for (const match of section.matchAll(CRITERION_LINE)) {
    const id = match[1];
    if (id === undefined) {
      continue;
    }
    if (seen.has(id)) {
      throw new Error(`The task declares acceptance criterion '${id}' more than once.`);
    }
    seen.add(id);
    criteria.push(id);
  }
  return criteria;
}

function acceptanceSection(task: string): string {
  const heading = ACCEPTANCE_HEADING.exec(task);
  if (heading === null || heading.index === undefined) {
    return "";
  }
  const contentStart = heading.index + heading[0].length;
  NEXT_SECTION_HEADING.lastIndex = contentStart;
  const nextHeading = NEXT_SECTION_HEADING.exec(task);
  return task.slice(contentStart, nextHeading?.index ?? task.length);
}

export function inspectAcceptanceCoverage(
  criteria: readonly string[],
  sources: readonly AcceptanceTestSource[],
): AcceptanceCoverage {
  const criterionIds = new Set(criteria);
  const filesById = new Map<string, Set<string>>();
  const unknownIds = new Set<string>();

  for (const source of sources) {
    for (const match of source.content.matchAll(TEST_TITLE_MARKER)) {
      const id = match[1];
      if (id === undefined) {
        continue;
      }
      if (!criterionIds.has(id)) {
        unknownIds.add(id);
        continue;
      }
      const files = filesById.get(id) ?? new Set<string>();
      files.add(source.path);
      filesById.set(id, files);
    }
  }

  const coverage = criteria.map((id) => ({
    id,
    testFiles: [...(filesById.get(id) ?? [])].sort(compareStrings),
  }));
  return {
    criteria: coverage,
    missingIds: coverage.filter(({ testFiles }) => testFiles.length === 0).map(({ id }) => id),
    unknownIds: [...unknownIds].sort(compareStrings),
  };
}

async function readTestSources(
  workspacePath: string,
  testPaths: readonly string[],
): Promise<readonly AcceptanceTestSource[]> {
  const files = [...new Set(testPaths)].sort(compareStrings);
  const sourceFiles = files.filter((path) => TEST_FILE_EXTENSIONS.has(extension(path)));
  if (sourceFiles.length > MAX_TEST_FILES) {
    throw new Error(`The test inventory exceeds the ${String(MAX_TEST_FILES)} file limit.`);
  }

  let totalBytes = 0;
  const sources: AcceptanceTestSource[] = [];
  for (const path of sourceFiles) {
    assertSafeTestPath(path);
    const absolutePath = resolve(workspacePath, path);
    const details = await lstat(absolutePath);
    if (!details.isFile()) {
      throw new Error(`Acceptance test '${path}' is not a regular file.`);
    }
    if (details.size > MAX_TEST_FILE_BYTES) {
      throw new Error(`Acceptance test '${absolutePath}' exceeds the ${String(MAX_TEST_FILE_BYTES)} byte limit.`);
    }
    totalBytes += details.size;
    if (totalBytes > MAX_TEST_BYTES) {
      throw new Error(`The acceptance test inventory exceeds the ${String(MAX_TEST_BYTES)} byte limit.`);
    }
    sources.push({
      path,
      content: await readBoundedText(absolutePath, MAX_TEST_FILE_BYTES, "acceptance test"),
    });
  }
  return sources;
}

function assertSafeTestPath(path: string): void {
  if (
    !path.startsWith("test/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Acceptance test path '${path}' is not beneath test/.`);
  }
}

function extension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot).toLowerCase();
}

function validationProcess(exitCode: number, message: string): ProcessArtifact {
  return {
    kind: "exited",
    exitCode,
    signal: null,
    stdout: exitCode === 0 ? message : "",
    stderr: exitCode === 0 ? "" : message,
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

function acceptanceSuccessMessage(criteria: readonly string[]): string {
  return `Acceptance test coverage is present for ${criteria.join(", ")}.`;
}

function acceptanceFailureMessage(coverage: AcceptanceCoverage): string {
  const details = [
    coverage.missingIds.length === 0 ? null : `missing tests for ${coverage.missingIds.join(", ")}`,
    coverage.unknownIds.length === 0 ? null : `unknown markers ${coverage.unknownIds.join(", ")}`,
  ].filter((value): value is string => value !== null);
  return `Acceptance test coverage failed: ${details.join("; ")}.`;
}

function invalidTaskBlocker(stepId: string, message: string): TaskAcceptanceGateResult {
  return {
    process: null,
    blocker: {
      code: "task-acceptance-invalid",
      message: `Task acceptance validation failed: ${message}`,
      stepId,
    },
  };
}

async function readBoundedText(path: string, maximumBytes: number, label: string): Promise<string> {
  const details = await stat(path);
  if (!details.isFile()) {
    throw new Error(`The ${label} path is not a regular file: ${path}`);
  }
  if (details.size > maximumBytes) {
    throw new Error(`The ${label} exceeds the ${String(maximumBytes)} byte limit.`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`The ${label} is not valid UTF-8.`);
    }
    throw error;
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
