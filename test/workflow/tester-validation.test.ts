import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { loadConfiguration } from "../../src/adapters/config-loader.js";

const execFileAsync = promisify(execFile);
const validatorPath = resolve("workflows/simple/validate-tester.mjs");
const temporaryRoot = resolve("tmp/codex-tester-validation-tests");

describe("simple workflow tester validation", () => {
  it("places tester validation before implementation and does not configure full", async () => {
    const loaded = await loadConfiguration(resolve("workflows/simple/workflow.json"));

    expect(Object.keys(loaded.configuration.workflow.steps)).toEqual([
      "tester",
      "tester-validation",
      "implementer",
      "quick",
      "passed",
      "blocked",
    ]);
    expect(loaded.configuration.workflow.steps["tester-validation"]).toMatchObject({
      type: "gate",
      profile: "tester-validation",
      onPassed: "implementer",
      onFailed: "blocked",
    });
    expect(loaded.configuration.profiles["tester-validation"]).toMatchObject({
      executable: "node",
      args: ["workflows/simple/validate-tester.mjs"],
      timeoutMs: 1_800_000,
    });
    expect(loaded.configuration.profiles.full).toBeUndefined();
  });

  it("accepts assertion-only expected-red evidence without launching Knip", async () => {
    const fixture = await createFixture("valid");

    try {
      const result = await runValidator(fixture);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("tester-validation passed");
      await expect(readFile(fixture.log, "utf8")).resolves.toEqual([
        "typecheck",
        "exec vitest run",
      ].join("\n") + "\n");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["worker out of memory", "oom", /infrastructure failure/u],
    ["malformed JSON", "malformed", /malformed JSON|malformed/u],
    ["missing fixture", "missing-fixture", /regular file|ENOENT/u],
  ] as const)("blocks %s before accepting the tester handoff", async (_label, mode, message) => {
    const fixture = await createFixture(mode);

    try {
      const result = await runValidator(fixture);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(message);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});

interface Fixture {
  readonly root: string;
  readonly bin: string;
  readonly log: string;
}

async function createFixture(mode: "valid" | "oom" | "malformed" | "missing-fixture"): Promise<Fixture> {
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(join(temporaryRoot, "case-"));
  const bin = join(root, "bin");
  const log = join(root, "commands.log");
  await mkdir(bin, { recursive: true });
  await mkdir(join(root, "test"), { recursive: true });
  await writeFile(join(root, "package.json"), '{"type":"commonjs"}\n', "utf8");
  if (mode !== "missing-fixture") {
    await writeFile(join(root, "test/distribution.test.ts"), "export {}\n", "utf8");
  }
  await writeExecutable(join(bin, "git"), fakeGitSource(mode));
  await writeExecutable(join(bin, "pnpm"), fakePnpmSource(mode, log));
  return { root, bin, log };
}

async function runValidator(fixture: Fixture): Promise<{ readonly status: number | null; readonly stdout: string; readonly stderr: string }> {
  try {
    const result = await execFileAsync(process.execPath, [validatorPath], {
      cwd: fixture.root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fixture.bin}${delimiter}${process.env.PATH ?? ""}`,
      },
    });
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { readonly code?: number | string; readonly stdout?: string; readonly stderr?: string };
    return {
      status: typeof failure.code === "number" ? failure.code : null,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

async function writeExecutable(path: string, source: string): Promise<void> {
  await writeFile(path, `#!/usr/bin/env node\n${source}`, "utf8");
  await chmod(path, 0o755);
}

function fakeGitSource(mode: string): string {
  return [
    "const args = process.argv.slice(2);",
    "if (args[0] === 'diff') {",
    `  process.stdout.write(${JSON.stringify(mode === "missing-fixture" ? "test/missing.test.ts\0" : "test/distribution.test.ts\0")});`,
    "} else if (args[0] === 'ls-files') {",
    "  process.stdout.write('\\0');",
    "} else {",
    "  process.exitCode = 2;",
    "}",
  ].join("\n");
}

function fakePnpmSource(mode: string, log: string): string {
  const report = JSON.stringify({
    success: false,
    numTotalTests: 1,
    numFailedTestSuites: 1,
    numFailedTests: 1,
    testResults: [{
      name: "fixture-test-file",
      status: "failed",
      assertionResults: [{ status: "failed" }],
    }],
  });
  return [
    "const { appendFileSync, writeFileSync } = require('node:fs');",
    `const args = process.argv.slice(2); const log = ${JSON.stringify(log)};`,
    "if (args[0] === 'typecheck') appendFileSync(log, 'typecheck\\n');",
    "else if (args[0].startsWith('quality:')) { process.stderr.write('unexpected quality gate\\n'); process.exitCode = 7; }",
    "else if (args[0] === 'exec') {",
    "  appendFileSync(log, args.slice(0, 3).join(' ') + '\\n');",
    "  const output = args.find((value) => value.startsWith('--outputFile='));",
    `  if (output !== undefined) writeFileSync(output.slice('--outputFile='.length), ${JSON.stringify(mode === "malformed" ? "{not json" : report)}.replace('fixture-test-file', process.cwd() + '/test/distribution.test.ts'));`,
    `  if (${JSON.stringify(mode)} === 'oom') process.stderr.write('worker out of memory\\n');`,
    "  process.exitCode = 1;",
    "} else { process.exitCode = 2; }",
  ].join("\n");
}
