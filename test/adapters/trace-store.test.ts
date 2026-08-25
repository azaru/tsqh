import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlTraceStore } from "../../src/adapters/trace-store.js";

describe("JSONL trace validation", () => {
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
