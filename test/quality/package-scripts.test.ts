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
  it("exposes every stable command through the sequential launcher", async () => {
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      readonly scripts: Readonly<Record<string, string>>;
    };

    expect(manifest.scripts["quality:quick"]).toBe("node scripts/run-quality.mjs quick");
    for (const gate of ["coverage", "crap", "knip", "mutation", "sonar"] as const) {
      expect(manifest.scripts[`quality:${gate}`]).toBe(`node scripts/run-quality.mjs ${gate}`);
    }
    expect(manifest.scripts["quality:full"]).toBe("node scripts/run-quality.mjs full");
    expect(Object.values(manifest.scripts).join("\n")).not.toMatch(/\|\| true|--no-exit-code/u);
  });

  it("runs the exact full order", async () => {
    const fixture = await createFakePnpm();

    const result = runFull(fixture);

    expect(result.status).toBe(0);
    await expect(readLog(fixture.log)).resolves.toEqual(stages);
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
}

async function createFakePnpm(failStage = "", exitCode = 1): Promise<FakePnpmFixture> {
  const directory = await mkdtemp(join(tmpdir(), "tsqh-quality-pnpm-"));
  const bin = join(directory, "pnpm");
  const log = join(directory, "calls.log");
  const source = [
    `#!${process.execPath}`,
    'const { appendFileSync } = require("node:fs");',
    'const stage = process.argv[2] ?? "";',
    'appendFileSync(process.env.TSQH_TEST_QUALITY_LOG, `${stage}\\n`);',
    'if (stage === process.env.TSQH_TEST_FAIL_STAGE) process.exitCode = Number(process.env.TSQH_TEST_EXIT_CODE);',
    "",
  ].join("\n");
  await writeFile(bin, source, "utf8");
  await chmod(bin, 0o755);
  return { bin, exitCode, failStage, log };
}

function runFull(fixture: FakePnpmFixture): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [runner, "full"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dirname(fixture.bin)}${delimiter}${process.env.PATH ?? ""}`,
      TSQH_TEST_QUALITY_LOG: fixture.log,
      TSQH_TEST_FAIL_STAGE: fixture.failStage,
      TSQH_TEST_EXIT_CODE: String(fixture.exitCode),
    },
    shell: false,
  });
}

async function readLog(path: string): Promise<readonly string[]> {
  return (await readFile(path, "utf8")).trim().split("\n");
}
