import { describe, expect, it } from "vitest";
import { planNextAction } from "../../src/domain/planner.js";
import { reduceTrace, TraceValidationError } from "../../src/domain/reducer.js";
import type { Configuration, RunEvent } from "../../src/domain/types.js";

const configuration: Configuration = {
  schemaVersion: 1,
  workflow: {
    id: "planner",
    entryStepId: "implement",
    steps: {
      implement: { type: "agent", role: "worker", maxVisits: 1, onCompleted: "gate" },
      gate: { type: "gate", profile: "quick", maxVisits: 1, onPassed: "passed", onFailed: "repair" },
      repair: { type: "agent", role: "worker", maxVisits: 1, onCompleted: "gate" },
      passed: { type: "terminal", outcome: "passed" },
    },
  },
  roles: {
    worker: { provider: "command", promptPath: "prompts/worker.md", allowedPathPrefixes: ["src/"] },
  },
  providers: {
    command: { type: "command", executable: "agent", args: ["run"], promptTransport: "stdin" },
  },
  profiles: { quick: { executable: "pnpm", args: ["test"] } },
};

describe("pure workflow planning", () => {
  it("returns the same canonical action without mutating equivalent inputs", () => {
    const events = [createdEvent()] as const;
    const state = deepFreeze(reduceTrace(events));
    const config = deepFreeze(structuredClone(configuration));
    const beforeState = structuredClone(state);
    const beforeConfig = structuredClone(config);

    expect(planNextAction(config, state)).toEqual({
      type: "dispatch-agent",
      stepId: "implement",
      visit: 1,
      roleId: "worker",
    });
    expect(planNextAction(structuredClone(config), structuredClone(state))).toEqual(
      planNextAction(config, state),
    );
    expect(state).toEqual(beforeState);
    expect(config).toEqual(beforeConfig);
  });

  it("uses only the configured edge after a recorded outcome", () => {
    const events: RunEvent[] = [
      createdEvent(),
      startedEvent(2, "implement", "agent", 1),
      finishedEvent(3, "implement", "agent", 1, "completed"),
    ];
    expect(planNextAction(configuration, reduceTrace(events))).toEqual({
      type: "run-native-profile",
      stepId: "gate",
      visit: 1,
      profileId: "quick",
    });
  });

  it("blocks before entering a step whose visit budget is exhausted", () => {
    const events: RunEvent[] = [
      createdEvent(),
      startedEvent(2, "implement", "agent", 1),
      finishedEvent(3, "implement", "agent", 1, "completed"),
      startedEvent(4, "gate", "gate", 1),
      finishedEvent(5, "gate", "gate", 1, "failed"),
      startedEvent(6, "repair", "agent", 1),
      finishedEvent(7, "repair", "agent", 1, "completed"),
    ];
    expect(planNextAction(configuration, reduceTrace(events))).toMatchObject({
      type: "finish",
      terminalState: "blocked",
      blocker: { code: "visit-limit-exceeded", stepId: "gate" },
    });
  });

  it("rejects non-contiguous traces", () => {
    expect(() => reduceTrace([{ ...createdEvent(), sequence: 2 }])).toThrow(TraceValidationError);
  });
});

function createdEvent(): RunEvent {
  return {
    schemaVersion: 1,
    sequence: 1,
    runId: "run",
    occurredAt: "2026-01-01T00:00:00.000Z",
    type: "run-created",
    workflowId: "planner",
    entryStepId: "implement",
    workspace: "/workspace",
  };
}

function startedEvent(
  sequence: number,
  stepId: string,
  stepType: "agent" | "gate" | "terminal",
  visit: number,
): RunEvent {
  return {
    schemaVersion: 1,
    sequence,
    runId: "run",
    occurredAt: "2026-01-01T00:00:00.000Z",
    type: "step-started",
    stepId,
    stepType,
    visit,
  };
}

function finishedEvent(
  sequence: number,
  stepId: string,
  stepType: "agent" | "gate" | "terminal",
  visit: number,
  outcome: "completed" | "passed" | "failed" | "blocked",
): RunEvent {
  return {
    schemaVersion: 1,
    sequence,
    runId: "run",
    occurredAt: "2026-01-01T00:00:00.000Z",
    type: "step-finished",
    stepId,
    stepType,
    visit,
    outcome,
    process: null,
    changedPaths: [],
    blocker: null,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((child) => deepFreeze(child));
  }
  return value;
}
