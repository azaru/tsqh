import type {
  Blocker,
  Configuration,
  PlannedAction,
  RunState,
  StepOutcome,
  WorkflowStep,
} from "./types.js";

export function planNextAction(configuration: Configuration, state: RunState): PlannedAction {
  if (state.workflowId !== configuration.workflow.id) {
    return blocked("workflow-mismatch", "The run workflow does not match the configured workflow.", null);
  }
  return planForPhase(configuration, state);
}

function planForPhase(configuration: Configuration, state: RunState): PlannedAction {
  if (state.phase === "finished") {
    return {
      type: "finish",
      terminalState: state.terminalState ?? "blocked",
      blocker: state.blocker,
    };
  }
  if (state.phase === "running") {
    return blocked("action-already-running", "A workflow action is already running.", state.currentStepId);
  }

  if (state.phase === "ready") {
    return actionForStep(configuration, state.currentStepId, state.visitCounts[state.currentStepId] ?? 1);
  }

  return planTransition(configuration, state);
}

function planTransition(configuration: Configuration, state: RunState): PlannedAction {
  const latest = state.latestOutcome;
  if (!isCurrentOutcome(latest, state.currentStepId)) {
    return blocked("missing-outcome", "No current recorded outcome is available for transition selection.", state.currentStepId);
  }
  if (latest.outcome === "blocked") {
    return finishBlockedStep(latest);
  }

  const source = configuration.workflow.steps[latest.stepId];
  if (source === undefined) {
    return blocked("unknown-current-step", `Current step '${latest.stepId}' does not exist.`, latest.stepId);
  }
  if (source.type === "terminal") {
    return finishTerminal(source.outcome, latest.stepId);
  }

  const targetStepId = transitionTarget(source, latest.outcome);
  if (targetStepId === null) {
    return blocked(
      "missing-transition",
      `Step '${latest.stepId}' has no configured edge for outcome '${latest.outcome}'.`,
      latest.stepId,
    );
  }
  return planTarget(configuration, state, latest.stepId, targetStepId);
}

function finishBlockedStep(latest: NonNullable<RunState["latestOutcome"]>): PlannedAction {
  return {
    type: "finish",
    terminalState: "blocked",
    blocker: latest.blocker ??
      createBlocker("step-blocked", `Step '${latest.stepId}' recorded a blocker.`, latest.stepId),
  };
}

function planTarget(
  configuration: Configuration,
  state: RunState,
  sourceStepId: string,
  targetStepId: string,
): PlannedAction {
  const target = configuration.workflow.steps[targetStepId];
  if (target === undefined) {
    return blocked("unknown-transition-target", `Transition target '${targetStepId}' does not exist.`, sourceStepId);
  }

  const nextVisit = (state.visitCounts[targetStepId] ?? 0) + 1;
  if (target.type !== "terminal" && nextVisit > target.maxVisits) {
    return blocked(
      "visit-limit-exceeded",
      `Step '${targetStepId}' would exceed maxVisits ${String(target.maxVisits)}.`,
      targetStepId,
    );
  }
  return actionForStep(configuration, targetStepId, nextVisit);
}

function isCurrentOutcome(
  latest: RunState["latestOutcome"],
  currentStepId: string,
): latest is NonNullable<RunState["latestOutcome"]> {
  return latest !== null && latest.stepId === currentStepId;
}

function finishTerminal(outcome: "passed" | "blocked", stepId: string): PlannedAction {
  return {
    type: "finish",
    terminalState: outcome,
    blocker: outcome === "blocked"
      ? createBlocker("configured-terminal-blocked", `Terminal step '${stepId}' blocks the run.`, stepId)
      : null,
  };
}

function actionForStep(configuration: Configuration, stepId: string, visit: number): PlannedAction {
  const step = configuration.workflow.steps[stepId];
  if (step === undefined) {
    return blocked("unknown-step", `Step '${stepId}' does not exist.`, stepId);
  }
  if (step.type === "agent") {
    return { type: "dispatch-agent", stepId, visit, roleId: step.role };
  }
  if (step.type === "gate") {
    return { type: "run-native-profile", stepId, visit, profileId: step.profile };
  }
  return { type: "enter-terminal", stepId, visit, outcome: step.outcome };
}

function transitionTarget(step: Exclude<WorkflowStep, { readonly type: "terminal" }>, outcome: StepOutcome): string | null {
  if (step.type === "agent") {
    return outcome === "completed" ? step.onCompleted : null;
  }
  if (outcome === "passed") {
    return step.onPassed;
  }
  if (outcome === "failed") {
    return step.onFailed;
  }
  return null;
}

function blocked(code: string, message: string, stepId: string | null): PlannedAction {
  return { type: "finish", terminalState: "blocked", blocker: createBlocker(code, message, stepId) };
}

function createBlocker(code: string, message: string, stepId: string | null): Blocker {
  return { code, message, stepId };
}
