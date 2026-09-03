import type {
  AgentHandoff,
  GateFailureContext,
  RunEvent,
  RunState,
  StepFinishedEvent,
} from "./types.js";
import { createGateFailureContext } from "./gate-failure-context.js";

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
  const runId = events[0]!.runId;
  for (const [index, event] of events.entries()) {
    validateSequence(event, index + 1);
    validateFirstEvent(event, index);
    if (event.runId !== runId) {
      throw new TraceValidationError(`Trace run id changed at sequence ${String(event.sequence)}.`);
    }
    state = applyEvent(state, event);
  }

  return state as RunState;
}

function validateSequence(event: RunEvent, expectedSequence: number): void {
  if (event.sequence !== expectedSequence || !Number.isSafeInteger(event.sequence)) {
    throw new TraceValidationError(
      `Trace sequence is not contiguous at line ${String(expectedSequence)}; received ${String(event.sequence)}.`,
    );
  }
}

function validateFirstEvent(event: RunEvent, index: number): void {
  if (index === 0 && event.type !== "run-created") {
    throw new TraceValidationError("The first trace event must be run-created.");
  }
}

function applyEvent(state: RunState | null, event: RunEvent): RunState {
  if (event.type === "run-created") {
    return applyRunCreated(state, event);
  }
  state = state as RunState;
  if (state.phase === "finished") {
    throw new TraceValidationError("No event may follow run-finished.");
  }

  if (event.type === "step-started") {
    return applyStepStarted(state, event);
  }

  if (event.type === "step-finished") {
    return applyStepFinished(state, event);
  }

  return applyRunFinished(state, event);
}

function applyRunCreated(
  state: RunState | null,
  event: Extract<RunEvent, { readonly type: "run-created" }>,
): RunState {
  if (state !== null) {
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
    mostRecentAgentHandoff: null,
    mostRecentGateFailure: null,
    terminalState: null,
    blocker: null,
  };
}

function applyStepStarted(
  state: RunState,
  event: Extract<RunEvent, { readonly type: "step-started" }>,
): RunState {
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

function applyStepFinished(state: RunState, event: StepFinishedEvent): RunState {
  if (!matchesActiveStep(state, event)) {
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
    mostRecentAgentHandoff: updatedAgentHandoff(state.mostRecentAgentHandoff, event),
    mostRecentGateFailure: updatedGateFailure(state.mostRecentGateFailure, event),
    blocker: event.blocker,
  };
}

function matchesActiveStep(state: RunState, event: StepFinishedEvent): boolean {
  return state.phase === "running" &&
    event.stepId === state.currentStepId &&
    event.visit === state.visitCounts[event.stepId];
}

function applyRunFinished(
  state: RunState,
  event: Extract<RunEvent, { readonly type: "run-finished" }>,
): RunState {
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

function updatedAgentHandoff(
  previous: AgentHandoff | null,
  event: StepFinishedEvent,
): AgentHandoff | null {
  if (
    event.stepType !== "agent" ||
    event.outcome !== "completed" ||
    event.process?.kind !== "exited" ||
    event.process.exitCode !== 0
  ) {
    return previous;
  }
  return {
    sourceStepId: event.stepId,
    sourceVisit: event.visit,
    text: event.process.stdout,
    truncated: event.process.stdoutTruncated,
  };
}

function updatedGateFailure(
  previous: GateFailureContext | null,
  event: StepFinishedEvent,
): GateFailureContext | null {
  if (event.stepType !== "gate") {
    return previous;
  }
  if (event.outcome === "passed") {
    return null;
  }
  if (event.outcome === "failed" && event.process !== null) {
    return createGateFailureContext(event.stepId, event.visit, event.process);
  }
  return previous;
}
