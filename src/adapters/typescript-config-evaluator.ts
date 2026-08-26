import { spawn } from "node:child_process";

const EVALUATION_TIMEOUT_MS = 5_000;
const MAX_EVALUATOR_OUTPUT_BYTES = 65_536;

const EVALUATOR_SOURCE = `
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function normalize(value, path, seen) {
  const kind = typeof value;
  if (value === null || kind === "string" || kind === "boolean") return value;
  if (kind === "number") {
    if (!Number.isFinite(value)) throw new Error(path + " contains a non-finite number");
    return value;
  }
  if (kind !== "object") throw new Error(path + " is not JSON-compatible");
  if (Array.isArray(value)) return normalizeArray(value, path, seen);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(path + " is not a plain object");
  }
  if (seen.has(value)) throw new Error(path + " contains a cycle");
  seen.add(value);
  const normalized = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error(path + " contains a symbol key");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || descriptor.get || descriptor.set) {
      throw new Error(path + "." + key + " is not a plain data property");
    }
    normalized[key] = normalize(descriptor.value, path + "." + key, seen);
  }
  seen.delete(value);
  return normalized;
}

function normalizeArray(value, path, seen) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(path + " is not a plain array");
  }
  if (seen.has(value)) throw new Error(path + " contains a cycle");
  seen.add(value);
  const normalized = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || descriptor.get || descriptor.set) {
      throw new Error(path + "[" + String(index) + "] is not a plain data property");
    }
    normalized.push(normalize(descriptor.value, path + "[" + String(index) + "]", seen));
  }
  if (Reflect.ownKeys(value).length !== value.length + 1) {
    throw new Error(path + " contains a non-index array property");
  }
  seen.delete(value);
  return normalized;
}

const module = await import(pathToFileURL(process.argv[1]).href);
if (!("default" in module)) throw new Error("The module has no default export");
const configuration = normalize(module.default, "default export", new Set());
writeFileSync(3, JSON.stringify({ schemaVersion: 1, configuration }));
`;

interface EvaluationEnvelope {
  readonly schemaVersion: 1;
  readonly configuration: unknown;
}

interface EvaluationArtifact {
  readonly kind: "exited" | "spawn-error" | "timeout" | "signal";
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly envelope: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly outputExceeded: boolean;
}

export async function evaluateTypescriptConfiguration(
  configPath: string,
  workspacePath: string,
  executable = process.execPath,
): Promise<unknown> {
  const artifact = await runEvaluator(configPath, workspacePath, executable);
  assertSuccessfulEvaluation(artifact);
  let envelope: unknown;
  try {
    envelope = JSON.parse(artifact.envelope);
  } catch {
    throw new Error("TypeScript configuration evaluator output is not one valid JSON envelope.");
  }
  if (!isEvaluationEnvelope(envelope)) {
    throw new Error("TypeScript configuration evaluator returned a malformed envelope.");
  }
  if (artifact.envelope !== JSON.stringify(envelope)) {
    throw new Error("TypeScript configuration evaluator output is not one exact JSON envelope.");
  }
  return envelope.configuration;
}

async function runEvaluator(
  configPath: string,
  workspacePath: string,
  executable: string,
): Promise<EvaluationArtifact> {
  return new Promise((resolve) => {
    const envelope = createCapture();
    const stdout = createCapture();
    const stderr = createCapture();
    let outputExceeded = false;
    const child = spawn(
      executable,
      [
        "--experimental-strip-types",
        "--no-warnings",
        "--input-type=module",
        "--eval",
        EVALUATOR_SOURCE,
        configPath,
      ],
      {
        cwd: workspacePath,
        shell: false,
        env: {},
        stdio: ["ignore", "pipe", "pipe", "pipe"],
      },
    );

    const artifact = (
      kind: EvaluationArtifact["kind"],
      exitCode: number | null,
      signal: string | null,
    ): EvaluationArtifact => ({
      kind,
      exitCode,
      signal,
      envelope: renderCapture(envelope),
      stdout: renderCapture(stdout),
      stderr: renderCapture(stderr),
      outputExceeded,
    });
    const finish = (result: EvaluationArtifact): void => {
      clearTimeout(timeout);
      resolve(result);
    };
    const stopForOverflow = (): void => {
      outputExceeded = true;
      child.kill("SIGKILL");
      finish(artifact("signal", null, null));
    };
    child.stdio[3]!.on("data", (chunk: Buffer) => captureChunk(envelope, chunk, stopForOverflow));
    child.stdout!.on("data", (chunk: Buffer) => captureChunk(stdout, chunk, stopForOverflow));
    child.stderr!.on("data", (chunk: Buffer) => captureChunk(stderr, chunk, stopForOverflow));

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(artifact("timeout", null, null));
    }, EVALUATION_TIMEOUT_MS);

    child.on("error", () => {
      finish(artifact("spawn-error", null, null));
    });
    child.on("close", (exitCode, signal) => {
      finish(artifact(signal === null ? "exited" : "signal", exitCode, signal));
    });
  });
}

function assertSuccessfulEvaluation(artifact: EvaluationArtifact): void {
  assertBoundedOutput(artifact);
  assertNormalExit(artifact);
  assertSilentStandardError(artifact);
  assertSilentStandardOutput(artifact);
}

function assertBoundedOutput(artifact: EvaluationArtifact): void {
  if (artifact.outputExceeded) {
    throw new Error(
      `TypeScript configuration evaluator output exceeded the ${String(MAX_EVALUATOR_OUTPUT_BYTES)} byte limit.`,
    );
  }
}

function assertNormalExit(artifact: EvaluationArtifact): void {
  const message = terminationError(artifact);
  if (message !== null) throw new Error(message);
}

function terminationError(artifact: EvaluationArtifact): string | null {
  if (artifact.kind === "spawn-error") return "Unable to start the TypeScript configuration evaluator.";
  if (artifact.kind === "timeout") {
    return `TypeScript configuration evaluation timed out after ${String(EVALUATION_TIMEOUT_MS)} ms.`;
  }
  if (artifact.kind === "signal") {
    return `TypeScript configuration evaluator ended from signal '${String(artifact.signal)}'.`;
  }
  return artifact.exitCode === 0
    ? null
    : `TypeScript configuration evaluator exited with status ${String(artifact.exitCode)}.`;
}

function assertSilentStandardError(artifact: EvaluationArtifact): void {
  if (artifact.stderr.length > 0) {
    throw new Error("TypeScript configuration evaluator wrote unexpected standard error output.");
  }
}

function assertSilentStandardOutput(artifact: EvaluationArtifact): void {
  if (artifact.stdout.length > 0) {
    throw new Error("TypeScript configuration evaluator wrote unexpected standard output.");
  }
}

function isEvaluationEnvelope(value: unknown): value is EvaluationEnvelope {
  if (!isRecord(value)) return false;
  const record = value;
  return Object.keys(record).length === 2 &&
    record.schemaVersion === 1 &&
    Object.hasOwn(record, "configuration");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && !Array.isArray(value);
}

interface Capture {
  readonly chunks: Buffer[];
  bytes: number;
}

function createCapture(): Capture {
  return { chunks: [], bytes: 0 };
}

function captureChunk(capture: Capture, chunk: Buffer, onOverflow: () => void): void {
  const remaining = MAX_EVALUATOR_OUTPUT_BYTES - capture.bytes;
  const accepted = chunk.subarray(0, remaining);
  capture.chunks.push(accepted);
  capture.bytes += accepted.byteLength;
  if (accepted.byteLength !== chunk.byteLength) onOverflow();
}

function renderCapture(capture: Capture): string {
  return Buffer.concat(capture.chunks).toString("utf8");
}
