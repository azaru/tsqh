import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACCEPTANCE_MANIFEST_PATH,
  inspectAcceptanceCoverage,
  parseAcceptanceManifest,
  runTaskAcceptanceGate,
} from "../../src/application/task-acceptance.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("acceptance evidence", () => {
  it("accepts local requirement identifiers without imposing a task document format", () => {
    expect(parseAcceptanceManifest(JSON.stringify({
      schemaVersion: 1,
      requirements: [
        { id: "published-package", description: "The package is published." },
        { id: "consumer-install", description: "A consumer can install it." },
      ],
    }))).toEqual({
      schemaVersion: 1,
      requirements: [
        { id: "published-package", description: "The package is published." },
        { id: "consumer-install", description: "A consumer can install it." },
      ],
    });
  });

  it("rejects duplicate identifiers and unknown manifest properties", () => {
    expect(() => parseAcceptanceManifest(JSON.stringify({
      schemaVersion: 1,
      requirements: [
        { id: "same", description: "First." },
        { id: "same", description: "Duplicate." },
      ],
    }))).toThrow("requirement 'same' more than once");
    expect(() => parseAcceptanceManifest(JSON.stringify({
      schemaVersion: 1,
      requirements: [{ id: "one", description: "One.", source: "task" }],
    }))).toThrow("only id and description");
  });

  it("counts one or more acceptance tests per local requirement", () => {
    expect(inspectAcceptanceCoverage(
      [
        { id: "published-package", description: "The package is published." },
        { id: "consumer-install", description: "A consumer can install it." },
      ],
      [
        {
          path: "test/package.test.ts",
          content: [
            'it("[acceptance:published-package] publishes", () => {});',
            'it("[acceptance:published-package] preserves metadata", () => {});',
          ].join("\n"),
        },
        { path: "test/consumer.test.ts", content: 'it("[acceptance:consumer-install] installs", () => {});' },
      ],
    )).toEqual({
      requirements: [
        {
          id: "published-package",
          description: "The package is published.",
          testCount: 2,
          testFiles: ["test/package.test.ts"],
        },
        {
          id: "consumer-install",
          description: "A consumer can install it.",
          testCount: 1,
          testFiles: ["test/consumer.test.ts"],
        },
      ],
      missingIds: [],
      unknownIds: [],
    });
  });

  it("writes passing coverage without reading or parsing the task document", async () => {
    const fixture = await createFixture(
      'it("[acceptance:published-package] behavior", () => {});',
      {
        schemaVersion: 1,
        requirements: [{ id: "published-package", description: "The package is published." }],
      },
    );

    const result = await runTaskAcceptanceGate({
      stepId: "acceptance",
      workspacePath: fixture.workspace,
      runDirectory: fixture.runDirectory,
      testPaths: [ACCEPTANCE_MANIFEST_PATH, "test/acceptance.test.ts"],
    });

    expect(result.blocker).toBeNull();
    expect(result.process).toMatchObject({ kind: "exited", exitCode: 0 });
    await expect(readFile(join(fixture.runDirectory, "acceptance-coverage.json"), "utf8"))
      .resolves.toContain('"status": "passed"');
  });

  it("fails missing and unknown coverage as a normal gate failure", async () => {
    const fixture = await createFixture(
      'it("[acceptance:unlisted] behavior", () => {});',
      {
        schemaVersion: 1,
        requirements: [
          { id: "published-package", description: "The package is published." },
          { id: "consumer-install", description: "A consumer can install it." },
        ],
      },
    );

    const result = await runTaskAcceptanceGate({
      stepId: "acceptance",
      workspacePath: fixture.workspace,
      runDirectory: fixture.runDirectory,
      testPaths: [ACCEPTANCE_MANIFEST_PATH, "test/acceptance.test.ts"],
    });

    expect(result.blocker).toBeNull();
    expect(result.process).toMatchObject({ kind: "exited", exitCode: 1 });
    expect(result.process?.stderr).toContain("missing tests for published-package, consumer-install");
    expect(result.process?.stderr).toContain("unknown markers unlisted");
  });

  it("fails when the tester did not create the manifest", async () => {
    const fixture = await createFixture(
      'it("behavior", () => {});',
      null,
    );

    const result = await runTaskAcceptanceGate({
      stepId: "acceptance",
      workspacePath: fixture.workspace,
      runDirectory: fixture.runDirectory,
      testPaths: ["test/acceptance.test.ts"],
    });

    expect(result.blocker).toBeNull();
    expect(result.process).toMatchObject({ kind: "exited", exitCode: 1 });
    expect(result.process?.stderr).toContain("test/acceptance.json");
  });
});

async function createFixture(
  testSource: string,
  manifest: unknown,
): Promise<{ readonly workspace: string; readonly runDirectory: string }> {
  const root = await mkdtemp(join(resolve("tmp"), "codex-task-acceptance-test-"));
  temporaryRoots.push(root);
  const workspace = join(root, "workspace");
  const runDirectory = join(root, "run");
  await mkdir(join(workspace, "test"), { recursive: true });
  await writeFile(join(workspace, "test", "acceptance.test.ts"), testSource, "utf8");
  if (manifest !== null) {
    await writeFile(join(workspace, ACCEPTANCE_MANIFEST_PATH), `${JSON.stringify(manifest)}\n`, "utf8");
  }
  await mkdir(runDirectory, { recursive: true });
  return { workspace, runDirectory };
}
