import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const runner = join(root, "scripts/run-quality.mjs");
const stages = [
  "quality:quick",
  "quality:coverage",
  "quality:crap",
  "quality:knip",
  "quality:mutation",
  "quality:sonar",
] as const;

describe("quality package scripts", () => {
  it("runs the exact full order", async () => {
    const fixture = await createFakePnpm();

    const result = runFull(fixture);

    expect(result.status).toBe(0);
    await expect(readLog(fixture.log)).resolves.toEqual(stages);
    await expect(readEnvironmentLog(fixture.environmentLog)).resolves.toEqual(
      stages.map((stage) => ({
        stage,
        testSecret: "missing",
        sonarToken: stage === "quality:sonar" ? "sonar-test-token" : "missing",
      })),
    );
  });

  it("stops at the first failed stage and preserves its exit status", async () => {
    const fixture = await createFakePnpm("quality:crap", 7);

    const result = runFull(fixture);

    expect(result.status).toBe(7);
    await expect(readLog(fixture.log)).resolves.toEqual(stages.slice(0, 3));
  });

  it("fails closed when a stage executable cannot spawn", async () => {
    const emptyPath = await mkdtemp(join(tmpdir(), "tsqh-quality-empty-path-"));

    const result = spawnSync(process.execPath, [runner, "full"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: emptyPath },
      shell: false,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unable to start pnpm/u);
  });
});

interface FakePnpmFixture {
  readonly bin: string;
  readonly exitCode: number;
  readonly failStage: string;
  readonly log: string;
  readonly environmentLog: string;
}

async function createFakePnpm(failStage = "", exitCode = 1): Promise<FakePnpmFixture> {
  const directory = await mkdtemp(join(tmpdir(), "tsqh-quality-pnpm-"));
  const bin = join(directory, "pnpm");
  const log = join(directory, "calls.log");
  const environmentLog = join(directory, "environment.log");
  const source = [
    `#!${process.execPath}`,
    'const { appendFileSync } = require("node:fs");',
    'const stage = process.argv[2] ?? "";',
    `appendFileSync(${JSON.stringify(log)}, \`${"${stage}"}\\n\`);`,
    `appendFileSync(${JSON.stringify(environmentLog)}, JSON.stringify({ stage, testSecret: process.env.TSQH_TEST_SECRET ?? "missing", sonarToken: process.env.SONAR_TOKEN ?? "missing" }) + "\\n");`,
    `if (stage === ${JSON.stringify(failStage)}) process.exitCode = ${String(exitCode)};`,
    "",
  ].join("\n");
  await writeFile(bin, source, "utf8");
  await chmod(bin, 0o755);
  return { bin, exitCode, failStage, log, environmentLog };
}

function runFull(fixture: FakePnpmFixture): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [runner, "full"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dirname(fixture.bin)}${delimiter}${process.env.PATH ?? ""}`,
      TSQH_TEST_SECRET: "test-secret-must-not-leak",
      SONAR_TOKEN: "sonar-test-token",
    },
    shell: false,
  });
}

async function readLog(path: string): Promise<readonly string[]> {
  return (await readFile(path, "utf8")).trim().split("\n");
}

async function readEnvironmentLog(path: string): Promise<readonly {
  readonly stage: string;
  readonly testSecret: string;
  readonly sonarToken: string;
}[]> {
  return (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as {
      readonly stage: string;
      readonly testSecret: string;
      readonly sonarToken: string;
    });
}
