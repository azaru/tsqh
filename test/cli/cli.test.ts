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
    expect(JSON.parse(output.join(""))).toMatchObject({ terminalState: "passed", currentStep: "passed" });
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

  it("rejects unknown and duplicate options", async () => {
    const errors: string[] = [];
    const streams = {
      stdout: { write: () => true },
      stderr: { write: (value: string | Uint8Array) => { errors.push(String(value)); return true; } },
    };
    expect(await runCli(["status", "--run", "one", "--run", "two"], streams)).toBe(2);
    expect(await runCli(["status", "--wat"], streams)).toBe(2);
    expect(errors.join("")) .toMatch(/more than once|Unknown option/);
  });
});
