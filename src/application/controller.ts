import { composeAssignmentPrompt } from "./prompt.js";
import type { GitSnapshot, RuntimeServices, TraceWriter } from "./ports.js";
import { planNextAction } from "../domain/planner.js";
import { reduceTrace } from "../domain/reducer.js";
import type {
  Blocker,
  Configuration,
  ProcessArtifact,
  RunEvent,
  RunFinishedEvent,
  RunState,
  StepFinishedEvent,
  StepStartedEvent,
  WorkflowStep,
} from "../domain/types.js";

const DEFAULT_AGENT_TIMEOUT_MS = 900_000;
const DEFAULT_GATE_TIMEOUT_MS = 900_000;

export interface ControllerInput {
  readonly configuration: Configuration;
  readonly prompts: Readonly<Record<string, string>>;
  readonly configPath: string;
  readonly promptPaths: readonly string[];
  readonly workspacePath: string;
  readonly task: string;
  readonly taskPath: string;
  readonly runsRoot: string;
}

export interface ControllerResult {
  readonly runId: string;
  readonly runDirectory: string;
  readonly events: readonly RunEvent[];
  readonly state: RunState;
}

export async function runController(
  input: ControllerInput,
  services: RuntimeServices,
): Promise<ControllerResult> {
  const protectedAbsolutePaths = [input.configPath, input.taskPath, input.runsRoot, ...input.promptPaths];
  const workspace = await services.git.openCleanWorkspace(input.workspacePath, protectedAbsolutePaths);
  if (workspace.path === input.runsRoot) {
    throw new Error("The runs root cannot be the workspace root.");
  }
  const runId = services.createRunId();
  const trace = await services.traces.create(input.runsRoot, runId);
  const events: RunEvent[] = [];

  await appendEvent(events, trace, {
    schemaVersion: 1,
    sequence: 1,
    runId,
    occurredAt: services.now(),
    type: "run-created",
    workflowId: input.configuration.workflow.id,
    entryStepId: input.configuration.workflow.entryStepId,
    workspace: workspace.path,
  });

  while (true) {
    const state = reduceTrace(events);
    const action = planNextAction(input.configuration, state);
    if (action.type === "finish") {
      const event: RunFinishedEvent = {
        ...baseEvent(events, runId, services),
        type: "run-finished",
        terminalState: action.terminalState,
        blocker: action.blocker,
      };
      await appendEvent(events, trace, event);
      const finalState = reduceTrace(events);
      return { runId, runDirectory: trace.runDirectory, events, state: finalState };
    }

    const step = input.configuration.workflow.steps[action.stepId];
    if (step === undefined) {
      throw new Error(`Planner selected unknown step '${action.stepId}'.`);
    }
    await appendStepStarted(events, trace, runId, services, action.stepId, step, action.visit);

    if (action.type === "enter-terminal") {
      const blocker =
        action.outcome === "blocked"
          ? createBlocker(
              "configured-terminal-blocked",
              `Terminal step '${action.stepId}' blocks the run.`,
              action.stepId,
            )
          : null;
      await appendStepFinished(events, trace, runId, services, {
        stepId: action.stepId,
        stepType: "terminal",
        visit: action.visit,
        outcome: action.outcome,
        process: null,
        changedPaths: [],
        blocker,
      });
      continue;
    }

    if (action.type === "run-native-profile") {
      const profile = input.configuration.profiles[action.profileId];
      if (profile === undefined) {
        throw new Error(`Planner selected unknown quality profile '${action.profileId}'.`);
      }
      const process = await services.commandRunner.run({
        executable: profile.executable,
        args: profile.args,
        cwd: workspace.path,
        stdin: null,
        timeoutMs: profile.timeoutMs ?? DEFAULT_GATE_TIMEOUT_MS,
      });
      const blocker = gateBlocker(action.stepId, process);
      await appendStepFinished(events, trace, runId, services, {
        stepId: action.stepId,
        stepType: "gate",
        visit: action.visit,
        outcome: blocker === null ? (process.exitCode === 0 ? "passed" : "failed") : "blocked",
        process,
        changedPaths: [],
        blocker,
      });
      continue;
    }

    const role = input.configuration.roles[action.roleId];
    if (role === undefined) {
      throw new Error(`Planner selected unknown role '${action.roleId}'.`);
    }
    const provider = input.configuration.providers[role.provider];
    if (provider === undefined) {
      throw new Error(`Role '${action.roleId}' selected unknown provider '${role.provider}'.`);
    }
    const rolePrompt = input.prompts[action.roleId];
    if (rolePrompt === undefined) {
      throw new Error(`No loaded prompt is available for role '${action.roleId}'.`);
    }

    let before: GitSnapshot | null = null;
    let process: ProcessArtifact | null = null;
    let changedPaths: readonly string[] = [];
    let blocker: Blocker | null = null;
    try {
      before = await services.git.snapshot(workspace.path);
    } catch (error) {
      blocker = createBlocker("git-inspection-failed", errorMessage(error), action.stepId);
    }

    if (blocker === null && before !== null) {
      process = await services.commandRunner.run({
        executable: provider.executable,
        args: provider.args,
        cwd: workspace.path,
        stdin: composeAssignmentPrompt({
          rolePrompt,
          task: input.task,
          runId,
          workflowId: input.configuration.workflow.id,
          workspace: workspace.path,
          stepId: action.stepId,
          visit: action.visit,
          roleId: action.roleId,
          providerId: role.provider,
          mostRecentGateFailure: state.mostRecentGateFailure,
        }),
        timeoutMs: provider.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
      });
      try {
        changedPaths = await services.git.changedPathsSince(workspace.path, before);
        blocker = validateAgentPaths(
          action.stepId,
          changedPaths,
          role.allowedPathPrefixes,
          workspace.protectedPaths,
        );
      } catch (error) {
        blocker = createBlocker("git-inspection-failed", errorMessage(error), action.stepId);
      }
      blocker ??= agentProcessBlocker(action.stepId, process);
    }

    await appendStepFinished(events, trace, runId, services, {
      stepId: action.stepId,
      stepType: "agent",
      visit: action.visit,
      outcome: blocker === null ? "completed" : "blocked",
      process,
      changedPaths,
      blocker,
    });
  }
}

function validateAgentPaths(
  stepId: string,
  changedPaths: readonly string[],
  allowedPrefixes: readonly string[],
  protectedPaths: readonly string[],
): Blocker | null {
  const unauthorized = changedPaths.filter(
    (changedPath) =>
      protectedPaths.some(
        (protectedPath) => changedPath === protectedPath || changedPath.startsWith(`${protectedPath}/`),
      ) ||
      !allowedPrefixes.some((prefix) =>
        prefix.endsWith("/") ? changedPath.startsWith(prefix) : changedPath === prefix,
      ),
  );
  if (unauthorized.length === 0) {
    return null;
  }
  return createBlocker(
    "unauthorized-changes",
    `Step '${stepId}' changed unauthorized paths: ${unauthorized.join(", ")}.`,
    stepId,
  );
}

function agentProcessBlocker(stepId: string, process: ProcessArtifact): Blocker | null {
  if (process.kind === "spawn-error") {
    return createBlocker("agent-spawn-error", `Agent step '${stepId}' could not be launched.`, stepId);
  }
  if (process.kind === "timeout") {
    return createBlocker("agent-timeout", `Agent step '${stepId}' timed out.`, stepId);
  }
  if (process.kind === "signal") {
    return createBlocker(
      "agent-signal",
      `Agent step '${stepId}' ended from signal '${process.signal ?? "unknown"}'.`,
      stepId,
    );
  }
  if (process.exitCode !== 0) {
    return createBlocker(
      "agent-exit-nonzero",
      `Agent step '${stepId}' exited with status ${String(process.exitCode)}.`,
      stepId,
    );
  }
  return null;
}

function gateBlocker(stepId: string, process: ProcessArtifact): Blocker | null {
  if (process.kind === "spawn-error") {
    return createBlocker("gate-spawn-error", `Gate step '${stepId}' could not be launched.`, stepId);
  }
  if (process.kind === "timeout") {
    return createBlocker("gate-timeout", `Gate step '${stepId}' timed out.`, stepId);
  }
  if (process.kind === "signal") {
    return createBlocker(
      "gate-signal",
      `Gate step '${stepId}' ended from signal '${process.signal ?? "unknown"}'.`,
      stepId,
    );
  }
  return null;
}

async function appendStepStarted(
  events: RunEvent[],
  trace: TraceWriter,
  runId: string,
  services: RuntimeServices,
  stepId: string,
  step: WorkflowStep,
  visit: number,
): Promise<void> {
  const event: StepStartedEvent = {
    ...baseEvent(events, runId, services),
    type: "step-started",
    stepId,
    stepType: step.type,
    visit,
  };
  await appendEvent(events, trace, event);
}

async function appendStepFinished(
  events: RunEvent[],
  trace: TraceWriter,
  runId: string,
  services: RuntimeServices,
  fields: Omit<StepFinishedEvent, "schemaVersion" | "sequence" | "runId" | "occurredAt" | "type">,
): Promise<void> {
  const event: StepFinishedEvent = {
    ...baseEvent(events, runId, services),
    type: "step-finished",
    ...fields,
  };
  await appendEvent(events, trace, event);
}

function baseEvent(
  events: readonly RunEvent[],
  runId: string,
  services: RuntimeServices,
): Pick<RunEvent, "schemaVersion" | "sequence" | "runId" | "occurredAt"> {
  return {
    schemaVersion: 1,
    sequence: events.length + 1,
    runId,
    occurredAt: services.now(),
  };
}

async function appendEvent(events: RunEvent[], trace: TraceWriter, event: RunEvent): Promise<void> {
  await trace.append(event);
  events.push(event);
}

function createBlocker(code: string, message: string, stepId: string | null): Blocker {
  return { code, message, stepId };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
