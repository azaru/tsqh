import { access, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/main.js";
import type { WorkflowStep } from "../../src/domain/types.js";
import { createScenario } from "../helpers/scenario.js";

describe("CLI acceptance", () => {
  it("runs a validated workflow and renders machine-readable status", async () => {
    const steps: Readonly<Record<string, WorkflowStep>> = {
      implement: { type: "agent", role: "implementer", maxVisits: 1, onCompleted: "passed" },
      passed: { type: "terminal", outcome: "passed" },
    };
    const scenario = await createScenario({ steps });
    const output: string[] = [];
    const errors: string[] = [];
    const exitCode = await runCli(
      [
        "run",
        "--config",
        scenario.configPath,
        "--workspace",
        scenario.workspace,
        "--task",
        scenario.taskPath,
        "--runs-root",
        scenario.runsRoot,
        "--json",
      ],
      {
        stdout: { write: (value) => { output.push(String(value)); return true; } },
        stderr: { write: (value) => { errors.push(String(value)); return true; } },
      },
    );
    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    const report = JSON.parse(output.join("")) as Record<string, unknown>;
    expect(report).toMatchObject({ terminalState: "passed", currentStep: "passed" });
    expect(String(report.runDirectory)).toMatch(
      new RegExp(`^${escapeRegex(scenario.runsRoot)}/`, "u"),
    );

    const human: string[] = [];
    const statusCode = await runCli(["status", "--run", String(report.runDirectory)], {
      stdout: { write: (value) => { human.push(String(value)); return true; } },
      stderr: { write: () => true },
    });
    expect(statusCode).toBe(0);
    expect(human.join("")).toBe([
      `Run: ${String(report.runId)}`,
      "State: passed",
      "Current step: passed",
      "Visits: {\"implement\":1,\"passed\":1}",
      "Latest outcome: passed",
      "Blocker: none",
      `Run directory: ${String(report.runDirectory)}`,
      "",
    ].join("\n"));
  });

  it("uses the default runs root and returns one for a configured blocked run and status", async () => {
    const scenario = await createScenario({
      steps: { stop: { type: "terminal", outcome: "blocked" } },
    });
    const output: string[] = [];
    const exitCode = await runCli(
      [
        "run",
        "--config",
        scenario.configPath,
        "--workspace",
        scenario.workspace,
        "--task",
        scenario.taskPath,
      ],
      {
        stdout: { write: (value) => { output.push(String(value)); return true; } },
        stderr: { write: () => true },
      },
    );

    const runDirectory = output.join("").match(/^Run directory: (.+)$/mu)?.[1];
    expect(exitCode).toBe(1);
    expect(runDirectory).toMatch(new RegExp(`^${escapeRegex(join(tmpdir(), "tsqh-runs"))}/`, "u"));
    expect(output.join("")).toContain(
      "Blocker: configured-terminal-blocked: Terminal step 'stop' blocks the run.",
    );

    const statusOutput: string[] = [];
    const statusCode = await runCli(["status", "--run", runDirectory!, "--json"], {
      stdout: { write: (value) => { statusOutput.push(String(value)); return true; } },
      stderr: { write: () => true },
    });
    expect(statusCode).toBe(1);
    expect(JSON.parse(statusOutput.join(""))).toMatchObject({
      terminalState: "blocked",
      blocker: { code: "configured-terminal-blocked", stepId: "stop" },
    });
  });

  it("rejects invalid configuration before Git or trace side effects", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-cli-invalid-"));
    const configRoot = join(root, "configuration");
    const configPath = join(configRoot, "workflow.json");
    const taskPath = join(root, "task.md");
    const runsRoot = join(root, "runs-that-must-not-exist");
    await mkdir(configRoot);
    await writeFile(configPath, '{"schemaVersion":1,"unknown":true}\n', "utf8");
    await writeFile(taskPath, "task\n", "utf8");
    const errors: string[] = [];

    const exitCode = await runCli(
      [
        "run",
        "--config",
        configPath,
        "--workspace",
        join(root, "workspace-that-does-not-exist"),
        "--task",
        taskPath,
        "--runs-root",
        runsRoot,
      ],
      {
        stdout: { write: () => true },
        stderr: { write: (value) => { errors.push(String(value)); return true; } },
      },
    );

    expect(exitCode).toBe(2);
    expect(errors.join("")) .toContain("Configuration schema validation failed");
    await expect(access(runsRoot)).rejects.toThrow();
  });

  it.each([
    [[], usage()],
    [["unknown"], usage()],
    [["status", "run"], `Unexpected positional argument 'run'.\n${usage()}`],
    [["status", "--"], `Unexpected positional argument '--'.\n${usage()}`],
    [["status", "--run"], "Option '--run' requires a value."],
    [["status", "--run", "--json"], "Option '--run' requires a value."],
    [["status", "--run", ""], `Missing required option '--run'.\n${usage()}`],
    [["status", "--run", "one", "--run", "two"], "Option '--run' was provided more than once."],
    [["status", "--wat"], `Unknown option '--wat'.\n${usage()}`],
    [["run", "--json"], `Missing required option '--config'.\n${usage()}`],
    [["status", "--json"], `Missing required option '--run'.\n${usage()}`],
    [["run", "--run", "value"], `Unknown option '--run'.\n${usage()}`],
    [["status", "--config", "value"], `Unknown option '--config'.\n${usage()}`],
  ] as const)("rejects malformed arguments %#", async (argv, message) => {
    const errors: string[] = [];
    const exitCode = await runCli(argv, {
      stdout: { write: () => true },
      stderr: { write: (value) => { errors.push(String(value)); return true; } },
    });

    expect(exitCode).toBe(2);
    expect(errors.join("")).toBe(`TSQH error: ${message}\n`);
  });
});

function usage(): string {
  return [
    "Usage:",
    "  tsqh run --config <file> --workspace <clean-git-worktree> --task <file> [--runs-root <directory>] [--json]",
    "  tsqh status --run <run-directory> [--json]",
  ].join("\n");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
