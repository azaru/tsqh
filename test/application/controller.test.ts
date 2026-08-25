import { access, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/main.js";
import { JsonlTraceStore } from "../../src/adapters/trace-store.js";
import { loadConfiguration } from "../../src/adapters/config-loader.js";
import { reduceTrace } from "../../src/domain/reducer.js";
import type { Configuration, StepFinishedEvent, WorkflowStep } from "../../src/domain/types.js";
import {
  createScenario,
  fakeCommandPath,
  placeConfigurationInWorkspace,
  readExecutionLog,
  runScenario,
} from "../helpers/scenario.js";

describe("foreground controller", () => {
  it("executes three logical roles and two native gates in exact configured order", async () => {
    const scenario = await createScenario({ steps: happySteps() });
    const result = await runScenario(scenario);

    expect(result.state.terminalState).toBe("passed");
    expect(await readExecutionLog(scenario)).toEqual([
      "agent:implement:1",
      "gate:quick",
      "agent:review:1",
      "gate:full",
      "agent:verify:1",
    ]);
    expect(stepStarts(result.events)).toEqual(["implement", "quick", "review", "full", "verify", "passed"]);
    const loaded = await loadConfiguration(scenario.configPath);
    const logicalRoles = ["implementer", "reviewer", "verifier"] as const;
    expect(new Set(logicalRoles.map((roleId) => loaded.configuration.roles[roleId]?.provider))).toEqual(
      new Set(["shared"]),
    );
    expect(new Set(logicalRoles.map((roleId) => loaded.configuration.roles[roleId]?.promptPath))).toHaveLength(3);
    expect(result.events.map((event) => event.sequence)).toEqual(
      result.events.map((_event, index) => index + 1),
    );

    const agentOutputs = result.events.filter(
      (event): event is StepFinishedEvent => event.type === "step-finished" && event.stepType === "agent",
    );
    expect(agentOutputs.every((event) => event.process?.stdout.includes('"nextStep":"passed"'))).toBe(true);
  });

  it("follows a failed gate to the configured repair role, retries, and continues", async () => {
    const scenario = await createScenario({
      steps: repairSteps(),
    });
    await rewriteProfilesForState(scenario, {
      quick: profile("gate-fail-once", scenario.stateDirectory, "quick"),
      full: profile("gate-pass", scenario.stateDirectory, "full"),
    });

    const result = await runScenario(scenario);
    expect(result.state.terminalState).toBe("passed");
    expect(await readExecutionLog(scenario)).toEqual([
      "agent:implement:1",
      "gate:quick",
      "agent:repair:1",
      "gate:quick",
      "agent:review:1",
      "gate:full",
    ]);
    const repairPrompt = await readFile(join(scenario.stateDirectory, "prompt-repair-1.txt"), "utf8");
    expect(repairPrompt).toContain("Most recent gate failure");
    expect(repairPrompt).toContain("simulated gate failure");
  });

  it("blocks on visit exhaustion without running downstream work", async () => {
    const scenario = await createScenario({ steps: exhaustionSteps() });
    await rewriteProfilesForState(scenario, {
      quick: profile("gate-always-fail", scenario.stateDirectory, "quick"),
    });
    const result = await runScenario(scenario);

    expect(result.state.terminalState).toBe("blocked");
    expect(result.state.blocker).toMatchObject({ code: "visit-limit-exceeded", stepId: "quick" });
    expect(await readExecutionLog(scenario)).toEqual([
      "agent:implement:1",
      "gate:quick",
      "agent:repair:1",
      "gate:quick",
      "agent:repair:2",
    ]);
    expect(stepStarts(result.events)).not.toContain("downstream");
  });

  it("blocks unauthorized agent changes", async () => {
    const scenario = await createScenario({
      steps: singleAgentSteps(),
      providerMode: "agent-unauthorized",
    });
    const result = await runScenario(scenario);
    expect(result.state.terminalState).toBe("blocked");
    expect(result.state.blocker).toMatchObject({ code: "unauthorized-changes", stepId: "implement" });
    expect(result.state.blocker?.message).toContain("workflow-policy.json");
  });

  it("protects the loaded workflow configuration even when a role allowlist names it", async () => {
    const initial = await createScenario({
      steps: singleAgentSteps(),
      providerMode: "agent-protected-config",
    });
    const scenario = await placeConfigurationInWorkspace(initial, (configuration) => {
      const roles = configuration.roles as Record<string, { allowedPathPrefixes: string[] }>;
      roles.implementer!.allowedPathPrefixes = ["workflow.json"];
    });
    const result = await runScenario(scenario);
    expect(result.state.blocker).toMatchObject({ code: "unauthorized-changes" });
    expect(result.state.blocker?.message).toContain("workflow.json");
  });

  it("requires an existing clean Git worktree before creating a trace", async () => {
    const scenario = await createScenario({ steps: singleAgentSteps() });
    await writeFile(join(scenario.workspace, "dirty.txt"), "dirty\n", "utf8");
    await expect(runScenario(scenario)).rejects.toThrow(/not clean/);
    await expect(access(scenario.runsRoot)).rejects.toThrow();
  });

  it("blocks nonzero agent exits", async () => {
    const scenario = await createScenario({ steps: singleAgentSteps(), providerMode: "agent-exit" });
    const result = await runScenario(scenario);
    expect(result.state.blocker).toMatchObject({ code: "agent-exit-nonzero" });
  });

  it("blocks spawn failures", async () => {
    const scenario = await createScenario({
      steps: singleAgentSteps(),
      providerExecutable: join(scenarioSafeRoot(), "missing-agent-executable"),
    });
    const result = await runScenario(scenario);
    expect(result.state.blocker).toMatchObject({ code: "agent-spawn-error" });
  });

  it("blocks agent timeouts", async () => {
    const scenario = await createScenario({
      steps: singleAgentSteps(),
      providerMode: "agent-timeout",
      providerTimeoutMs: 40,
    });
    const result = await runScenario(scenario);
    expect(result.state.blocker).toMatchObject({ code: "agent-timeout" });
  });

  it("blocks signal-terminated gates", async () => {
    const scenario = await createScenario({ steps: gateOnlySteps() });
    await rewriteProfilesForState(scenario, {
      quick: profile("gate-signal", scenario.stateDirectory, "quick"),
    });
    const result = await runScenario(scenario);
    expect(result.state.blocker).toMatchObject({ code: "gate-signal" });
  });

  it("uses native gate exit status even when output claims a pass", async () => {
    const scenario = await createScenario({ steps: exhaustionSteps() });
    await rewriteProfilesForState(scenario, {
      quick: profile("gate-always-fail", scenario.stateDirectory, "quick"),
    });
    const result = await runScenario(scenario);
    const failures = result.events.filter(
      (event): event is StepFinishedEvent => event.type === "step-finished" && event.stepType === "gate",
    );
    expect(failures.every((event) => event.outcome === "failed")).toBe(true);
    expect(failures[0]).toMatchObject({ process: { exitCode: 1 } });
    expect(failures[0]?.process?.stdout).toContain("passed");
  });

  it("keeps status read-only and reports the reduced trace", async () => {
    const scenario = await createScenario({ steps: happySteps() });
    const result = await runScenario(scenario);
    const tracePath = join(result.runDirectory, "events.jsonl");
    const beforeContent = await readFile(tracePath, "utf8");
    const beforeStat = await stat(tracePath);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli(["status", "--run", result.runDirectory, "--json"], {
      stdout: { write: (value) => { stdout.push(String(value)); return true; } },
      stderr: { write: (value) => { stderr.push(String(value)); return true; } },
    });
    const afterContent = await readFile(tracePath, "utf8");
    const afterStat = await stat(tracePath);

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ terminalState: "passed", currentStep: "passed" });
    expect(afterContent).toBe(beforeContent);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
    const events = await new JsonlTraceStore().read(result.runDirectory);
    expect(reduceTrace(events)).toEqual(result.state);
  });
});

function happySteps(): Readonly<Record<string, WorkflowStep>> {
  return {
    implement: { type: "agent", role: "implementer", maxVisits: 1, onCompleted: "quick" },
    quick: { type: "gate", profile: "quick", maxVisits: 1, onPassed: "review", onFailed: "passed" },
    review: { type: "agent", role: "reviewer", maxVisits: 1, onCompleted: "full" },
    full: { type: "gate", profile: "full", maxVisits: 1, onPassed: "verify", onFailed: "passed" },
    verify: { type: "agent", role: "verifier", maxVisits: 1, onCompleted: "passed" },
    passed: { type: "terminal", outcome: "passed" },
  };
}

function repairSteps(): Readonly<Record<string, WorkflowStep>> {
  return {
    implement: { type: "agent", role: "implementer", maxVisits: 1, onCompleted: "quick" },
    quick: { type: "gate", profile: "quick", maxVisits: 2, onPassed: "review", onFailed: "repair" },
    repair: { type: "agent", role: "repairer", maxVisits: 1, onCompleted: "quick" },
    review: { type: "agent", role: "reviewer", maxVisits: 1, onCompleted: "full" },
    full: { type: "gate", profile: "full", maxVisits: 1, onPassed: "passed", onFailed: "repair" },
    passed: { type: "terminal", outcome: "passed" },
  };
}

function exhaustionSteps(): Readonly<Record<string, WorkflowStep>> {
  return {
    implement: { type: "agent", role: "implementer", maxVisits: 1, onCompleted: "quick" },
    quick: { type: "gate", profile: "quick", maxVisits: 2, onPassed: "downstream", onFailed: "repair" },
    repair: { type: "agent", role: "repairer", maxVisits: 2, onCompleted: "quick" },
    downstream: { type: "agent", role: "reviewer", maxVisits: 1, onCompleted: "passed" },
    passed: { type: "terminal", outcome: "passed" },
  };
}

function singleAgentSteps(): Readonly<Record<string, WorkflowStep>> {
  return {
    implement: { type: "agent", role: "implementer", maxVisits: 1, onCompleted: "passed" },
    passed: { type: "terminal", outcome: "passed" },
  };
}

function gateOnlySteps(): Readonly<Record<string, WorkflowStep>> {
  return {
    quick: { type: "gate", profile: "quick", maxVisits: 1, onPassed: "passed", onFailed: "passed" },
    passed: { type: "terminal", outcome: "passed" },
  };
}

function profile(mode: string, stateDirectory: string, label: string): Configuration["profiles"][string] {
  return {
    executable: process.execPath,
    args: [fakeCommandPath, mode, stateDirectory, label],
    timeoutMs: 2_000,
  };
}

async function rewriteProfilesForState(
  scenario: Awaited<ReturnType<typeof createScenario>>,
  profiles: Configuration["profiles"],
): Promise<void> {
  const current = JSON.parse(await readFile(scenario.configPath, "utf8")) as Record<string, unknown>;
  current.profiles = profiles;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(scenario.configPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
}

function stepStarts(events: readonly import("../../src/domain/types.js").RunEvent[]): readonly string[] {
  return events.filter((event) => event.type === "step-started").map((event) => event.stepId);
}

function scenarioSafeRoot(): string {
  return "/definitely-not-present-tsqh-test";
}
