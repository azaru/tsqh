#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

interface ParsedCommand {
  readonly command: "run" | "status";
  readonly options: Readonly<Record<string, string | true>>;
}

export async function runCli(
  argv: readonly string[],
  streams: CliStreams = { stdout: process.stdout, stderr: process.stderr },
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
  const command = argv[0];
  if (command !== "run" && command !== "status") {
    throw new Error(usage());
  }
  const allowed = command === "run" ? new Set(["config", "workspace", "task", "runs-root", "json"]) : new Set(["run", "json"]);
  const options: Record<string, string | true> = {};
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined || !argument.startsWith("--") || argument.length === 2) {
      throw new Error(`Unexpected positional argument '${argument ?? ""}'.\n${usage()}`);
    }
    const key = argument.slice(2);
    if (!allowed.has(key)) {
      throw new Error(`Unknown option '--${key}'.\n${usage()}`);
    }
    if (key in options) {
      throw new Error(`Option '--${key}' was provided more than once.`);
    }
    if (key === "json") {
      options[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Option '--${key}' requires a value.`);
    }
    options[key] = value;
    index += 1;
  }

  const required = command === "run" ? ["config", "workspace", "task"] : ["run"];
  for (const key of required) {
    requireStringOption(options, key);
  }
  return { command, options };
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
  output.write(
    [
      `Run: ${report.runId}`,
      `State: ${report.terminalState ?? state.phase}`,
      `Current step: ${report.currentStep}`,
      `Visits: ${JSON.stringify(report.visitCounts)}`,
      `Latest outcome: ${report.latestOutcome?.outcome ?? "none"}`,
      `Blocker: ${report.blocker === null ? "none" : `${report.blocker.code}: ${report.blocker.message}`}`,
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

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
