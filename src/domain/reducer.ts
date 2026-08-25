import type { GateFailure, RunEvent, RunState, StepFinishedEvent } from "./types.js";

export class TraceValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TraceValidationError";
  }
}

export function reduceTrace(events: readonly RunEvent[]): RunState {
  if (events.length === 0) {
    throw new TraceValidationError("The trace is empty.");
  }

  let state: RunState | null = null;
  let runId: string | null = null;
  for (const [index, event] of events.entries()) {
    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence || !Number.isSafeInteger(event.sequence)) {
      throw new TraceValidationError(
        `Trace sequence is not contiguous at line ${String(expectedSequence)}; received ${String(event.sequence)}.`,
      );
    }
    if (index === 0 && event.type !== "run-created") {
      throw new TraceValidationError("The first trace event must be run-created.");
    }
    if (runId === null) {
      runId = event.runId;
    } else if (event.runId !== runId) {
      throw new TraceValidationError(`Trace run id changed at sequence ${String(event.sequence)}.`);
    }
    state = applyEvent(state, event);
  }

  if (state === null) {
    throw new TraceValidationError("The trace could not be reduced.");
  }
  return state;
}

function applyEvent(state: RunState | null, event: RunEvent): RunState {
  if (event.type === "run-created") {
    if (state !== null || event.sequence !== 1) {
      throw new TraceValidationError("run-created must appear exactly once at sequence 1.");
    }
    return {
      runId: event.runId,
      workflowId: event.workflowId,
      workspace: event.workspace,
      phase: "ready",
      currentStepId: event.entryStepId,
      visitCounts: { [event.entryStepId]: 1 },
      latestOutcome: null,
      mostRecentGateFailure: null,
      terminalState: null,
      blocker: null,
    };
  }
  if (state === null) {
    throw new TraceValidationError("A trace event appeared before run-created.");
  }
  if (state.phase === "finished") {
    throw new TraceValidationError("No event may follow run-finished.");
  }

  if (event.type === "step-started") {
    if (state.phase !== "ready" && state.phase !== "transition") {
      throw new TraceValidationError(`step-started is invalid while the run phase is '${state.phase}'.`);
    }
    const previousVisits = state.visitCounts[event.stepId] ?? 0;
    const expectedVisit = state.phase === "ready" ? 1 : previousVisits + 1;
    if (event.visit !== expectedVisit) {
      throw new TraceValidationError(
        `Step '${event.stepId}' visit is ${String(event.visit)}; expected ${String(expectedVisit)}.`,
      );
    }
    return {
      ...state,
      phase: "running",
      currentStepId: event.stepId,
      visitCounts: { ...state.visitCounts, [event.stepId]: event.visit },
    };
  }

  if (event.type === "step-finished") {
    if (
      state.phase !== "running" ||
      event.stepId !== state.currentStepId ||
      event.visit !== state.visitCounts[event.stepId]
    ) {
      throw new TraceValidationError(`step-finished does not match the active step '${state.currentStepId}'.`);
    }
    return {
      ...state,
      phase: "transition",
      latestOutcome: {
        stepId: event.stepId,
        stepType: event.stepType,
        visit: event.visit,
        outcome: event.outcome,
        blocker: event.blocker,
      },
      mostRecentGateFailure: updatedGateFailure(state.mostRecentGateFailure, event),
      blocker: event.blocker,
    };
  }

  if (state.phase === "running") {
    throw new TraceValidationError("run-finished cannot be recorded while a step is running.");
  }
  if (event.terminalState === "passed" && event.blocker !== null) {
    throw new TraceValidationError("A passed run cannot contain a blocker.");
  }
  if (event.terminalState === "blocked" && event.blocker === null) {
    throw new TraceValidationError("A blocked run must contain a blocker.");
  }
  return {
    ...state,
    phase: "finished",
    terminalState: event.terminalState,
    blocker: event.blocker,
  };
}

function updatedGateFailure(previous: GateFailure | null, event: StepFinishedEvent): GateFailure | null {
  if (event.stepType !== "gate") {
    return previous;
  }
  if (event.outcome === "passed") {
    return null;
  }
  if (event.outcome === "failed" && event.process !== null) {
    return { stepId: event.stepId, visit: event.visit, process: event.process };
  }
  return previous;
}
