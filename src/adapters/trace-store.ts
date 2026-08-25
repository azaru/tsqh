import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TraceStore, TraceWriter } from "../application/ports.js";
import type { RunEvent } from "../domain/types.js";

const EVENTS_FILE = "events.jsonl";
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
    const tracePath = resolve(runDirectory, EVENTS_FILE);
    await writeFile(tracePath, "", { flag: "wx", mode: 0o600 });
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
        await appendFile(tracePath, line, { encoding: "utf8", flag: "a" });
        bytesWritten += lineBytes;
      },
    };
  }

  public async read(runDirectoryInput: string): Promise<readonly RunEvent[]> {
    const tracePath = resolve(runDirectoryInput, EVENTS_FILE);
    const details = await stat(tracePath);
    if (!details.isFile() || details.size > MAX_TRACE_BYTES) {
      throw new Error("Run trace is not a bounded regular file.");
    }
    const content = await readFile(tracePath, "utf8");
    if (content.length === 0 || !content.endsWith("\n")) {
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
  if (
    value.schemaVersion !== 1 ||
    !isPositiveSafeInteger(value.sequence) ||
    typeof value.runId !== "string" ||
    typeof value.occurredAt !== "string" ||
    typeof value.type !== "string"
  ) {
    throw new Error(`Run trace line ${String(line)} has an invalid event envelope.`);
  }
  if (value.type === "run-created") {
    requireKeys(value, ["schemaVersion", "sequence", "runId", "occurredAt", "type", "workflowId", "entryStepId", "workspace"], line);
    if (typeof value.workflowId !== "string" || typeof value.entryStepId !== "string" || typeof value.workspace !== "string") {
      throw new Error(`Run trace line ${String(line)} has an invalid run-created event.`);
    }
    return;
  }
  if (value.type === "step-started") {
    requireKeys(value, ["schemaVersion", "sequence", "runId", "occurredAt", "type", "stepId", "stepType", "visit"], line);
    if (typeof value.stepId !== "string" || !isStepType(value.stepType) || !isPositiveSafeInteger(value.visit)) {
      throw new Error(`Run trace line ${String(line)} has an invalid step-started event.`);
    }
    return;
  }
  if (value.type === "step-finished") {
    requireKeys(value, ["schemaVersion", "sequence", "runId", "occurredAt", "type", "stepId", "stepType", "visit", "outcome", "process", "changedPaths", "blocker"], line);
    if (
      typeof value.stepId !== "string" ||
      !isStepType(value.stepType) ||
      !isPositiveSafeInteger(value.visit) ||
      !["completed", "passed", "failed", "blocked"].includes(String(value.outcome)) ||
      !Array.isArray(value.changedPaths) ||
      !value.changedPaths.every((path) => typeof path === "string") ||
      !isNullableProcess(value.process, line) ||
      !isNullableBlocker(value.blocker, line) ||
      !outcomeMatchesStepType(value.stepType, String(value.outcome))
    ) {
      throw new Error(`Run trace line ${String(line)} has an invalid step-finished event.`);
    }
    return;
  }
  if (value.type === "run-finished") {
    requireKeys(value, ["schemaVersion", "sequence", "runId", "occurredAt", "type", "terminalState", "blocker"], line);
    if (
      !isTerminalState(value.terminalState) ||
      !isNullableBlocker(value.blocker, line) ||
      (value.terminalState === "passed" && value.blocker !== null) ||
      (value.terminalState === "blocked" && value.blocker === null)
    ) {
      throw new Error(`Run trace line ${String(line)} has an invalid run-finished event.`);
    }
    return;
  }
  throw new Error(`Run trace line ${String(line)} has unknown event type '${value.type}'.`);
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
  return (
    typeof value.code === "string" &&
    value.code.length > 0 &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    (value.stepId === null || typeof value.stepId === "string")
  );
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
  if (
    !["exited", "spawn-error", "timeout", "signal"].includes(String(value.kind)) ||
    !(value.exitCode === null || (typeof value.exitCode === "number" && Number.isInteger(value.exitCode))) ||
    !(value.signal === null || typeof value.signal === "string") ||
    typeof value.stdout !== "string" ||
    typeof value.stderr !== "string" ||
    typeof value.stdoutTruncated !== "boolean" ||
    typeof value.stderrTruncated !== "boolean"
  ) {
    return false;
  }
  if (value.kind === "exited") {
    return value.exitCode !== null && value.signal === null;
  }
  if (value.kind === "spawn-error") {
    return value.exitCode === null && value.signal === null;
  }
  if (value.kind === "signal") {
    return value.exitCode === null && typeof value.signal === "string" && value.signal.length > 0;
  }
  return true;
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
    return outcome === "completed" || outcome === "blocked";
  }
  if (stepType === "gate") {
    return outcome === "passed" || outcome === "failed" || outcome === "blocked";
  }
  return outcome === "passed" || outcome === "blocked";
}
