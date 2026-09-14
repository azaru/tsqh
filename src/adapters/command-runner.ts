import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, resolve } from "node:path";
import { pipeline, Readable } from "node:stream";
import type { CommandRequest, CommandRunner } from "../application/ports.js";
import type { ProcessArtifact } from "../domain/types.js";

const MAX_OUTPUT_BYTES = 65_536;
const PROVIDER_STDOUT_SUMMARY_BYTES = 8_192;
const PROVIDER_STDERR_TAIL_BYTES = 32_768;
const KILL_GRACE_MS = 1_000;
const ENVIRONMENT_ALLOWLIST = [
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
  "CODEX_HOME",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
] as const;

interface Capture {
  readonly chunks: Buffer[];
  readonly mode: "head" | "tail";
  readonly limit: number;
  bytes: number;
  totalBytes: number;
  truncated: boolean;
}

interface ProviderLog {
  readonly fd: number;
  readonly path: string;
  lastStream: "stdout" | "stderr" | null;
  failure: unknown | null;
}

interface ExecutionState {
  readonly stdout: Capture;
  readonly stderr: Capture;
  readonly providerLog: ProviderLog | null;
  readonly resolve: (artifact: ProcessArtifact) => void;
  timeout: NodeJS.Timeout | null;
  forceKillTimer: NodeJS.Timeout | null;
  timedOut: boolean;
  finished: boolean;
}

interface Captures {
  readonly stdout: Capture;
  readonly stderr: Capture;
}

interface ProviderLogPreparation {
  readonly log: ProviderLog | null;
  readonly failed: boolean;
}

export class SpawnCommandRunner implements CommandRunner {
  public async run(request: CommandRequest): Promise<ProcessArtifact> {
    return new Promise((resolve) => executeProcess(request, resolve));
  }
}

function executeProcess(
  request: CommandRequest,
  resolve: (artifact: ProcessArtifact) => void,
): void {
  const state = createExecutionState(request, resolve);
  if (state === null) return;

  const child = spawn(request.executable, [...request.args], {
    cwd: request.cwd,
    shell: false,
    env: minimalEnvironment(process.env, request.environmentKeys ?? []),
  }) as ChildProcessWithoutNullStreams;
  attachOutputHandlers(child, state);
  pipeline(Readable.from([request.stdin ?? ""]), child.stdin, () => undefined);
  state.timeout = setTimeout(() => terminateProcess(child, state), request.timeoutMs);
  child.on("error", (error: NodeJS.ErrnoException) => handleChildError(state, error));
  child.on("close", (exitCode, signal) => handleChildClose(state, exitCode, signal));
}

function createExecutionState(
  request: CommandRequest,
  resolve: (artifact: ProcessArtifact) => void,
): ExecutionState | null {
  const preparedLog = prepareProviderLog(request, resolve);
  if (preparedLog.failed) return null;
  const captures = createCaptures(request.outputMode === "provider");
  return {
    ...captures,
    providerLog: preparedLog.log,
    resolve,
    timeout: null,
    forceKillTimer: null,
    timedOut: false,
    finished: false,
  };
}

function prepareProviderLog(
  request: CommandRequest,
  resolve: (artifact: ProcessArtifact) => void,
): ProviderLogPreparation {
  if (request.outputMode !== "provider") return { log: null, failed: false };
  try {
    return { log: openProviderLog(request.outputLogPath), failed: false };
  } catch (error) {
    resolve(logOpenFailure(error));
    return { log: null, failed: true };
  }
}

function createCaptures(providerOutput: boolean): Captures {
  return providerOutput
    ? {
        stdout: createCapture(PROVIDER_STDOUT_SUMMARY_BYTES, "head"),
        stderr: createCapture(PROVIDER_STDERR_TAIL_BYTES, "tail"),
      }
    : {
        stdout: createCapture(MAX_OUTPUT_BYTES, "head"),
        stderr: createCapture(MAX_OUTPUT_BYTES, "head"),
      };
}

function logOpenFailure(error: unknown): ProcessArtifact {
  return {
    kind: "spawn-error",
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: boundedSanitizedOutput(errorMessage(error)),
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

function attachOutputHandlers(
  child: ChildProcessWithoutNullStreams,
  state: ExecutionState,
): void {
  child.stdout.on("data", (chunk: Buffer) => {
    captureChunk(state.stdout, chunk);
    appendProviderLog(state.providerLog, "stdout", chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    captureChunk(state.stderr, chunk);
    appendProviderLog(state.providerLog, "stderr", chunk);
  });
}

function terminateProcess(
  child: ChildProcessWithoutNullStreams,
  state: ExecutionState,
): void {
  state.timedOut = true;
  child.kill("SIGTERM");
  state.forceKillTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
}

function handleChildError(state: ExecutionState, error: NodeJS.ErrnoException): void {
  appendProviderLog(state.providerLog, "stderr", Buffer.from(error.message, "utf8"));
  finishExecution(state, {
    kind: "spawn-error",
    exitCode: null,
    signal: null,
    stdout: renderCapture(state.stdout),
    stderr: boundedSanitizedOutput(error.message),
    stdoutTruncated: state.stdout.truncated,
    stderrTruncated: false,
  });
}

function handleChildClose(
  state: ExecutionState,
  exitCode: number | null,
  signal: NodeJS.Signals | null,
): void {
  const common = {
    exitCode,
    signal,
    stdout: renderCapture(state.stdout),
    stderr: renderCapture(state.stderr),
    stdoutTruncated: state.stdout.truncated,
    stderrTruncated: state.stderr.truncated,
  };
  finishExecution(state, state.timedOut
    ? { kind: "timeout", ...common }
    : signal !== null
      ? { kind: "signal", ...common }
      : { kind: "exited", ...common });
}

function finishExecution(state: ExecutionState, artifact: ProcessArtifact): void {
  if (state.finished) return;
  state.finished = true;
  clearExecutionTimers(state);
  closeProviderLog(state.providerLog);
  state.resolve(finalizeArtifact(state.providerLog, artifact));
}

function clearExecutionTimers(state: ExecutionState): void {
  if (state.timeout !== null) clearTimeout(state.timeout);
  if (state.forceKillTimer !== null) clearTimeout(state.forceKillTimer);
}

function finalizeArtifact(providerLog: ProviderLog | null, artifact: ProcessArtifact): ProcessArtifact {
  if (providerLog === null) return artifact;
  if (providerLog.failure !== null) return providerLogFailure(artifact, providerLog.failure);
  return { ...artifact, logPath: providerLog.path };
}

function minimalEnvironment(
  source: NodeJS.ProcessEnv,
  additionalKeys: readonly string[],
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [...ENVIRONMENT_ALLOWLIST, ...additionalKeys]) {
    environment[key] = source[key];
  }
  return environment;
}

function createCapture(limit: number, mode: "head" | "tail"): Capture {
  return { chunks: [], mode, limit, bytes: 0, totalBytes: 0, truncated: false };
}

function captureChunk(capture: Capture, chunk: Buffer): void {
  capture.totalBytes += chunk.byteLength;
  if (capture.mode === "head") {
    const remaining = capture.limit - capture.bytes;
    const accepted = chunk.subarray(0, remaining);
    capture.chunks.push(accepted);
    capture.bytes += accepted.byteLength;
    capture.truncated = capture.totalBytes > capture.limit;
    return;
  }

  const existing = Buffer.concat(capture.chunks);
  const combined = Buffer.concat([existing, chunk]);
  const start = Math.max(0, combined.byteLength - capture.limit);
  const accepted = combined.subarray(start);
  capture.chunks.length = 0;
  capture.chunks.push(accepted);
  capture.bytes = accepted.byteLength;
  capture.truncated = capture.totalBytes > capture.limit;
}

function renderCapture(capture: Capture): string {
  const output = Buffer.concat(capture.chunks).toString("utf8");
  return capture.mode === "tail"
    ? boundedSanitizedTail(output, capture.limit)
    : boundedSanitizedOutput(output, capture.limit);
}

function boundedSanitizedOutput(output: string, limit = MAX_OUTPUT_BYTES): string {
  const sanitized = output
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[^\t\n\r\u0020-\u007e\u00a0-\ud7ff\ue000-\ufffd]/g, "\uFFFD");
  if (Buffer.byteLength(sanitized) <= limit) {
    return sanitized;
  }
  return Buffer.from(sanitized)
    .subarray(0, limit)
    .toString("utf8")
    .replace(/\uFFFD$/u, "");
}

function boundedSanitizedTail(output: string, limit: number): string {
  const sanitized = output
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[^\t\n\r\u0020-\u007e\u00a0-\ud7ff\ue000-\ufffd]/g, "\uFFFD");
  if (Buffer.byteLength(sanitized) <= limit) {
    return sanitized;
  }
  return Buffer.from(sanitized)
    .subarray(-limit)
    .toString("utf8")
    .replace(/^\uFFFD/u, "");
}

function openProviderLog(outputLogPath: string | undefined): ProviderLog {
  if (outputLogPath === undefined || outputLogPath.length === 0) {
    throw new Error("Provider output logging requires an outputLogPath.");
  }
  const path = resolve(outputLogPath);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const fd = openSync(path, "w", 0o600);
  const log: ProviderLog = { fd, path, lastStream: null, failure: null };
  writeProviderBytes(log, Buffer.from("TSQH provider output log v1\n", "utf8"));
  return log;
}

function appendProviderLog(
  log: ProviderLog | null,
  stream: "stdout" | "stderr",
  chunk: Buffer,
): void {
  if (log === null || log.failure !== null) return;
  try {
    if (log.lastStream !== stream) {
      writeProviderBytes(log, Buffer.from(`\n[${stream}]\n`, "utf8"));
      log.lastStream = stream;
    }
    writeProviderBytes(log, chunk);
  } catch (error) {
    log.failure = error;
  }
}

function writeProviderBytes(log: ProviderLog, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    offset += writeSync(log.fd, bytes, offset, bytes.byteLength - offset);
  }
}

function closeProviderLog(log: ProviderLog | null): void {
  if (log === null) return;
  try {
    closeSync(log.fd);
  } catch (error) {
    log.failure ??= error;
  }
}

function providerLogFailure(artifact: ProcessArtifact, failure: unknown): ProcessArtifact {
  return {
    ...artifact,
    kind: "spawn-error",
    exitCode: null,
    signal: null,
    stderr: boundedSanitizedOutput(`Provider output log failed: ${errorMessage(failure)}`),
    stderrTruncated: false,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
