import type { ProcessArtifact, RunEvent } from "../domain/types.js";

export interface CommandRequest {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly stdin: string | null;
  readonly timeoutMs: number;
}

export interface CommandRunner {
  run(request: CommandRequest): Promise<ProcessArtifact>;
}

export interface GitSnapshot {
  readonly fingerprints: Readonly<Record<string, string>>;
}

export interface CleanWorkspace {
  readonly path: string;
  readonly protectedPaths: readonly string[];
}

export interface GitInspector {
  openCleanWorkspace(workspacePath: string, protectedAbsolutePaths: readonly string[]): Promise<CleanWorkspace>;
  snapshot(workspacePath: string): Promise<GitSnapshot>;
  changedPathsSince(workspacePath: string, before: GitSnapshot): Promise<readonly string[]>;
}

export interface TraceWriter {
  readonly runDirectory: string;
  append(event: RunEvent): Promise<void>;
}

export interface TraceStore {
  create(runsRoot: string, runId: string): Promise<TraceWriter>;
  read(runDirectory: string): Promise<readonly RunEvent[]>;
}

export interface RuntimeServices {
  readonly commandRunner: CommandRunner;
  readonly git: GitInspector;
  readonly traces: TraceStore;
  createRunId(): string;
  now(): string;
}
