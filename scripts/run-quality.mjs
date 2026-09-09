import { spawn } from "node:child_process";
import { join } from "node:path";

const GATES = new Set(["coverage", "crap", "knip", "mutation", "sonar"]);
const FULL_STAGES = [
  "quality:quick",
  "quality:coverage",
  "quality:crap",
  "quality:knip",
  "quality:mutation",
  "quality:sonar",
];
const COMMON_ENVIRONMENT_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "NO_COLOR",
  "CI",
  "XDG_CONFIG_HOME",
  "PNPM_HOME",
  "COREPACK_HOME",
];
const SONAR_ENVIRONMENT_KEYS = ["SONAR_HOST_URL", "SONAR_TOKEN", "SONAR_ORGANIZATION"];

const [mode, ...extra] = process.argv.slice(2);
if (mode === undefined || extra.length > 0 || (mode !== "quick" && mode !== "full" && !GATES.has(mode))) {
  process.stderr.write("Usage: run-quality <quick|coverage|crap|knip|mutation|sonar|full>\n");
  process.exitCode = 2;
} else {
  process.exitCode = await run(mode);
}

async function run(mode) {
  if (mode === "full") {
    return runCommands(FULL_STAGES.map((stage) => ["pnpm", [stage]]));
  }
  if (mode === "quick") {
    return runCommands([
      ["pnpm", ["typecheck"]],
      ["pnpm", ["build"]],
      [join(process.cwd(), "node_modules/.bin/vitest"), ["run"]],
      ["pnpm", ["quality:architecture"]],
    ]);
  }
  return runCommands([
    ["pnpm", ["build"]],
    [process.execPath, ["--enable-source-maps", join(process.cwd(), "dist/quality/cli.js"), mode]],
  ]);
}

async function runCommands(commands) {
  for (const [executable, args] of commands) {
    const exitCode = await runCommand(executable, args);
    if (exitCode !== 0) {
      return exitCode;
    }
  }
  return 0;
}

function runCommand(executable, args) {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env: stageEnvironment(executable, args),
      shell: false,
      stdio: "inherit",
    });
    const finish = (exitCode) => {
      if (!settled) {
        settled = true;
        resolve(exitCode);
      }
    };
    child.on("error", () => {
      process.stderr.write(`Unable to start ${executable}.\n`);
      finish(1);
    });
    child.on("close", (exitCode, signal) => {
      if (signal !== null) {
        process.stderr.write(`${executable} ended with signal ${signal}.\n`);
      }
      finish(signal === null ? (exitCode ?? 1) : 1);
    });
  });
}

function stageEnvironment(executable, args) {
  const isSonar = args.includes("quality:sonar") || (executable === process.execPath && args.at(-1) === "sonar");
  const keys = isSonar ? [...COMMON_ENVIRONMENT_KEYS, ...SONAR_ENVIRONMENT_KEYS] : COMMON_ENVIRONMENT_KEYS;
  return Object.fromEntries(
    [...new Set(keys)]
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
}
