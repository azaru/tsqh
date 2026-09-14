import { join } from "node:path";
import { composeAssignmentPrompt } from "./prompt.js";
import type { CleanWorkspace, GitSnapshot, RuntimeServices, TraceWriter } from "./ports.js";
import { renderAgentArguments, resolveAgentSelection } from "../domain/agent-selection.js";
import { planNextAction } from "../domain/planner.js";
import { reduceTrace } from "../domain/reducer.js";
import type {
  Blocker,
  CommandProvider,
  Configuration,
  PlannedAction,
  ProcessArtifact,
  QualityProfile,
  Role,
  RunEvent,
  RunFinishedEvent,
  RunState,
  StepFinishedEvent,
  StepStartedEvent,
  WorkflowStep,
} from "../domain/types.js";

const DEFAULT_AGENT_TIMEOUT_MS = 900_000;
const DEFAULT_GATE_TIMEOUT_MS = 900_000;
const STEP_TYPES = {
  "dispatch-agent": "agent",
  "enter-terminal": "terminal",
  "run-native-profile": "gate",
} as const;

export interface ControllerInput {
  readonly configuration: Configuration;
  readonly prompts: Readonly<Record<string, string>>;
  readonly configPath: string | null;
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
  const protectedAbsolutePaths = [
    ...(input.configPath === null ? [] : [input.configPath]),
    input.taskPath,
    input.runsRoot,
    ...input.promptPaths,
  ];
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

  return runLoop({ input, services, workspace, runId, trace, events });
}

interface ControllerContext {
  readonly input: ControllerInput;
  readonly services: RuntimeServices;
  readonly workspace: CleanWorkspace;
  readonly runId: string;
  readonly trace: TraceWriter;
  readonly events: RunEvent[];
}

type ExecutableAction = Exclude<PlannedAction, { readonly type: "finish" }>;

async function runLoop(context: ControllerContext): Promise<ControllerResult> {
  const maxIterations = workflowActionBound(context.input.configuration);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const { input, events } = context;
    const state = reduceTrace(events);
    const action = planNextAction(input.configuration, state);
    if (action.type === "finish") {
      return finishRun(context, action);
    }

    await appendStepStarted(
      events,
      context.trace,
      context.runId,
      context.services,
      action.stepId,
      STEP_TYPES[action.type],
      action.visit,
    );
    await executeAction(context, state, action);
  }

  return finishRun(context, {
    type: "finish",
    terminalState: "blocked",
    blocker: createBlocker(
      "workflow-action-bound-exceeded",
      "The controller exceeded the configured workflow action bound.",
      null,
    ),
  });
}

function workflowActionBound(configuration: Configuration): number {
  return Object.values(configuration.workflow.steps).reduce(
    (total, step) => total + (step.type === "terminal" ? 1 : step.maxVisits),
    1,
  );
}

async function finishRun(
  context: ControllerContext,
  action: Extract<PlannedAction, { readonly type: "finish" }>,
): Promise<ControllerResult> {
  const event: RunFinishedEvent = {
    ...baseEvent(context.events, context.runId, context.services),
    type: "run-finished",
    terminalState: action.terminalState,
    blocker: action.blocker,
  };
  await appendEvent(context.events, context.trace, event);
  return {
    runId: context.runId,
    runDirectory: context.trace.runDirectory,
    events: context.events,
    state: reduceTrace(context.events),
  };
}

async function executeAction(
  context: ControllerContext,
  state: RunState,
  action: ExecutableAction,
): Promise<void> {
  if (action.type === "enter-terminal") {
    await executeTerminal(context, action);
    return;
  }
  if (action.type === "run-native-profile") {
    await executeGate(context, action);
    return;
  }
  await executeAgent(context, state, action);
}

async function executeTerminal(
  context: ControllerContext,
  action: Extract<ExecutableAction, { readonly type: "enter-terminal" }>,
): Promise<void> {
  const blocker = action.outcome === "blocked"
    ? createBlocker(
        "configured-terminal-blocked",
        `Terminal step '${action.stepId}' blocks the run.`,
        action.stepId,
      )
    : null;
  await appendStepFinished(context.events, context.trace, context.runId, context.services, {
    stepId: action.stepId,
    stepType: "terminal",
    visit: action.visit,
    outcome: action.outcome,
    process: null,
    changedPaths: [],
    blocker,
  });
}

async function executeGate(
  context: ControllerContext,
  action: Extract<ExecutableAction, { readonly type: "run-native-profile" }>,
): Promise<void> {
  const profile = requireProfile(context.input.configuration, action.profileId);
  const before = await inspectBeforeGate(context, action.stepId);
  if (before.snapshot === null) {
    await appendGateResult(context, action, null, [], before.blocker);
    return;
  }
  const process = await context.services.commandRunner.run({
    executable: profile.executable,
    args: profile.args,
    cwd: context.workspace.path,
    stdin: null,
    timeoutMs: profile.timeoutMs ?? DEFAULT_GATE_TIMEOUT_MS,
    environmentKeys: profile.environmentKeys ?? [],
  });
  const inspection = await inspectAfterGate(context, action.stepId, before.snapshot);
  const blocker = inspection.blocker ?? gateBlocker(action.stepId, process);
  await appendGateResult(context, action, process, inspection.changedPaths, blocker);
}

async function inspectBeforeGate(
  context: ControllerContext,
  stepId: string,
): Promise<BeforeInspection> {
  try {
    return { snapshot: await context.services.git.snapshot(context.workspace.path), blocker: null };
  } catch (error) {
    return {
      snapshot: null,
      blocker: createBlocker(
        "git-inspection-failed",
        `Git inspection before gate '${stepId}' failed: ${errorMessage(error)}`,
        stepId,
      ),
    };
  }
}

async function inspectAfterGate(
  context: ControllerContext,
  stepId: string,
  before: GitSnapshot,
): Promise<AfterInspection> {
  try {
    const changedPaths = await context.services.git.changedPathsSince(context.workspace.path, before);
    return {
      changedPaths,
      blocker: changedPaths.length === 0
        ? null
        : createBlocker(
            "gate-mutated-candidate",
            `Gate step '${stepId}' changed candidate paths: ${changedPaths.join(", ")}.`,
            stepId,
          ),
    };
  } catch (error) {
    return {
      changedPaths: [],
      blocker: createBlocker(
        "git-inspection-failed",
        `Git inspection after gate '${stepId}' failed: ${errorMessage(error)}`,
        stepId,
      ),
    };
  }
}

async function appendGateResult(
  context: ControllerContext,
  action: Extract<ExecutableAction, { readonly type: "run-native-profile" }>,
  process: ProcessArtifact | null,
  changedPaths: readonly string[],
  blocker: Blocker | null,
): Promise<void> {
  await appendStepFinished(context.events, context.trace, context.runId, context.services, {
    stepId: action.stepId,
    stepType: "gate",
    visit: action.visit,
    outcome: gateOutcome(process, blocker),
    process,
    changedPaths,
    blocker,
  });
}

function requireProfile(configuration: Configuration, profileId: string): QualityProfile {
  const profile = configuration.profiles[profileId];
  if (profile === undefined) {
    throw new Error(`Planner selected unknown quality profile '${profileId}'.`);
  }
  return profile;
}

function gateOutcome(
  process: ProcessArtifact | null,
  blocker: Blocker | null,
): "passed" | "failed" | "blocked" {
  if (blocker !== null || process === null) {
    return "blocked";
  }
  return process.exitCode === 0 ? "passed" : "failed";
}

interface AgentDefinition {
  readonly role: Role;
  readonly provider: CommandProvider;
  readonly prompt: string;
  readonly args: readonly string[];
}

async function executeAgent(
  context: ControllerContext,
  state: RunState,
  action: Extract<ExecutableAction, { readonly type: "dispatch-agent" }>,
): Promise<void> {
  const definition = requireAgentDefinition(context.input, action.stepId, action.roleId);
  const before = await inspectBefore(context, action.stepId);
  if (before.snapshot === null) {
    await appendAgentResult(context, action, null, [], before.blocker);
    return;
  }

  const process = await runAgentProcess(context, state, action, definition);
  const inspection = await inspectAfter(context, action, definition.role, before.snapshot);
  const blocker = inspection.blocker ?? agentProcessBlocker(action.stepId, process);
  await appendAgentResult(context, action, process, inspection.changedPaths, blocker);
}

function requireAgentDefinition(input: ControllerInput, stepId: string, roleId: string): AgentDefinition {
  const step = input.configuration.workflow.steps[stepId] as Extract<
    WorkflowStep,
    { readonly type: "agent" }
  >;
  const role = input.configuration.roles[roleId];
  if (role === undefined) {
    throw new Error(`Planner selected unknown role '${roleId}'.`);
  }
  const provider = input.configuration.providers[role.provider];
  if (provider === undefined) {
    throw new Error(`Role '${roleId}' selected unknown provider '${role.provider}'.`);
  }
  const prompt = input.prompts[roleId];
  if (prompt === undefined) {
    throw new Error(`No loaded prompt is available for role '${roleId}'.`);
  }
  const selection = resolveAgentSelection(step, role, provider);
  return { role, provider, prompt, args: renderAgentArguments(provider.args, selection) };
}

type BeforeInspection =
  | { readonly snapshot: GitSnapshot; readonly blocker: null }
  | { readonly snapshot: null; readonly blocker: Blocker };

async function inspectBefore(context: ControllerContext, stepId: string): Promise<BeforeInspection> {
  try {
    return { snapshot: await context.services.git.snapshot(context.workspace.path), blocker: null };
  } catch (error) {
    return {
      snapshot: null,
      blocker: createBlocker("git-inspection-failed", errorMessage(error), stepId),
    };
  }
}

async function runAgentProcess(
  context: ControllerContext,
  state: RunState,
  action: Extract<ExecutableAction, { readonly type: "dispatch-agent" }>,
  definition: AgentDefinition,
): Promise<ProcessArtifact> {
  return context.services.commandRunner.run({
    executable: definition.provider.executable,
    args: definition.args,
    cwd: context.workspace.path,
    stdin: composeAssignmentPrompt({
      rolePrompt: definition.prompt,
      task: context.input.task,
      runId: context.runId,
      workflowId: context.input.configuration.workflow.id,
      workspace: context.workspace.path,
      stepId: action.stepId,
      visit: action.visit,
      roleId: action.roleId,
      providerId: definition.role.provider,
      allowedPathPrefixes: definition.role.allowedPathPrefixes,
      mostRecentAgentHandoff: state.mostRecentAgentHandoff,
      mostRecentGateFailure: state.mostRecentGateFailure,
    }),
    timeoutMs: definition.provider.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
    outputMode: "provider",
    outputLogPath: join(
      context.trace.runDirectory,
      "provider",
      `${action.stepId}-${String(action.visit)}.log`,
    ),
  });
}

interface AfterInspection {
  readonly changedPaths: readonly string[];
  readonly blocker: Blocker | null;
}

async function inspectAfter(
  context: ControllerContext,
  action: Extract<ExecutableAction, { readonly type: "dispatch-agent" }>,
  role: Role,
  before: GitSnapshot,
): Promise<AfterInspection> {
  try {
    const changedPaths = await context.services.git.changedPathsSince(context.workspace.path, before);
    return {
      changedPaths,
      blocker: validateAgentPaths(
        action.stepId,
        changedPaths,
        role.allowedPathPrefixes,
        context.workspace.protectedPaths,
      ),
    };
  } catch (error) {
    return {
      changedPaths: [],
      blocker: createBlocker("git-inspection-failed", errorMessage(error), action.stepId),
    };
  }
}

async function appendAgentResult(
  context: ControllerContext,
  action: Extract<ExecutableAction, { readonly type: "dispatch-agent" }>,
  process: ProcessArtifact | null,
  changedPaths: readonly string[],
  blocker: Blocker | null,
): Promise<void> {
  await appendStepFinished(context.events, context.trace, context.runId, context.services, {
    stepId: action.stepId,
    stepType: "agent",
    visit: action.visit,
    outcome: blocker === null ? "completed" : "blocked",
    process,
    changedPaths,
    blocker,
  });
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
    return createBlocker(
      "agent-spawn-error",
      `Agent step '${stepId}' could not be launched.${providerLogHint(process)}`,
      stepId,
    );
  }
  if (process.kind === "timeout") {
    return createBlocker(
      "agent-timeout",
      `Agent step '${stepId}' timed out.${providerLogHint(process)}`,
      stepId,
    );
  }
  if (process.kind === "signal") {
    return agentSignalBlocker(stepId, process.signal, process);
  }
  if (process.exitCode !== 0) {
    return createBlocker(
      "agent-exit-nonzero",
      `Agent step '${stepId}' exited with status ${String(process.exitCode)}.${providerLogHint(process)}`,
      stepId,
    );
  }
  return null;
}

function agentSignalBlocker(stepId: string, signal: string | null, process: ProcessArtifact): Blocker {
  return createBlocker(
    "agent-signal",
    `Agent step '${stepId}' ended from signal '${signal ?? "unknown"}'.${providerLogHint(process)}`,
    stepId,
  );
}

function providerLogHint(process: ProcessArtifact): string {
  return process.logPath === undefined ? "" : ` Provider log: ${process.logPath}.`;
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
  stepType: "agent" | "gate" | "terminal",
  visit: number,
): Promise<void> {
  const event: StepStartedEvent = {
    ...baseEvent(events, runId, services),
    type: "step-started",
    stepId,
    stepType,
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
