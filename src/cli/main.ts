#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runController } from "../application/controller.js";
import { SpawnCommandRunner } from "../adapters/command-runner.js";
import { loadConfiguration, loadTask } from "../adapters/config-loader.js";
import { LocalGitInspector } from "../adapters/git-inspector.js";
import { JsonlTraceStore } from "../adapters/trace-store.js";
import { reduceTrace } from "../domain/reducer.js";
import type { Blocker, LatestOutcome, RunState } from "../domain/types.js";

interface CliStreams {
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

const PROCESS_STREAMS: CliStreams = { stdout: process.stdout, stderr: process.stderr };

interface ParsedCommand {
  readonly command: "run" | "status";
  readonly options: Readonly<Record<string, string | true>>;
}

export async function runCli(
  argv: readonly string[],
  streams: CliStreams = PROCESS_STREAMS,
): Promise<number> {
  try {
    const parsed = parseArguments(argv);
    const traces = new JsonlTraceStore();
    if (parsed.command === "status") {
      const runDirectory = requireStringOption(parsed.options, "run");
      const events = await traces.read(runDirectory);
      const state = reduceTrace(events);
      renderStatus(state, resolve(runDirectory), parsed.options.json === true, streams.stdout);
      return state.terminalState === "blocked" ? 1 : 0;
    }

    const configInput = requireStringOption(parsed.options, "config");
    const workspaceInput = requireStringOption(parsed.options, "workspace");
    const taskInput = requireStringOption(parsed.options, "task");
    const loaded = await loadConfiguration(configInput);
    const task = await loadTask(taskInput);
    const runsRootOption = parsed.options["runs-root"];
    const runsRoot =
      typeof runsRootOption === "string" ? resolve(runsRootOption) : join(tmpdir(), "tsqh-runs");
    const result = await runController(
      {
        configuration: loaded.configuration,
        prompts: loaded.prompts,
        configPath: loaded.configPath,
        promptPaths: loaded.promptPaths,
        workspacePath: workspaceInput,
        task: task.content,
        taskPath: task.path,
        runsRoot,
      },
      {
        commandRunner: new SpawnCommandRunner(),
        git: new LocalGitInspector(),
        traces,
        createRunId: () => randomUUID(),
        now: () => new Date().toISOString(),
      },
    );
    renderStatus(result.state, result.runDirectory, parsed.options.json === true, streams.stdout);
    return result.state.terminalState === "passed" ? 0 : 1;
  } catch (error) {
    streams.stderr.write(`TSQH error: ${errorMessage(error)}\n`);
    return 2;
  }
}

function parseArguments(argv: readonly string[]): ParsedCommand {
  const command = requireCommand(argv[0]);
  const allowed = allowedOptions(command);
  const options: Record<string, string | true> = {};
  for (let index = 1; index < argv.length; index += 1) {
    const key = requireOptionName(argv[index]!, allowed);
    if (key in options) {
      throw new Error(`Option '--${key}' was provided more than once.`);
    }
    if (key === "json") {
      options[key] = true;
      continue;
    }
    options[key] = requireOptionValue(argv[index + 1], key);
    index += 1;
  }

  return { command, options };
}

function requireCommand(value: string | undefined): ParsedCommand["command"] {
  if (value !== "run" && value !== "status") {
    throw new Error(usage());
  }
  return value;
}

function allowedOptions(command: ParsedCommand["command"]): ReadonlySet<string> {
  return new Set(command === "run"
    ? ["config", "workspace", "task", "runs-root", "json"]
    : ["run", "json"]);
}

function requireOptionName(value: string, allowed: ReadonlySet<string>): string {
  const key = parseOptionName(value);
  if (!allowed.has(key)) {
    throw new Error(`Unknown option '--${key}'.\n${usage()}`);
  }
  return key;
}

function parseOptionName(value: string): string {
  if (!value.startsWith("--") || value.length === 2) {
    throw new Error(`Unexpected positional argument '${value}'.\n${usage()}`);
  }
  return value.slice(2);
}

function requireOptionValue(value: string | undefined, key: string): string {
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Option '--${key}' requires a value.`);
  }
  return value;
}

function requireStringOption(options: Readonly<Record<string, string | true>>, key: string): string {
  const value = options[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option '--${key}'.\n${usage()}`);
  }
  return value;
}

function renderStatus(
  state: RunState,
  runDirectory: string,
  json: boolean,
  output: Pick<NodeJS.WriteStream, "write">,
): void {
  const report = {
    runId: state.runId,
    runDirectory,
    workflowId: state.workflowId,
    workspace: state.workspace,
    currentStep: state.currentStepId,
    visitCounts: state.visitCounts,
    latestOutcome: state.latestOutcome,
    terminalState: state.terminalState,
    blocker: state.blocker,
  } satisfies {
    runId: string;
    runDirectory: string;
    workflowId: string;
    workspace: string;
    currentStep: string;
    visitCounts: Readonly<Record<string, number>>;
    latestOutcome: LatestOutcome | null;
    terminalState: "passed" | "blocked" | null;
    blocker: Blocker | null;
  };
  if (json) {
    output.write(`${JSON.stringify(report)}\n`);
    return;
  }
  const blocker = report.blocker === null
    ? "none"
    : `${report.blocker.code}: ${report.blocker.message}`;
  output.write(
    [
      `Run: ${report.runId}`,
      `State: ${report.terminalState ?? state.phase}`,
      `Current step: ${report.currentStep}`,
      `Visits: ${JSON.stringify(report.visitCounts)}`,
      `Latest outcome: ${report.latestOutcome!.outcome}`,
      `Blocker: ${blocker}`,
      `Run directory: ${report.runDirectory}`,
      "",
    ].join("\n"),
  );
}

function usage(): string {
  return [
    "Usage:",
    "  tsqh run --config <file> --workspace <clean-git-worktree> --task <file> [--runs-root <directory>] [--json]",
    "  tsqh status --run <run-directory> [--json]",
  ].join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
