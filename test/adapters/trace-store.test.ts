import { appendFile, mkdir, mkdtemp, stat, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlTraceStore } from "../../src/adapters/trace-store.js";

const MAX_EVENT_BYTES = 262_144;
const MAX_TRACE_BYTES = 16_777_216;

describe("JSONL trace validation", () => {
  it("creates and reads an exact event stream", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-trace-valid-"));
    const store = new JsonlTraceStore();
    const writer = await store.create(root, "valid-run");
    const events = [
      created(),
      started(),
      finished({ process: processArtifact("exited"), blocker: null }),
      runFinished("passed", null),
    ];
    for (const event of events) {
      await writer.append(event as never);
    }

    await expect(store.read(writer.runDirectory)).resolves.toEqual(events);
  });

  it.each(["", "../escape", "has/slash", "x".repeat(129)])(
    "rejects unsafe run id %j",
    async (runId) => {
      const root = await mkdtemp(join(tmpdir(), "tsqh-trace-id-"));
      await expect(new JsonlTraceStore().create(root, runId)).rejects.toThrow(/run id is not safe/u);
    },
  );

  it("bounds events written through the store", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-trace-large-event-"));
    const writer = await new JsonlTraceStore().create(root, "large-event");

    await expect(writer.append({
      ...created(),
      workspace: "x".repeat(262_144),
    } as never)).rejects.toThrow(/bounded event size/u);
  });

  it("creates private paths exactly once", async () => {
    const root = join(await mkdtemp(join(tmpdir(), "tsqh-trace-private-")), "nested", "runs");
    const store = new JsonlTraceStore();
    const writer = await store.create(root, "private-run");
    const eventsPath = join(writer.runDirectory, "events.jsonl");

    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(writer.runDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(eventsPath)).mode & 0o777).toBe(0o600);
    expect(await stat(eventsPath)).toMatchObject({ size: 0 });
    await expect(store.create(root, "private-run")).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("accepts exact event and cumulative trace byte limits", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-trace-exact-limits-"));
    const store = new JsonlTraceStore();
    const writer = await store.create(root, "exact-limits");
    const event = sizedCreated(MAX_EVENT_BYTES);

    for (let index = 0; index < MAX_TRACE_BYTES / MAX_EVENT_BYTES; index += 1) {
      await writer.append(event as never);
    }

    await expect(store.read(writer.runDirectory)).resolves.toHaveLength(64);
    await expect(writer.append(created() as never)).rejects.toThrow(
      "Trace exceeds the bounded trace size.",
    );
  });

  it("rejects a trace file larger than the cumulative byte limit", async () => {
    const root = await traceDirectory("oversized-file");
    const path = join(root, "events.jsonl");
    await writeFile(path, `${JSON.stringify(created())}\n`, "utf8");
    await truncate(path, MAX_TRACE_BYTES + 1);
    await expect(new JsonlTraceStore().read(root)).rejects.toThrow(
      "Run trace is not a bounded regular file.",
    );
  });

  it("reports the exact one-based line for size, JSON, and shape failures", async () => {
    const valid = `${JSON.stringify(created())}\n`;
    for (const [name, secondLine, message] of [
      ["line-json", "{bad}\n", "Run trace line 2 is not valid JSON."],
      ["line-shape", "null\n", "Run trace line 2 is not an object."],
      ["line-size", "x".repeat(MAX_EVENT_BYTES) + "\n", "Run trace line 2 exceeds the event size limit."],
    ] as const) {
      const root = await traceDirectory(name);
      await writeFile(join(root, "events.jsonl"), valid + secondLine, "utf8");
      await expect(new JsonlTraceStore().read(root)).rejects.toThrow(message);
    }
  });

  it("rejects non-regular, empty, incomplete, oversized, and malformed trace files", async () => {
    const store = new JsonlTraceStore();

    const directory = await traceDirectory("directory");
    await mkdir(join(directory, "events.jsonl"));
    await expect(store.read(directory)).rejects.toThrow(/bounded regular file/u);

    for (const [name, content, message] of [
      ["empty", "", /empty or does not end/u],
      ["incomplete", "{}", /empty or does not end/u],
      ["oversized-line", `${"x".repeat(262_144)}\n`, /event size limit/u],
      ["malformed", "{bad}\n", /not valid JSON/u],
    ] as const) {
      const root = await traceDirectory(name);
      await writeFile(join(root, "events.jsonl"), content, "utf8");
      await expect(store.read(root)).rejects.toThrow(message);
    }
  });

  it.each([
    ["object", null, /not an object/u],
    ["envelope schema", { ...created(), schemaVersion: 2 }, /invalid event envelope/u],
    ["envelope sequence", { ...created(), sequence: 0 }, /invalid event envelope/u],
    ["envelope run id", { ...created(), runId: 1 }, /invalid event envelope/u],
    ["envelope timestamp", { ...created(), occurredAt: 1 }, /invalid event envelope/u],
    ["envelope type", { ...created(), type: 1 }, /invalid event envelope/u],
    ["run-created keys", { ...created(), extra: true }, /unknown or missing properties/u],
    ["run-created fields", { ...created(), workflowId: 1 }, /invalid run-created/u],
    ["run-created entry", { ...created(), entryStepId: 1 }, /invalid run-created/u],
    ["run-created workspace", { ...created(), workspace: 1 }, /invalid run-created/u],
    ["step-started keys", { ...started(), extra: true }, /unknown or missing properties/u],
    ["step-started id", { ...started(), stepId: 1 }, /invalid step-started/u],
    ["step-started type", { ...started(), stepType: "other" }, /invalid step-started/u],
    ["step-started visit", { ...started(), visit: 0 }, /invalid step-started/u],
    ["step-finished keys", { ...finished(), extra: true }, /unknown or missing properties/u],
    ["step-finished id", { ...finished(), stepId: 1 }, /invalid step-finished/u],
    ["step-finished type", { ...finished(), stepType: "other" }, /invalid step-finished/u],
    ["step-finished visit", { ...finished(), visit: 0 }, /invalid step-finished/u],
    ["step-finished outcome", { ...finished(), outcome: "other" }, /invalid step-finished/u],
    ["changed paths array", { ...finished(), changedPaths: null }, /invalid step-finished/u],
    ["changed path", { ...finished(), changedPaths: [1] }, /invalid step-finished/u],
    ["valid changed path check", { ...finished(), changedPaths: ["src/value.ts", "test/value.test.ts"] }, null],
    ["process object", { ...finished(), process: 1 }, /invalid step-finished/u],
    ["blocker object", { ...finished(), blocker: 1 }, /invalid step-finished/u],
    ["agent outcome", { ...finished(), outcome: "passed" }, /invalid step-finished/u],
    ["gate outcome", { ...finished({ stepType: "gate" }), outcome: "completed" }, /invalid step-finished/u],
    ["terminal outcome", { ...finished({ stepType: "terminal" }), outcome: "completed" }, /invalid step-finished/u],
    ["run-finished keys", { ...runFinished("passed", null), extra: true }, /unknown or missing properties/u],
    ["terminal state", { ...runFinished("passed", null), terminalState: "other" }, /invalid run-finished/u],
    ["terminal state with blocker", { ...runFinished("blocked", blocker()), terminalState: "other" }, /invalid run-finished/u],
    ["run-finished blocker shape", runFinished("blocked", 1), /invalid run-finished/u],
    ["passed blocker", runFinished("passed", blocker()), /invalid run-finished/u],
    ["blocked blocker", runFinished("blocked", null), /invalid run-finished/u],
    ["unknown type", { ...created(), type: "unknown" }, /unknown event type/u],
  ])("rejects invalid %s", async (_label, event, message) => {
    if (message === null) {
      await expect(readOne(event)).resolves.toHaveLength(1);
    } else {
      await expect(readOne(event)).rejects.toThrow(message);
    }
  });

  it.each([
    ["process kind", { kind: "other" }],
    ["process exit", { kind: "exited", exitCode: "0" }],
    ["process fractional exit", { kind: "exited", exitCode: 1.5 }],
    ["process signal", { signal: 1 }],
    ["process stdout", { stdout: 1 }],
    ["process stderr", { stderr: 1 }],
    ["stdout truncation", { stdoutTruncated: "false" }],
    ["stderr truncation", { stderrTruncated: "false" }],
    ["exited result", { kind: "exited", exitCode: null }],
    ["exited signal", { kind: "exited", exitCode: 0, signal: "SIGTERM" }],
    ["spawn result", { kind: "spawn-error", exitCode: 1 }],
    ["signal result", { kind: "signal", signal: "" }],
    ["signal exit", { kind: "signal", exitCode: 1, signal: "SIGTERM" }],
    ["timeout result", { kind: "timeout", exitCode: 1 }],
    ["timeout signal", { kind: "timeout", signal: "SIGTERM" }],
  ])("rejects invalid %s", async (_label, processOverrides) => {
    await expect(readOne(finished({
      process: { ...processArtifact("timeout"), ...processOverrides },
    }))).rejects.toThrow(/invalid step-finished/u);
  });

  it("accepts an optional provider log path in a finished process", async () => {
    await expect(readOne(finished({
      process: { ...processArtifact("exited"), logPath: "/runs/run/provider/tester-1.log" },
    }))).resolves.toHaveLength(1);
  });

  it.each(["", "x\u0000.log", "x".repeat(4_097)])("rejects an invalid provider log path %j", async (logPath) => {
    await expect(readOne(finished({
      process: { ...processArtifact("exited"), logPath },
    }))).rejects.toThrow(/invalid step-finished/u);
  });

  it.each([
    ["blocker keys", { ...blocker(), extra: true }, /unknown or missing properties/u],
    ["blocker code", { ...blocker(), code: "" }, /invalid step-finished/u],
    ["blocker message", { ...blocker(), message: "" }, /invalid step-finished/u],
    ["blocker step", { ...blocker(), stepId: 1 }, /invalid step-finished/u],
  ])("rejects invalid %s", async (_label, eventBlocker, message) => {
    await expect(readOne(finished({ outcome: "blocked", blocker: eventBlocker }))).rejects.toThrow(message);
  });

  it.each([
    ["spawn-error", null],
    ["timeout", null],
    ["signal", "SIGTERM"],
  ] as const)("accepts a valid %s artifact", async (kind, signal) => {
    await expect(readOne(finished({
      process: { ...processArtifact(kind), signal },
    }))).resolves.toHaveLength(1);
  });

  it.each([
    ["agent", "completed"],
    ["agent", "blocked"],
    ["gate", "passed"],
    ["gate", "failed"],
    ["gate", "blocked"],
    ["terminal", "passed"],
    ["terminal", "blocked"],
  ] as const)("accepts the valid %s/%s outcome pair", async (stepType, outcome) => {
    await expect(readOne(finished({ stepType, outcome }))).resolves.toHaveLength(1);
  });

  it("rejects the gate-only failed outcome for a terminal step", async () => {
    await expect(readOne(finished({ stepType: "terminal", outcome: "failed" }))).rejects.toThrow(
      /invalid step-finished/u,
    );
  });

  it("accepts a blocked terminal run with its blocker", async () => {
    await expect(readOne(runFinished("blocked", blocker()))).resolves.toHaveLength(1);
  });

  it("accepts nullable blocker step ids and rejects non-string blocker text", async () => {
    await expect(readOne(finished({
      outcome: "blocked",
      blocker: { ...blocker(), stepId: null },
    }))).resolves.toHaveLength(1);
    await expect(readOne(finished({
      outcome: "blocked",
      blocker: { ...blocker(), code: 1 },
    }))).rejects.toThrow(/invalid step-finished/u);
    await expect(readOne(finished({
      outcome: "blocked",
      blocker: { ...blocker(), message: 1 },
    }))).rejects.toThrow(/invalid step-finished/u);
  });

  it("rejects a same-cardinality event key substitution", async () => {
    const event = created();
    delete event.workspace;
    event.extra = "/workspace";
    await expect(readOne(event)).rejects.toThrow(
      "Run trace line 1 has unknown or missing properties.",
    );
  });

  it.each(["1", 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe positive integer %j",
    async (sequence) => {
      await expect(readOne({ ...created(), sequence })).rejects.toThrow(/invalid event envelope/u);
    },
  );

  it("rejects malformed nested process artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-trace-test-"));
    const store = new JsonlTraceStore();
    const writer = await store.create(root, "malformed-run");
    await writer.append({
      schemaVersion: 1,
      sequence: 1,
      runId: "malformed-run",
      occurredAt: "2026-01-01T00:00:00.000Z",
      type: "run-created",
      workflowId: "workflow",
      entryStepId: "step",
      workspace: "/workspace",
    });
    await appendFile(
      join(writer.runDirectory, "events.jsonl"),
      `${JSON.stringify({
        schemaVersion: 1,
        sequence: 2,
        runId: "malformed-run",
        occurredAt: "2026-01-01T00:00:01.000Z",
        type: "step-started",
        stepId: "step",
        stepType: "agent",
        visit: 1,
      })}\n${JSON.stringify({
        schemaVersion: 1,
        sequence: 3,
        runId: "malformed-run",
        occurredAt: "2026-01-01T00:00:02.000Z",
        type: "step-finished",
        stepId: "step",
        stepType: "agent",
        visit: 1,
        outcome: "completed",
        process: {},
        changedPaths: [],
        blocker: null,
      })}\n`,
      "utf8",
    );
    await expect(store.read(writer.runDirectory)).rejects.toThrow(/unknown or missing properties/);
  });
});

function created(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sequence: 1,
    runId: "run",
    occurredAt: "2026-01-01T00:00:00.000Z",
    type: "run-created",
    workflowId: "workflow",
    entryStepId: "step",
    workspace: "/workspace",
  };
}

function started(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sequence: 2,
    runId: "run",
    occurredAt: "2026-01-01T00:00:01.000Z",
    type: "step-started",
    stepId: "step",
    stepType: "agent",
    visit: 1,
  };
}

function finished(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sequence: 3,
    runId: "run",
    occurredAt: "2026-01-01T00:00:02.000Z",
    type: "step-finished",
    stepId: "step",
    stepType: "agent",
    visit: 1,
    outcome: "completed",
    process: null,
    changedPaths: [],
    blocker: null,
    ...overrides,
  };
}

function runFinished(terminalState: string, runBlocker: unknown): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sequence: 4,
    runId: "run",
    occurredAt: "2026-01-01T00:00:03.000Z",
    type: "run-finished",
    terminalState,
    blocker: runBlocker,
  };
}

function processArtifact(kind: string): Record<string, unknown> {
  return {
    kind,
    exitCode: kind === "exited" ? 0 : null,
    signal: null,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

function blocker(): Record<string, unknown> {
  return { code: "blocked", message: "Blocked.", stepId: "step" };
}

function sizedCreated(bytes: number): Record<string, unknown> {
  const event = { ...created(), workspace: "" };
  const baseBytes = Buffer.byteLength(`${JSON.stringify(event)}\n`);
  event.workspace = "x".repeat(bytes - baseBytes);
  if (Buffer.byteLength(`${JSON.stringify(event)}\n`) !== bytes) {
    throw new Error("Unable to construct an exact-size trace event.");
  }
  return event;
}

async function traceDirectory(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `tsqh-trace-${name}-`));
  const runDirectory = join(root, "run");
  await mkdir(runDirectory);
  return runDirectory;
}

async function readOne(event: unknown): Promise<readonly unknown[]> {
  const runDirectory = await traceDirectory("one");
  await writeFile(join(runDirectory, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
  return new JsonlTraceStore().read(runDirectory);
}
