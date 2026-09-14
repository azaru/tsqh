import { lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { relative, resolve, sep, join } from "node:path";
import { spawn } from "node:child_process";

const MAX_CAPTURE_BYTES = 16_384;
const MAX_REPORT_BYTES = 8 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 900_000;
const KILL_GRACE_MS = 1_000;
const TEST_FILE_PATTERN = /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const SAFE_ENVIRONMENT_KEYS = [
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

try {
  if (process.argv.length !== 2) {
    throw new Error("Tester validation does not accept command-line arguments.");
  }
  const result = await validateTester(process.cwd());
  process.stdout.write(`${result}\n`);
} catch (error) {
  process.stderr.write(`tester-validation blocked: ${errorMessage(error)}\n`);
  process.exitCode = 1;
}

async function validateTester(workspace) {
  const testFiles = await discoverChangedTestFiles(workspace);
  if (testFiles.length === 0) {
    throw new Error("No changed test files were discovered under test/.");
  }

  await requireSuccess(workspace, "typecheck", "pnpm", ["typecheck"]);
  await validateTestFixtures(workspace, testFiles);

  await mkdir(join(workspace, "tmp"), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(workspace, "tmp/codex-tester-validation-"));
  try {
    const reportPath = join(temporaryDirectory, "vitest.json");
    const testResult = await runCommand(workspace, "pnpm", [
      "exec",
      "vitest",
      "run",
      "--reporter=json",
      `--outputFile=${reportPath}`,
      ...testFiles,
    ]);
    const report = await validateExpectedRed(testResult, reportPath, workspace, testFiles);
    return [
      "tester-validation passed:",
      `${String(report.numFailedTests)} expected assertion failure(s) in`,
      `${String(report.numTotalTests)} test(s) across ${String(testFiles.length)} file(s).`,
    ].join(" ");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function discoverChangedTestFiles(workspace) {
  const tracked = await runCommand(workspace, "git", [
    "diff",
    "--name-only",
    "-z",
    "--diff-filter=ACDMRTUXB",
    "HEAD",
    "--",
    "test",
  ]);
  const untracked = await runCommand(workspace, "git", [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "test",
  ]);
  requireCommandSuccess("Git tracked test discovery", tracked);
  requireCommandSuccess("Git untracked test discovery", untracked);
  if (tracked.stdout.truncated || untracked.stdout.truncated) {
    throw new Error("Git test discovery output was truncated.");
  }

  const paths = new Set([
    ...parseNullSeparated(tracked.stdout.text),
    ...parseNullSeparated(untracked.stdout.text),
  ]);
  return [...paths]
    .filter((path) => TEST_FILE_PATTERN.test(path))
    .sort(compareStrings);
}

async function validateTestFixtures(workspace, testFiles) {
  for (const testFile of testFiles) {
    if (!isSafeTestPath(testFile)) {
      throw new Error(`Test path is not a safe relative path: ${testFile}`);
    }
    const details = await lstat(resolve(workspace, testFile));
    if (!details.isFile()) {
      throw new Error(`Test path is not a regular file: ${testFile}`);
    }
  }
}

async function requireSuccess(workspace, label, executable, args) {
  const result = await runCommand(workspace, executable, args);
  requireCommandSuccess(label, result);
}

function requireCommandSuccess(label, result) {
  if (result.kind !== "exited" || result.exitCode !== 0) {
    throw new Error(`${label} failed: ${renderCommandResult(result)}`);
  }
}

async function validateExpectedRed(result, reportPath, workspace, testFiles) {
  if (result.kind !== "exited" || result.exitCode !== 1) {
    throw new Error(`Expected-red Vitest run did not exit with status 1: ${renderCommandResult(result)}`);
  }
  if (/(?:out of memory|heap|worker.*(?:error|fail|exit)|timed? ?out|timeout|cannot find module|failed to load|unhandled|syntaxerror|fatal)/iu.test(result.stderr.text)) {
    throw new Error(`Expected-red Vitest run reported an infrastructure failure: ${result.stderr.text}`);
  }

  const report = await readJsonReport(reportPath);
  if (!isRecord(report) || report.success !== false || !Array.isArray(report.testResults)) {
    throw new Error("Vitest expected-red report is malformed or does not describe a failed run.");
  }

  let failedAssertions = 0;
  let failedSuites = 0;
  const expectedPaths = new Set(testFiles.map((testFile) => resolve(workspace, testFile)));
  const reportedPaths = new Set();
  for (const suite of report.testResults) {
    if (!isRecord(suite) || typeof suite.name !== "string" || !Array.isArray(suite.assertionResults)) {
      throw new Error("Vitest expected-red report contains a malformed suite.");
    }
    const suitePath = resolve(workspace, suite.name);
    if (!expectedPaths.has(suitePath) || reportedPaths.has(suitePath)) {
      throw new Error("Vitest expected-red report contains an unexpected or duplicate suite.");
    }
    reportedPaths.add(suitePath);
    if (suite.status === "failed") {
      failedSuites += 1;
      if (suite.assertionResults.length === 0) {
        throw new Error("Vitest expected-red report contains a suite failure without assertions.");
      }
    }
    for (const assertion of suite.assertionResults) {
      if (!isRecord(assertion) || typeof assertion.status !== "string") {
        throw new Error("Vitest expected-red report contains a malformed assertion.");
      }
      if (assertion.status === "failed") {
        failedAssertions += 1;
      } else if (!["passed", "pending", "todo", "skipped"].includes(assertion.status)) {
        throw new Error(`Vitest expected-red report contains an unknown assertion status '${assertion.status}'.`);
      }
    }
  }

  if (
    reportedPaths.size !== expectedPaths.size ||
    failedSuites === 0 ||
    failedAssertions === 0 ||
    report.numFailedTestSuites !== failedSuites ||
    report.numFailedTests !== failedAssertions
  ) {
    throw new Error("Vitest expected-red report does not contain complete assertion-failure evidence.");
  }
  return report;
}

async function readJsonReport(path) {
  const details = await lstat(path).catch((error) => {
    throw new Error(`Vitest expected-red report is missing: ${errorMessage(error)}`);
  });
  if (!details.isFile()) {
    throw new Error("Vitest expected-red report is not a regular file.");
  }
  if (details.size > MAX_REPORT_BYTES) {
    throw new Error("Vitest expected-red report exceeds its size limit.");
  }
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Vitest expected-red report is malformed JSON: ${errorMessage(error)}`);
  }
}

function runCommand(workspace, executable, args) {
  return new Promise((resolveResult) => {
    const stdout = createCapture("head");
    const stderr = createCapture("tail");
    let settled = false;
    let timedOut = false;
    let forceKillTimer = null;
    const child = spawn(executable, [...args], {
      cwd: workspace,
      env: gateEnvironment(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer !== null) clearTimeout(forceKillTimer);
      resolveResult({
        ...result,
        stdout: renderCapture(stdout),
        stderr: renderCapture(stderr),
      });
    };

    child.stdout.on("data", (chunk) => captureChunk(stdout, chunk));
    child.stderr.on("data", (chunk) => captureChunk(stderr, chunk));
    child.on("error", (error) => finish({ kind: "spawn-error", exitCode: null, signal: null, error }));
    child.on("close", (exitCode, signal) => finish({
      kind: timedOut ? "timeout" : signal === null ? "exited" : "signal",
      exitCode,
      signal,
    }));

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
    }, COMMAND_TIMEOUT_MS);
  });
}

function gateEnvironment() {
  const environment = { CI: "true" };
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    if (key !== "CI" && process.env[key] !== undefined) {
      environment[key] = process.env[key];
    }
  }
  return environment;
}

function createCapture(mode) {
  return { chunks: [], bytes: 0, totalBytes: 0, mode, truncated: false };
}

function captureChunk(capture, chunk) {
  const bytes = Buffer.from(chunk);
  capture.totalBytes += bytes.byteLength;
  if (capture.mode === "head") {
    if (capture.bytes < MAX_CAPTURE_BYTES) {
      const accepted = bytes.subarray(0, MAX_CAPTURE_BYTES - capture.bytes);
      capture.chunks.push(accepted);
      capture.bytes += accepted.byteLength;
    }
  } else {
    if (bytes.byteLength >= MAX_CAPTURE_BYTES) {
      capture.chunks = [bytes.subarray(-MAX_CAPTURE_BYTES)];
      capture.bytes = MAX_CAPTURE_BYTES;
    } else {
      capture.chunks.push(bytes);
      capture.bytes += bytes.byteLength;
      while (capture.bytes > MAX_CAPTURE_BYTES) {
        const removed = capture.chunks.shift();
        capture.bytes -= removed?.byteLength ?? 0;
      }
    }
  }
  capture.truncated = capture.totalBytes > MAX_CAPTURE_BYTES;
}

function renderCapture(capture) {
  return {
    text: Buffer.concat(capture.chunks).toString("utf8"),
    truncated: capture.truncated,
  };
}

function parseNullSeparated(output) {
  return output.split("\0").filter((path) => path.length > 0);
}

function isSafeTestPath(path) {
  const candidate = resolve("/workspace", path);
  const difference = relative("/workspace", candidate);
  return path.startsWith("test/") &&
    !path.includes("\\") &&
    !path.split("/").some((segment) => segment === "." || segment === "..") &&
    !/[\u0000-\u001f\u007f]/u.test(path) &&
    difference !== ".." &&
    !difference.startsWith(`..${sep}`) &&
    difference !== "";
}

function renderCommandResult(result) {
  if (result.kind === "spawn-error") return `spawn error: ${errorMessage(result.error)}`;
  if (result.kind === "timeout") return "timeout";
  if (result.kind === "signal") return `signal ${result.signal ?? "unknown"}`;
  const details = result.stderr.text || result.stdout.text || "no diagnostic output";
  return `exit ${String(result.exitCode)}: ${details}`;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
