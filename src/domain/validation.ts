import type { Configuration, WorkflowStep } from "./types.js";

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const WINDOWS_ABSOLUTE_PATTERN = /^[A-Za-z]:/;

export class ConfigurationValidationError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super(`Configuration validation failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
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

  for (const [stepId, step] of Object.entries(workflow.steps)) {
    validateId(stepId, `workflow.steps key '${stepId}'`, issues);
    validateStep(stepId, step, configuration, issues);
  }

  for (const [roleId, role] of Object.entries(configuration.roles)) {
    validateId(roleId, `roles key '${roleId}'`, issues);
    if (!(role.provider in configuration.providers)) {
      issues.push(`role '${roleId}' references unknown provider '${role.provider}'`);
    }
    if (!isSafeRelativePath(role.promptPath, false)) {
      issues.push(`role '${roleId}' has invalid promptPath '${role.promptPath}'`);
    }
    for (const prefix of role.allowedPathPrefixes) {
      if (!isSafeRelativePath(prefix, true)) {
        issues.push(`role '${roleId}' has invalid allowed path prefix '${prefix}'`);
      }
    }
  }

  for (const [providerId, provider] of Object.entries(configuration.providers)) {
    validateId(providerId, `providers key '${providerId}'`, issues);
    validateCommand(provider.executable, provider.args, provider.timeoutMs, `provider '${providerId}'`, issues);
  }

  for (const [profileId, profile] of Object.entries(configuration.profiles)) {
    validateId(profileId, `profiles key '${profileId}'`, issues);
    validateCommand(profile.executable, profile.args, profile.timeoutMs, `profile '${profileId}'`, issues);
  }

  if (workflow.entryStepId in workflow.steps) {
    validateReachability(configuration, stepIds, issues);
  }

  if (issues.length > 0) {
    throw new ConfigurationValidationError(issues);
  }
}

export function isSafeRelativePath(value: string, allowTrailingSlash: boolean): boolean {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    value.includes("\0") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    value.includes("\\") ||
    value.startsWith("/") ||
    WINDOWS_ABSOLUTE_PATTERN.test(value) ||
    value.includes("//")
  ) {
    return false;
  }

  const candidate = allowTrailingSlash && value.endsWith("/") ? value.slice(0, -1) : value;
  if (candidate.length === 0 || (!allowTrailingSlash && value.endsWith("/"))) {
    return false;
  }
  return candidate.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
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
    if (!(step.role in configuration.roles)) {
      issues.push(`agent step '${stepId}' references unknown role '${step.role}'`);
    }
    validateTransition(stepId, "onCompleted", step.onCompleted, configuration, issues);
    return;
  }

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
  const { workflow } = configuration;
  const reachable = new Set<string>();
  const pending = [workflow.entryStepId];
  while (pending.length > 0) {
    const stepId = pending.pop();
    if (stepId === undefined || reachable.has(stepId)) {
      continue;
    }
    reachable.add(stepId);
    const step = workflow.steps[stepId];
    if (step === undefined) {
      continue;
    }
    pending.push(...outgoingTargets(step));
  }

  for (const stepId of stepIds) {
    if (!reachable.has(stepId)) {
      issues.push(`workflow step '${stepId}' is unreachable from entry step '${workflow.entryStepId}'`);
    }
  }

  const canReachTerminal = new Set(
    stepIds.filter((stepId) => workflow.steps[stepId]?.type === "terminal"),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const stepId of stepIds) {
      const step = workflow.steps[stepId];
      if (
        step !== undefined &&
        !canReachTerminal.has(stepId) &&
        outgoingTargets(step).some((target) => canReachTerminal.has(target))
      ) {
        canReachTerminal.add(stepId);
        changed = true;
      }
    }
  }

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
  if (executable.length === 0 || executable !== executable.trim() || executable.includes("\0")) {
    issues.push(`${location} has invalid executable`);
  }
  args.forEach((argument, index) => {
    if (argument.length === 0 || argument.includes("\0")) {
      issues.push(`${location} has invalid argument at index ${String(index)}`);
    }
  });
  if (
    timeoutMs !== undefined &&
    (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 86_400_000)
  ) {
    issues.push(`${location} has invalid timeoutMs '${String(timeoutMs)}'`);
  }
}

function validateId(value: string, location: string, issues: string[]): void {
  if (!ID_PATTERN.test(value)) {
    issues.push(`${location} has invalid identifier '${value}'`);
  }
}
