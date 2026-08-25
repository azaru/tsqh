import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TraceStore, TraceWriter } from "../application/ports.js";
import type { RunEvent } from "../domain/types.js";

const MAX_EVENT_BYTES = 262_144;
const MAX_TRACE_BYTES = 16_777_216;

export class JsonlTraceStore implements TraceStore {
  public async create(runsRoot: string, runId: string): Promise<TraceWriter> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(runId)) {
      throw new Error("Generated run id is not safe for a run directory.");
    }
    const root = resolve(runsRoot);
    const runDirectory = resolve(root, runId);
    await mkdir(root, { recursive: true, mode: 0o700 });
    await mkdir(runDirectory, { mode: 0o700 });
    const tracePath = resolve(runDirectory, "events.jsonl");
    await writeFile(tracePath, "", { mode: 0o600 });
    let bytesWritten = 0;
    return {
      runDirectory,
      append: async (event) => {
        const line = `${JSON.stringify(event)}\n`;
        const lineBytes = Buffer.byteLength(line);
        if (lineBytes > MAX_EVENT_BYTES) {
          throw new Error("Trace event exceeds the bounded event size.");
        }
        if (bytesWritten + lineBytes > MAX_TRACE_BYTES) {
          throw new Error("Trace exceeds the bounded trace size.");
        }
        await appendFile(tracePath, line, "utf8");
        bytesWritten += lineBytes;
      },
    };
  }

  public async read(runDirectoryInput: string): Promise<readonly RunEvent[]> {
    const tracePath = resolve(runDirectoryInput, "events.jsonl");
    const details = await stat(tracePath);
    if (!details.isFile() || details.size > MAX_TRACE_BYTES) {
      throw new Error("Run trace is not a bounded regular file.");
    }
    const content = await readFile(tracePath, "utf8");
    if (!content.endsWith("\n")) {
      throw new Error("Run trace is empty or does not end with a complete JSON line.");
    }
    const lines = content.slice(0, -1).split("\n");
    return lines.map((line, index) => {
      if (Buffer.byteLength(line) + 1 > MAX_EVENT_BYTES) {
        throw new Error(`Run trace line ${String(index + 1)} exceeds the event size limit.`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error(`Run trace line ${String(index + 1)} is not valid JSON.`);
      }
      assertRunEvent(parsed, index + 1);
      return parsed;
    });
  }
}

function assertRunEvent(value: unknown, line: number): asserts value is RunEvent {
  if (!isRecord(value)) {
    throw new Error(`Run trace line ${String(line)} is not an object.`);
  }
  assertEventEnvelope(value, line);
  if (value.type === "run-created") {
    assertRunCreated(value, line);
    return;
  }
  if (value.type === "step-started") {
    assertStepStarted(value, line);
    return;
  }
  if (value.type === "step-finished") {
    assertStepFinished(value, line);
    return;
  }
  if (value.type === "run-finished") {
    assertRunFinished(value, line);
    return;
  }
  throw new Error(`Run trace line ${String(line)} has unknown event type '${value.type}'.`);
}

function assertEventEnvelope(value: Record<string, unknown>, line: number): void {
  if (
    value.schemaVersion !== 1 ||
    !isPositiveSafeInteger(value.sequence) ||
    typeof value.runId !== "string" ||
    typeof value.occurredAt !== "string" ||
    typeof value.type !== "string"
  ) {
    throw new Error(`Run trace line ${String(line)} has an invalid event envelope.`);
  }
}

function assertRunCreated(value: Record<string, unknown>, line: number): void {
  requireKeys(value, ["schemaVersion", "sequence", "runId", "occurredAt", "type", "workflowId", "entryStepId", "workspace"], line);
  if (typeof value.workflowId !== "string" || typeof value.entryStepId !== "string" || typeof value.workspace !== "string") {
    throw new Error(`Run trace line ${String(line)} has an invalid run-created event.`);
  }
}

function assertStepStarted(value: Record<string, unknown>, line: number): void {
  requireKeys(value, ["schemaVersion", "sequence", "runId", "occurredAt", "type", "stepId", "stepType", "visit"], line);
  if (typeof value.stepId !== "string" || !isStepType(value.stepType) || !isPositiveSafeInteger(value.visit)) {
    throw new Error(`Run trace line ${String(line)} has an invalid step-started event.`);
  }
}

function assertStepFinished(value: Record<string, unknown>, line: number): void {
  requireKeys(value, ["schemaVersion", "sequence", "runId", "occurredAt", "type", "stepId", "stepType", "visit", "outcome", "process", "changedPaths", "blocker"], line);
  if (!hasFinishedIdentity(value)) {
    invalidFinished(line);
  }
  if (!areStringPaths(value.changedPaths)) {
    invalidFinished(line);
  }
  if (!isNullableProcess(value.process, line)) {
    invalidFinished(line);
  }
  if (!isNullableBlocker(value.blocker, line)) {
    invalidFinished(line);
  }
  if (!outcomeMatchesStepType(value.stepType, String(value.outcome))) {
    invalidFinished(line);
  }
}

function hasFinishedIdentity(value: Record<string, unknown>): boolean {
  return typeof value.stepId === "string" &&
    isStepType(value.stepType) &&
    isPositiveSafeInteger(value.visit) &&
    ["completed", "passed", "failed", "blocked"].includes(String(value.outcome));
}

function areStringPaths(value: unknown): boolean {
  return Array.isArray(value) && value.every(isString);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function invalidFinished(line: number): never {
  throw new Error(`Run trace line ${String(line)} has an invalid step-finished event.`);
}

function assertRunFinished(value: Record<string, unknown>, line: number): void {
  requireKeys(value, ["schemaVersion", "sequence", "runId", "occurredAt", "type", "terminalState", "blocker"], line);
  if (!isTerminalState(value.terminalState)) {
    invalidRunFinished(line);
  }
  if (!isNullableBlocker(value.blocker, line)) {
    invalidRunFinished(line);
  }
  if (!terminalMatchesBlocker(value.terminalState, value.blocker)) {
    invalidRunFinished(line);
  }
}

function terminalMatchesBlocker(terminalState: unknown, value: unknown): boolean {
  return terminalState === "passed" ? value === null : value !== null;
}

function invalidRunFinished(line: number): never {
  throw new Error(`Run trace line ${String(line)} has an invalid run-finished event.`);
}

function requireKeys(value: Record<string, unknown>, expected: readonly string[], line: number): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`Run trace line ${String(line)} has unknown or missing properties.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableBlocker(value: unknown, line: number): boolean {
  if (value === null) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  requireKeys(value, ["code", "message", "stepId"], line);
  return hasBlockerText(value) && (value.stepId === null || typeof value.stepId === "string");
}

function hasBlockerText(value: Record<string, unknown>): boolean {
  return typeof value.code === "string" &&
    value.code.length > 0 &&
    typeof value.message === "string" &&
    value.message.length > 0;
}

function isNullableProcess(value: unknown, line: number): boolean {
  if (value === null) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  requireKeys(
    value,
    ["kind", "exitCode", "signal", "stdout", "stderr", "stdoutTruncated", "stderrTruncated"],
    line,
  );
  if (!hasValidProcessFields(value)) {
    return false;
  }
  return processKindMatches(value);
}

function hasValidProcessFields(value: Record<string, unknown>): boolean {
  return isProcessKind(value.kind) &&
    isProcessExitCode(value.exitCode) &&
    hasProcessOutput(value);
}

function isProcessKind(value: unknown): boolean {
  return ["exited", "spawn-error", "timeout", "signal"].includes(String(value));
}

function isProcessExitCode(value: unknown): boolean {
  return value === null || Number.isInteger(value);
}

function hasProcessOutput(value: Record<string, unknown>): boolean {
  return typeof value.stdout === "string" &&
    typeof value.stderr === "string" &&
    typeof value.stdoutTruncated === "boolean" &&
    typeof value.stderrTruncated === "boolean";
}

function processKindMatches(value: Record<string, unknown>): boolean {
  if (value.kind === "exited") {
    return isExitedProcess(value);
  }
  if (value.kind === "signal") {
    return isSignalProcess(value);
  }
  return isSpawnError(value);
}

function isExitedProcess(value: Record<string, unknown>): boolean {
  return value.exitCode !== null && value.signal === null;
}

function isSpawnError(value: Record<string, unknown>): boolean {
  return value.exitCode === null && value.signal === null;
}

function isSignalProcess(value: Record<string, unknown>): boolean {
  return value.exitCode === null && typeof value.signal === "string" && value.signal.length > 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isStepType(value: unknown): boolean {
  return value === "agent" || value === "gate" || value === "terminal";
}

function isTerminalState(value: unknown): boolean {
  return value === "passed" || value === "blocked";
}

function outcomeMatchesStepType(stepType: unknown, outcome: string): boolean {
  if (stepType === "agent") {
    return isAgentOutcome(outcome);
  }
  if (stepType === "gate") {
    return isGateOutcome(outcome);
  }
  return isTerminalOutcome(outcome);
}

function isAgentOutcome(outcome: string): boolean {
  return outcome === "completed" || outcome === "blocked";
}

function isGateOutcome(outcome: string): boolean {
  return outcome === "passed" || outcome === "failed" || outcome === "blocked";
}

function isTerminalOutcome(outcome: string): boolean {
  return outcome === "passed" || outcome === "blocked";
}
