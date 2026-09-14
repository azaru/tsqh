import { lstat, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Blocker, ProcessArtifact } from "../domain/types.js";

export const ACCEPTANCE_MANIFEST_PATH = "test/acceptance.json";

const MAX_MANIFEST_BYTES = 262_144;
const MAX_DESCRIPTION_BYTES = 4_096;
const MAX_TEST_FILE_BYTES = 1_048_576;
const MAX_TEST_FILES = 4_096;
const MAX_TEST_BYTES = 16_777_216;
const ACCEPTANCE_ID = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/u;
const TEST_TITLE_MARKER = /\[acceptance:([A-Za-z][A-Za-z0-9._-]{0,63})\]/gu;
const TEST_FILE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".mjs", ".mts", ".ts", ".tsx"]);

export interface AcceptanceTestSource {
  readonly path: string;
  readonly content: string;
}

export interface AcceptanceRequirement {
  readonly id: string;
  readonly description: string;
}

export interface AcceptanceManifest {
  readonly schemaVersion: 1;
  readonly requirements: readonly AcceptanceRequirement[];
}

export interface AcceptanceRequirementCoverage extends AcceptanceRequirement {
  readonly testCount: number;
  readonly testFiles: readonly string[];
}

export interface AcceptanceCoverage {
  readonly requirements: readonly AcceptanceRequirementCoverage[];
  readonly missingIds: readonly string[];
  readonly unknownIds: readonly string[];
}

export interface TaskAcceptanceGateInput {
  readonly stepId: string;
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
  readonly manifestPath: string;
  readonly requirements: readonly AcceptanceRequirementCoverage[];
  readonly missingIds: readonly string[];
  readonly unknownIds: readonly string[];
}

export async function runTaskAcceptanceGate(
  input: TaskAcceptanceGateInput,
): Promise<TaskAcceptanceGateResult> {
  try {
    const manifestPaths = input.testPaths.filter((path) => path === ACCEPTANCE_MANIFEST_PATH);
    if (manifestPaths.length !== 1) {
      return evidenceFailure(
        input.stepId,
        `Exactly one '${ACCEPTANCE_MANIFEST_PATH}' must be created by the tester.`,
      );
    }

    const manifestPath = manifestPaths[0]!;
    const manifest = parseAcceptanceManifest(
      await readBoundedText(
        resolve(input.workspacePath, manifestPath),
        MAX_MANIFEST_BYTES,
        "acceptance manifest",
      ),
    );
    const sources = await readTestSources(input.workspacePath, input.testPaths);
    const coverage = inspectAcceptanceCoverage(manifest.requirements, sources);
    const report: TaskAcceptanceReport = {
      schemaVersion: 1,
      status: coverage.missingIds.length === 0 && coverage.unknownIds.length === 0 ? "passed" : "failed",
      manifestPath,
      requirements: coverage.requirements,
      missingIds: coverage.missingIds,
      unknownIds: coverage.unknownIds,
    };
    await writeFile(
      join(input.runDirectory, "acceptance-coverage.json"),
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
      process: validationProcess(0, acceptanceSuccessMessage(manifest.requirements)),
      blocker: null,
    };
  } catch (error) {
    return evidenceFailure(input.stepId, errorMessage(error));
  }
}

export function parseAcceptanceManifest(content: string): AcceptanceManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`The acceptance manifest is not valid JSON: ${errorMessage(error)}`);
  }
  if (
    !isRecord(parsed) ||
    !hasOnlyKeys(parsed, ["schemaVersion", "requirements"]) ||
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.requirements)
  ) {
    throw new Error("The acceptance manifest must contain only schemaVersion 1 and a requirements array.");
  }
  if (parsed.requirements.length === 0 || parsed.requirements.length > MAX_TEST_FILES) {
    throw new Error(`The acceptance manifest must contain between 1 and ${String(MAX_TEST_FILES)} requirements.`);
  }

  const seen = new Set<string>();
  const requirements = parsed.requirements.map((value, index) => {
    if (!isRecord(value) || !hasOnlyKeys(value, ["id", "description"])) {
      throw new Error(`Acceptance requirement ${String(index + 1)} must contain only id and description.`);
    }
    const id = value.id;
    const description = value.description;
    if (typeof id !== "string" || !ACCEPTANCE_ID.test(id)) {
      throw new Error(`Acceptance requirement ${String(index + 1)} has an invalid id.`);
    }
    if (seen.has(id)) {
      throw new Error(`The acceptance manifest declares requirement '${id}' more than once.`);
    }
    if (
      typeof description !== "string" ||
      description.trim().length === 0 ||
      Buffer.byteLength(description, "utf8") > MAX_DESCRIPTION_BYTES
    ) {
      throw new Error(`Acceptance requirement '${id}' has an invalid description.`);
    }
    seen.add(id);
    return { id, description };
  });
  return { schemaVersion: 1, requirements };
}

export function inspectAcceptanceCoverage(
  requirements: readonly AcceptanceRequirement[],
  sources: readonly AcceptanceTestSource[],
): AcceptanceCoverage {
  const requirementIds = new Set(requirements.map(({ id }) => id));
  const filesById = new Map<string, Set<string>>();
  const testCounts = new Map<string, number>();
  const unknownIds = new Set<string>();

  for (const source of sources) {
    for (const match of source.content.matchAll(TEST_TITLE_MARKER)) {
      const id = match[1];
      if (id === undefined) {
        continue;
      }
      if (!requirementIds.has(id)) {
        unknownIds.add(id);
        continue;
      }
      const files = filesById.get(id) ?? new Set<string>();
      files.add(source.path);
      filesById.set(id, files);
      testCounts.set(id, (testCounts.get(id) ?? 0) + 1);
    }
  }

  const coverage = requirements.map(({ id, description }) => ({
    id,
    description,
    testCount: testCounts.get(id) ?? 0,
    testFiles: [...(filesById.get(id) ?? [])].sort(compareStrings),
  }));
  return {
    requirements: coverage,
    missingIds: coverage.filter(({ testCount }) => testCount === 0).map(({ id }) => id),
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

function acceptanceSuccessMessage(requirements: readonly AcceptanceRequirement[]): string {
  return `Acceptance test coverage is present for ${requirements.map(({ id }) => id).join(", ")}.`;
}

function acceptanceFailureMessage(coverage: AcceptanceCoverage): string {
  const details = [
    coverage.missingIds.length === 0 ? null : `missing tests for ${coverage.missingIds.join(", ")}`,
    coverage.unknownIds.length === 0 ? null : `unknown markers ${coverage.unknownIds.join(", ")}`,
  ].filter((value): value is string => value !== null);
  return `Acceptance test coverage failed: ${details.join("; ")}.`;
}

function evidenceFailure(stepId: string, message: string): TaskAcceptanceGateResult {
  return {
    process: validationProcess(1, `Acceptance evidence validation failed at '${stepId}': ${message}`),
    blocker: null,
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

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
