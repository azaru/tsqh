export type StepOutcome = "completed" | "passed" | "failed" | "blocked";
type TerminalState = "passed" | "blocked";

interface AgentStep {
  readonly type: "agent";
  readonly role: string;
  readonly maxVisits: number;
  readonly onCompleted: string;
}

interface GateStep {
  readonly type: "gate";
  readonly profile: string;
  readonly maxVisits: number;
  readonly onPassed: string;
  readonly onFailed: string;
}

interface TerminalStep {
  readonly type: "terminal";
  readonly outcome: TerminalState;
}

export type WorkflowStep = AgentStep | GateStep | TerminalStep;

interface Workflow {
  readonly id: string;
  readonly entryStepId: string;
  readonly steps: Readonly<Record<string, WorkflowStep>>;
}

export interface Role {
  readonly provider: string;
  readonly promptPath: string;
  readonly allowedPathPrefixes: readonly string[];
}

export interface CommandProvider {
  readonly type: "command";
  readonly executable: string;
  readonly args: readonly string[];
  readonly promptTransport: "stdin";
  readonly timeoutMs?: number;
}

export interface QualityProfile {
  readonly executable: string;
  readonly args: readonly string[];
  readonly environmentKeys?: readonly string[];
  readonly timeoutMs?: number;
}

export interface Configuration {
  readonly schemaVersion: 1;
  readonly workflow: Workflow;
  readonly roles: Readonly<Record<string, Role>>;
  readonly providers: Readonly<Record<string, CommandProvider>>;
  readonly profiles: Readonly<Record<string, QualityProfile>>;
}

export interface Blocker {
  readonly code: string;
  readonly message: string;
  readonly stepId: string | null;
}

export interface ProcessArtifact {
  readonly kind: "exited" | "spawn-error" | "timeout" | "signal";
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}

interface BaseEvent {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly runId: string;
  readonly occurredAt: string;
}

interface RunCreatedEvent extends BaseEvent {
  readonly type: "run-created";
  readonly workflowId: string;
  readonly entryStepId: string;
  readonly workspace: string;
}

export interface StepStartedEvent extends BaseEvent {
  readonly type: "step-started";
  readonly stepId: string;
  readonly stepType: WorkflowStep["type"];
  readonly visit: number;
}

export interface StepFinishedEvent extends BaseEvent {
  readonly type: "step-finished";
  readonly stepId: string;
  readonly stepType: WorkflowStep["type"];
  readonly visit: number;
  readonly outcome: StepOutcome;
  readonly process: ProcessArtifact | null;
  readonly changedPaths: readonly string[];
  readonly blocker: Blocker | null;
}

export interface RunFinishedEvent extends BaseEvent {
  readonly type: "run-finished";
  readonly terminalState: TerminalState;
  readonly blocker: Blocker | null;
}

export type RunEvent =
  | RunCreatedEvent
  | StepStartedEvent
  | StepFinishedEvent
  | RunFinishedEvent;

export interface LatestOutcome {
  readonly stepId: string;
  readonly stepType: WorkflowStep["type"];
  readonly visit: number;
  readonly outcome: StepOutcome;
  readonly blocker: Blocker | null;
}

export interface GateFailure {
  readonly stepId: string;
  readonly visit: number;
  readonly process: ProcessArtifact;
}

export interface RunState {
  readonly runId: string;
  readonly workflowId: string;
  readonly workspace: string;
  readonly phase: "ready" | "running" | "transition" | "finished";
  readonly currentStepId: string;
  readonly visitCounts: Readonly<Record<string, number>>;
  readonly latestOutcome: LatestOutcome | null;
  readonly mostRecentGateFailure: GateFailure | null;
  readonly terminalState: TerminalState | null;
  readonly blocker: Blocker | null;
}

export type PlannedAction =
  | {
      readonly type: "dispatch-agent";
      readonly stepId: string;
      readonly visit: number;
      readonly roleId: string;
    }
  | {
      readonly type: "run-native-profile";
      readonly stepId: string;
      readonly visit: number;
      readonly profileId: string;
    }
  | {
      readonly type: "enter-terminal";
      readonly stepId: string;
      readonly visit: number;
      readonly outcome: TerminalState;
    }
  | {
      readonly type: "finish";
      readonly terminalState: TerminalState;
      readonly blocker: Blocker | null;
    };
