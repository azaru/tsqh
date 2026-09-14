import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectAcceptanceCoverage,
  parseAcceptanceCriteria,
  runTaskAcceptanceGate,
} from "../../src/application/task-acceptance.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("task acceptance criteria", () => {
  it("parses unique product criteria without interpreting their prose", () => {
    expect(parseAcceptanceCriteria([
      "## Acceptance",
      "- AC-package: Publish the package.",
      "2. AC-install: Install it in a consumer.",
    ].join("\n"))).toEqual(["AC-package", "AC-install"]);
  });

  it("rejects duplicate criterion identifiers", () => {
    expect(() => parseAcceptanceCriteria([
      "## Acceptance",
      "- AC-1: First behavior.",
      "- AC-1: Duplicate behavior.",
    ].join("\n"))).toThrow("acceptance criterion 'AC-1' more than once");
  });

  it("reports missing and unknown test markers deterministically", () => {
    expect(inspectAcceptanceCoverage(
      ["AC-1", "AC-2"],
      [
        {
          path: "test/first.test.ts",
          content: 'it("[AC-1] first", () => {});\nit("[AC-1] second", () => {});',
        },
        { path: "test/unknown.test.ts", content: 'it("[AC-9] unknown", () => {});' },
      ],
    )).toEqual({
      criteria: [
        { id: "AC-1", testCount: 2, testFiles: ["test/first.test.ts"] },
        { id: "AC-2", testCount: 0, testFiles: [] },
      ],
      missingIds: ["AC-2"],
      unknownIds: ["AC-9"],
    });
  });

  it("writes a passing acceptance report when every criterion is tagged", async () => {
    const fixture = await createFixture([
      'it("[AC-1] behavior", () => {});',
      'it("[AC-2] second behavior", () => {});',
    ].join("\n"), [
      "## Acceptance",
      "- AC-1: First behavior.",
      "- AC-2: Second behavior.",
    ].join("\n"));

    const result = await runTaskAcceptanceGate({
      stepId: "acceptance",
      taskPath: fixture.taskPath,
      workspacePath: fixture.workspace,
      runDirectory: fixture.runDirectory,
      testPaths: ["test/acceptance.test.ts"],
    });

    expect(result.blocker).toBeNull();
    expect(result.process).toMatchObject({ kind: "exited", exitCode: 0 });
    await expect(readFile(join(fixture.runDirectory, "task-acceptance.json"), "utf8"))
      .resolves.toContain('"status": "passed"');
  });

  it("fails when a task criterion has no tester-owned marker", async () => {
    const fixture = await createFixture(
      'it("[AC-1] behavior", () => {});',
      "## Acceptance\n\n- AC-1: First behavior.\n- AC-2: Missing behavior.",
    );

    const result = await runTaskAcceptanceGate({
      stepId: "acceptance",
      taskPath: fixture.taskPath,
      workspacePath: fixture.workspace,
      runDirectory: fixture.runDirectory,
      testPaths: ["test/acceptance.test.ts"],
    });

    expect(result.blocker).toBeNull();
    expect(result.process).toMatchObject({ kind: "exited", exitCode: 1 });
    expect(result.process?.stderr).toContain("missing tests for AC-2");
  });

  it("blocks a task without acceptance criteria", async () => {
    const fixture = await createFixture('it("behavior", () => {});', "Build the feature.\n");

    const result = await runTaskAcceptanceGate({
      stepId: "acceptance",
      taskPath: fixture.taskPath,
      workspacePath: fixture.workspace,
      runDirectory: fixture.runDirectory,
      testPaths: [],
    });

    expect(result.process).toBeNull();
    expect(result.blocker).toMatchObject({
      code: "task-acceptance-invalid",
      stepId: "acceptance",
    });
  });
});

async function createFixture(
  testSource: string,
  task: string,
): Promise<{ readonly root: string; readonly workspace: string; readonly taskPath: string; readonly runDirectory: string }> {
  const root = await mkdtemp(join(resolve("tmp"), "codex-task-acceptance-test-"));
  temporaryRoots.push(root);
  const workspace = join(root, "workspace");
  const runDirectory = join(root, "run");
  await mkdir(join(workspace, "test"), { recursive: true });
  await writeFile(join(root, "task.md"), task, "utf8");
  await writeFile(join(workspace, "test", "acceptance.test.ts"), testSource, "utf8");
  await mkdir(runDirectory, { recursive: true });
  return { root, workspace, taskPath: join(root, "task.md"), runDirectory };
}
