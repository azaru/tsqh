import type { CommandProvider, Role, WorkflowStep } from "./types.js";

export const AGENT_SELECTION_PLACEHOLDERS = {
  model: "{model}",
  effort: "{effort}",
} as const;

export type AgentSelectionKey = keyof typeof AGENT_SELECTION_PLACEHOLDERS;

export interface ResolvedAgentSelection {
  readonly model: string | undefined;
  readonly effort: string | undefined;
}

type AgentStep = Extract<WorkflowStep, { readonly type: "agent" }>;

export function resolveAgentSelection(
  step: AgentStep,
  role: Role,
  provider: CommandProvider,
): ResolvedAgentSelection {
  return {
    model: step.model ?? role.model ?? provider.model,
    effort: step.effort ?? role.effort ?? provider.effort,
  };
}

export function renderAgentArguments(
  args: readonly string[],
  selection: ResolvedAgentSelection,
): readonly string[] {
  return args.map((argument) => renderArgument(argument, selection));
}

export function findArgumentPlaceholders(argument: string): readonly string[] {
  return argument.match(/\{[^{}]+\}/gu) ?? [];
}

function renderArgument(argument: string, selection: ResolvedAgentSelection): string {
  return replaceSelection(
    replaceSelection(argument, "model", selection.model),
    "effort",
    selection.effort,
  );
}

function replaceSelection(
  argument: string,
  key: AgentSelectionKey,
  value: string | undefined,
): string {
  const placeholder = AGENT_SELECTION_PLACEHOLDERS[key];
  if (!argument.includes(placeholder)) {
    return argument;
  }
  if (value === undefined) {
    throw new Error(`Provider argument placeholder '${placeholder}' has no resolved ${key} value.`);
  }
  return argument.replaceAll(placeholder, value);
}
