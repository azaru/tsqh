import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfiguration, loadTask } from "../../src/adapters/config-loader.js";
import { runController } from "../../src/application/controller.js";
import { JsonlTraceStore } from "../../src/adapters/trace-store.js";
import { LocalGitInspector } from "../../src/adapters/git-inspector.js";
import { SpawnCommandRunner } from "../../src/adapters/command-runner.js";
import { createScenario } from "../helpers/scenario.js";

describe("task acceptance controller gate", () => {
  it("runs after quick and reaches passed only with complete tagged coverage", async () => {
    const scenario = await createScenario({
      entryStepId: "tester",
      providerMode: "agent-acceptance",
      steps: {
        tester: { type: "agent", role: "tester", maxVisits: 1, onCompleted: "quick" },
        quick: { type: "gate", profile: "quick", maxVisits: 1, onPassed: "acceptance", onFailed: "passed" },
        acceptance: {
          type: "gate",
          profile: "task-acceptance",
          maxVisits: 1,
          onPassed: "passed",
          onFailed: "passed",
        },
        passed: { type: "terminal", outcome: "passed" },
      },
      roles: {
        tester: {
          provider: "shared",
          promptPath: "prompts/tester.md",
          allowedPathPrefixes: ["src/", "test/"],
        },
      },
    });
    await writeFile(scenario.taskPath, "## Acceptance\n\n- AC-1: The tagged behavior passes.\n", "utf8");
    const configuration = JSON.parse(await readFile(scenario.configPath, "utf8")) as {
      profiles: Record<string, unknown>;
    };
    configuration.profiles["task-acceptance"] = { type: "task-acceptance" };
    await writeFile(scenario.configPath, `${JSON.stringify(configuration, null, 2)}\n`, "utf8");

    const loaded = await loadConfiguration(scenario.configPath);
    const task = await loadTask(scenario.taskPath);
    const result = await runController(
      {
        configuration: loaded.configuration,
        prompts: loaded.prompts,
        configPath: loaded.configPath,
        promptPaths: loaded.promptPaths,
        workspacePath: scenario.workspace,
        task: task.content,
        taskPath: task.path,
        runsRoot: scenario.runsRoot,
      },
      {
        commandRunner: new SpawnCommandRunner(),
        git: new LocalGitInspector(),
        traces: new JsonlTraceStore(),
        createRunId: () => "acceptance-controller-run",
        now: (() => {
          let second = 0;
          return () => "2026-01-01T00:00:" + String(second++).padStart(2, "0") + ".000Z";
        })(),
      },
    );

    expect(result.state.terminalState).toBe("passed");
    expect(result.events.filter((event) => event.type === "step-started").map((event) => event.stepId))
      .toEqual(["tester", "quick", "acceptance", "passed"]);
    await expect(access(join(result.runDirectory, "task-acceptance.json"))).resolves.toBeUndefined();
    await expect(readFile(join(result.runDirectory, "task-acceptance.json"), "utf8"))
      .resolves.toContain('"status": "passed"');
  });

  it("returns an acceptance failure to the tester instead of passing by inference", async () => {
    const scenario = await createScenario({
      entryStepId: "tester",
      steps: {
        tester: { type: "agent", role: "tester", maxVisits: 2, onCompleted: "quick" },
        quick: { type: "gate", profile: "quick", maxVisits: 2, onPassed: "acceptance", onFailed: "passed" },
        acceptance: {
          type: "gate",
          profile: "task-acceptance",
          maxVisits: 2,
          onPassed: "passed",
          onFailed: "tester",
        },
        passed: { type: "terminal", outcome: "passed" },
      },
      roles: {
        tester: {
          provider: "shared",
          promptPath: "prompts/tester.md",
          allowedPathPrefixes: ["src/"],
        },
      },
    });
    await writeFile(scenario.taskPath, "## Acceptance\n\n- AC-1: Missing tagged behavior.\n", "utf8");
    const configuration = JSON.parse(await readFile(scenario.configPath, "utf8")) as {
      profiles: Record<string, unknown>;
    };
    configuration.profiles["task-acceptance"] = { type: "task-acceptance" };
    await writeFile(scenario.configPath, JSON.stringify(configuration, null, 2) + "\n", "utf8");

    const loaded = await loadConfiguration(scenario.configPath);
    const task = await loadTask(scenario.taskPath);
    const result = await runController(
      {
        configuration: loaded.configuration,
        prompts: loaded.prompts,
        configPath: loaded.configPath,
        promptPaths: loaded.promptPaths,
        workspacePath: scenario.workspace,
        task: task.content,
        taskPath: task.path,
        runsRoot: scenario.runsRoot,
      },
      {
        commandRunner: new SpawnCommandRunner(),
        git: new LocalGitInspector(),
        traces: new JsonlTraceStore(),
        createRunId: () => "acceptance-failure-run",
        now: (() => {
          let second = 0;
          return () => "2026-01-01T00:00:" + String(second++).padStart(2, "0") + ".000Z";
        })(),
      },
    );

    expect(result.state.terminalState).toBe("blocked");
    expect(result.state.blocker).toMatchObject({ code: "visit-limit-exceeded" });
    expect(result.events.filter((event) => event.type === "step-started").map((event) => event.stepId))
      .toEqual(["tester", "quick", "acceptance", "tester", "quick", "acceptance"]);
    const acceptanceFailures = result.events.filter(
      (event) => event.type === "step-finished" && event.stepId === "acceptance",
    );
    expect(acceptanceFailures).toHaveLength(2);
  });
});
