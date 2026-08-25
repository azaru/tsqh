import type { GateFailure } from "../domain/types.js";

export interface AssignmentPromptInput {
  readonly rolePrompt: string;
  readonly task: string;
  readonly runId: string;
  readonly workflowId: string;
  readonly workspace: string;
  readonly stepId: string;
  readonly visit: number;
  readonly roleId: string;
  readonly providerId: string;
  readonly mostRecentGateFailure: GateFailure | null;
}

export function composeAssignmentPrompt(input: AssignmentPromptInput): string {
  const gateFailure =
    input.mostRecentGateFailure === null
      ? "None."
      : [
          `Step: ${input.mostRecentGateFailure.stepId}`,
          `Visit: ${String(input.mostRecentGateFailure.visit)}`,
          `Exit code: ${String(input.mostRecentGateFailure.process.exitCode)}`,
          "Standard output:",
          input.mostRecentGateFailure.process.stdout,
          "Standard error:",
          input.mostRecentGateFailure.process.stderr,
        ].join("\n");

  return [
    "# TSQH assignment",
    "",
    "## Stable role instructions",
    input.rolePrompt,
    "",
    "## Exact user task",
    input.task,
    "",
    "## Assignment identity",
    `Run: ${input.runId}`,
    `Workflow: ${input.workflowId}`,
    `Workspace: ${input.workspace}`,
    `Step: ${input.stepId}`,
    `Visit: ${String(input.visit)}`,
    `Logical role: ${input.roleId}`,
    `Provider: ${input.providerId}`,
    "",
    "## Most recent gate failure",
    gateFailure,
    "",
    "## Workflow authority",
    "Perform only this assignment. Report results through process output and exit status.",
    "The TSQH controller alone selects the next workflow step; do not request or choose a transition.",
    "",
  ].join("\n");
}
