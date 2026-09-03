import {
  AGENT_SELECTION_PLACEHOLDERS,
  findArgumentPlaceholders,
  resolveAgentSelection,
  type AgentSelectionKey,
} from "./agent-selection.js";
import type { CommandProvider, Configuration, WorkflowStep } from "./types.js";

const AGENT_SELECTION_KEYS = ["model", "effort"] as const satisfies readonly AgentSelectionKey[];

export class ConfigurationValidationError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super(["Configuration validation failed:", ...issues.map((issue) => `- ${issue}`)].join("\n"));
    this.name = "ConfigurationValidationError";
    this.issues = issues;
  }
}

export function validateConfigurationGraph(configuration: Configuration): void {
  const issues: string[] = [];
  const { workflow } = configuration;
  const stepIds = Object.keys(workflow.steps);

  validateId(workflow.id, "workflow.id", issues);
  validateId(workflow.entryStepId, "workflow.entryStepId", issues);
  if (!(workflow.entryStepId in workflow.steps)) {
    issues.push(`workflow.entryStepId references unknown step '${workflow.entryStepId}'`);
  }

  validateSteps(configuration, issues);
  validateRoles(configuration, issues);
  validateProviders(configuration, issues);
  validateProfiles(configuration, issues);

  if (issues.length === 0) {
    validateReachability(configuration, stepIds, issues);
  }

  if (issues.length > 0) {
    throw new ConfigurationValidationError(issues);
  }
}

export function isSafeRelativePath(value: string, allowTrailingSlash: boolean): boolean {
  if (hasInvalidPathText(value)) {
    return false;
  }
  if (!allowTrailingSlash && value.endsWith("/")) {
    return false;
  }
  return value.split("/").every((segment) => segment !== "." && segment !== "..");
}

export function isSafeRelativeFilePath(value: string): boolean {
  return isSafeRelativePath(value, false);
}

function hasInvalidPathText(value: string): boolean {
  return hasInvalidCharacters(value) || hasInvalidSeparators(value);
}

function hasInvalidCharacters(value: string): boolean {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    value.includes("\0") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return true;
  }
  return false;
}

function hasInvalidSeparators(value: string): boolean {
  return value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("//");
}

function validateSteps(configuration: Configuration, issues: string[]): void {
  for (const [stepId, step] of Object.entries(configuration.workflow.steps)) {
    validateId(stepId, `workflow.steps key '${stepId}'`, issues);
    validateStep(stepId, step, configuration, issues);
  }
}

function validateRoles(configuration: Configuration, issues: string[]): void {
  for (const [roleId, role] of Object.entries(configuration.roles)) {
    validateId(roleId, `roles key '${roleId}'`, issues);
    if (!(role.provider in configuration.providers)) {
      issues.push(`role '${roleId}' references unknown provider '${role.provider}'`);
    }
    validateAgentSelection(role, `role '${roleId}'`, issues);
    if (!isSafeRelativeFilePath(role.promptPath)) {
      issues.push(`role '${roleId}' has invalid promptPath '${role.promptPath}'`);
    }
    for (const prefix of role.allowedPathPrefixes) {
      if (!isSafeRelativePath(prefix, true)) {
        issues.push(`role '${roleId}' has invalid allowed path prefix '${prefix}'`);
      }
    }
  }
}

function validateProviders(configuration: Configuration, issues: string[]): void {
  for (const [providerId, provider] of Object.entries(configuration.providers)) {
    validateId(providerId, `providers key '${providerId}'`, issues);
    validateCommand(provider.executable, provider.args, provider.timeoutMs, `provider '${providerId}'`, issues);
    validateAgentSelection(provider, `provider '${providerId}'`, issues);
    validateProviderPlaceholders(providerId, provider, issues);
  }
}

function validateProfiles(configuration: Configuration, issues: string[]): void {
  for (const [profileId, profile] of Object.entries(configuration.profiles)) {
    validateId(profileId, `profiles key '${profileId}'`, issues);
    validateCommand(profile.executable, profile.args, profile.timeoutMs, `profile '${profileId}'`, issues);
    for (const key of profile.environmentKeys ?? []) {
      if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(key)) {
        issues.push(`profile '${profileId}' has invalid environment key '${key}'`);
      }
    }
  }
}

function validateStep(
  stepId: string,
  step: WorkflowStep,
  configuration: Configuration,
  issues: string[],
): void {
  if (step.type === "terminal") {
    return;
  }

  if (!Number.isSafeInteger(step.maxVisits) || step.maxVisits <= 0) {
    issues.push(`step '${stepId}' has invalid maxVisits '${String(step.maxVisits)}'`);
  }

  if (step.type === "agent") {
    validateAgentStep(stepId, step, configuration, issues);
    return;
  }

  validateGateStep(stepId, step, configuration, issues);
}

function validateAgentStep(
  stepId: string,
  step: Extract<WorkflowStep, { readonly type: "agent" }>,
  configuration: Configuration,
  issues: string[],
): void {
  validateAgentSelection(step, `agent step '${stepId}'`, issues);
  if (!(step.role in configuration.roles)) {
    issues.push(`agent step '${stepId}' references unknown role '${step.role}'`);
  } else {
    validateAgentStepSelection(stepId, step, configuration, issues);
  }
  validateTransition(stepId, "onCompleted", step.onCompleted, configuration, issues);
}

function validateAgentStepSelection(
  stepId: string,
  step: Extract<WorkflowStep, { readonly type: "agent" }>,
  configuration: Configuration,
  issues: string[],
): void {
  const role = configuration.roles[step.role]!;
  if (!(role.provider in configuration.providers)) {
    return;
  }
  const provider = configuration.providers[role.provider]!;
  const selection = resolveAgentSelection(step, role, provider);
  const placeholders = provider.args.flatMap(findArgumentPlaceholders);
  for (const key of AGENT_SELECTION_KEYS) {
    validateResolvedSelection(
      stepId,
      role.provider,
      key,
      selection[key],
      placeholders,
      issues,
    );
  }
}

function validateResolvedSelection(
  stepId: string,
  providerId: string,
  key: AgentSelectionKey,
  value: string | undefined,
  placeholders: readonly string[],
  issues: string[],
): void {
  const placeholder = AGENT_SELECTION_PLACEHOLDERS[key];
  const hasPlaceholder = placeholders.includes(placeholder);
  if (value === undefined && hasPlaceholder) {
    issues.push(
      `agent step '${stepId}' cannot resolve ${key} required by provider '${providerId}' placeholder '${placeholder}'`,
    );
  } else if (value !== undefined && !hasPlaceholder) {
    issues.push(
      `agent step '${stepId}' resolves ${key} '${value}' but provider '${providerId}' has no '${placeholder}' placeholder`,
    );
  }
}

function validateAgentSelection(
  selection: { readonly model?: string; readonly effort?: string },
  location: string,
  issues: string[],
): void {
  for (const key of AGENT_SELECTION_KEYS) {
    const value = selection[key];
    if (value !== undefined && !isValidAgentSelection(value)) {
      issues.push(`${location} has invalid ${key} '${value}'`);
    }
  }
}

function isValidAgentSelection(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u.test(value);
}

function validateProviderPlaceholders(
  providerId: string,
  provider: CommandProvider,
  issues: string[],
): void {
  const placeholders = provider.args.flatMap(findArgumentPlaceholders);
  for (const placeholder of new Set(placeholders)) {
    if (!Object.values(AGENT_SELECTION_PLACEHOLDERS).includes(
      placeholder as (typeof AGENT_SELECTION_PLACEHOLDERS)[AgentSelectionKey],
    )) {
      issues.push(`provider '${providerId}' has unsupported argument placeholder '${placeholder}'`);
    }
  }
  for (const key of AGENT_SELECTION_KEYS) {
    const placeholder = AGENT_SELECTION_PLACEHOLDERS[key];
    if (placeholders.filter((value) => value === placeholder).length > 1) {
      issues.push(`provider '${providerId}' has duplicate '${placeholder}' placeholders`);
    }
  }
}

function validateGateStep(
  stepId: string,
  step: Extract<WorkflowStep, { readonly type: "gate" }>,
  configuration: Configuration,
  issues: string[],
): void {
  if (!(step.profile in configuration.profiles)) {
    issues.push(`gate step '${stepId}' references unknown profile '${step.profile}'`);
  }
  validateTransition(stepId, "onPassed", step.onPassed, configuration, issues);
  validateTransition(stepId, "onFailed", step.onFailed, configuration, issues);
}

function validateTransition(
  stepId: string,
  edge: string,
  target: string,
  configuration: Configuration,
  issues: string[],
): void {
  validateId(target, `step '${stepId}' ${edge}`, issues);
  if (!(target in configuration.workflow.steps)) {
    issues.push(`step '${stepId}' ${edge} references unknown step '${target}'`);
  }
}

function validateReachability(configuration: Configuration, stepIds: readonly string[], issues: string[]): void {
  const reachable = reachableSteps(configuration);
  reportUnreachableSteps(configuration, stepIds, reachable, issues);
  const canReachTerminal = stepsReachingTerminal(configuration, stepIds);
  reportNonterminalPaths(reachable, canReachTerminal, issues);
}

function reachableSteps(configuration: Configuration): ReadonlySet<string> {
  const { workflow } = configuration;
  const stepIds = Object.keys(workflow.steps);
  const reachable = new Set([workflow.entryStepId]);
  stepIds.forEach(() => {
    stepIds
      .filter((stepId) => reachable.has(stepId))
      .flatMap((stepId) => outgoingTargets(workflow.steps[stepId]!))
      .forEach((stepId) => reachable.add(stepId));
  });

  return reachable;
}

function reportUnreachableSteps(
  configuration: Configuration,
  stepIds: readonly string[],
  reachable: ReadonlySet<string>,
  issues: string[],
): void {
  for (const stepId of stepIds) {
    if (!reachable.has(stepId)) {
      issues.push(`workflow step '${stepId}' is unreachable from entry step '${configuration.workflow.entryStepId}'`);
    }
  }
}

function stepsReachingTerminal(
  configuration: Configuration,
  stepIds: readonly string[],
): ReadonlySet<string> {
  const { workflow } = configuration;
  const canReachTerminal = new Set(
    stepIds.filter((stepId) => workflow.steps[stepId]?.type === "terminal"),
  );
  stepIds.forEach(() => {
    stepIds
      .filter((stepId) => outgoingTargets(workflow.steps[stepId]!).some(
        (target) => canReachTerminal.has(target),
      ))
      .forEach((stepId) => canReachTerminal.add(stepId));
  });
  return canReachTerminal;
}

function reportNonterminalPaths(
  reachable: ReadonlySet<string>,
  canReachTerminal: ReadonlySet<string>,
  issues: string[],
): void {
  for (const stepId of reachable) {
    if (!canReachTerminal.has(stepId)) {
      issues.push(`workflow step '${stepId}' has no path to terminal behavior`);
    }
  }
}

function outgoingTargets(step: WorkflowStep): readonly string[] {
  if (step.type === "agent") {
    return [step.onCompleted];
  }
  if (step.type === "gate") {
    return [step.onPassed, step.onFailed];
  }
  return [];
}

function validateCommand(
  executable: string,
  args: readonly string[],
  timeoutMs: number | undefined,
  location: string,
  issues: string[],
): void {
  validateExecutable(executable, location, issues);
  validateArguments(args, location, issues);
  validateTimeout(timeoutMs, location, issues);
}

function validateExecutable(executable: string, location: string, issues: string[]): void {
  if (executable.length === 0 || executable !== executable.trim() || executable.includes("\0")) {
    issues.push(`${location} has invalid executable`);
  }
}

function validateArguments(args: readonly string[], location: string, issues: string[]): void {
  args.forEach((argument, index) => {
    if (argument.length === 0 || argument.includes("\0")) {
      issues.push(`${location} has invalid argument at index ${String(index)}`);
    }
  });
}

function validateTimeout(timeoutMs: number | undefined, location: string, issues: string[]): void {
  if (
    timeoutMs !== undefined &&
    (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 86_400_000)
  ) {
    issues.push(`${location} has invalid timeoutMs '${String(timeoutMs)}'`);
  }
}

function validateId(value: string, location: string, issues: string[]): void {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)) {
    issues.push(`${location} has invalid identifier '${value}'`);
  }
}
