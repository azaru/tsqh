import { spawn } from "node:child_process";
import { pipeline, Readable } from "node:stream";
import type { CommandRequest, CommandRunner } from "../application/ports.js";
import type { ProcessArtifact } from "../domain/types.js";

const MAX_OUTPUT_BYTES = 65_536;
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
  bytes: number;
  truncated: boolean;
}

export class SpawnCommandRunner implements CommandRunner {
  public async run(request: CommandRequest): Promise<ProcessArtifact> {
    return new Promise((resolve) => {
      const stdout = createCapture();
      const stderr = createCapture();
      let timedOut = false;
      let forceKillTimer: NodeJS.Timeout | null = null;
      const child = spawn(request.executable, [...request.args], {
        cwd: request.cwd,
        shell: false,
        env: minimalEnvironment(process.env, request.environmentKeys ?? []),
      });

      child.stdout.on("data", (chunk: Buffer) => captureChunk(stdout, chunk));
      child.stderr.on("data", (chunk: Buffer) => captureChunk(stderr, chunk));
      pipeline(Readable.from([request.stdin ?? ""]), child.stdin, () => undefined);

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
      }, request.timeoutMs);

      const finish = (artifact: ProcessArtifact): void => {
        clearTimeout(timeout);
        if (forceKillTimer !== null) {
          clearTimeout(forceKillTimer);
        }
        resolve(artifact);
      };

      child.on("error", (error: NodeJS.ErrnoException) => {
        finish({
          kind: "spawn-error",
          exitCode: null,
          signal: null,
          stdout: renderCapture(stdout),
          stderr: boundedSanitizedOutput(error.message),
          stdoutTruncated: stdout.truncated,
          stderrTruncated: false,
        });
      });
      child.on("close", (exitCode, signal) => {
        const common = {
          exitCode,
          signal,
          stdout: renderCapture(stdout),
          stderr: renderCapture(stderr),
          stdoutTruncated: stdout.truncated,
          stderrTruncated: stderr.truncated,
        };
        if (timedOut) {
          finish({ kind: "timeout", ...common });
        } else if (signal !== null) {
          finish({ kind: "signal", ...common });
        } else {
          finish({ kind: "exited", ...common });
        }
      });
    });
  }
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

function createCapture(): Capture {
  return { chunks: [], bytes: 0, truncated: false };
}

function captureChunk(capture: Capture, chunk: Buffer): void {
  const remaining = MAX_OUTPUT_BYTES - capture.bytes;
  const accepted = chunk.subarray(0, remaining);
  capture.chunks.push(accepted);
  capture.bytes += accepted.byteLength;
  if (accepted.byteLength < chunk.byteLength) {
    capture.truncated = true;
  }
}

function renderCapture(capture: Capture): string {
  return boundedSanitizedOutput(Buffer.concat(capture.chunks).toString("utf8"));
}

function boundedSanitizedOutput(output: string): string {
  const sanitized = output
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[^\t\n\r\u0020-\u007e\u00a0-\ud7ff\ue000-\ufffd]/g, "\uFFFD");
  if (Buffer.byteLength(sanitized) <= MAX_OUTPUT_BYTES) {
    return sanitized;
  }
  return Buffer.from(sanitized)
    .subarray(0, MAX_OUTPUT_BYTES)
    .toString("utf8")
    .replace(/\uFFFD$/u, "");
}
