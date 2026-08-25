import { access, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runController, type ControllerInput } from "../../src/application/controller.js";
import { runCli } from "../../src/cli/main.js";
import { JsonlTraceStore } from "../../src/adapters/trace-store.js";
import { loadConfiguration } from "../../src/adapters/config-loader.js";
import { reduceTrace } from "../../src/domain/reducer.js";
import type { CommandRequest, RuntimeServices } from "../../src/application/ports.js";
import type {
  Configuration,
  ProcessArtifact,
  RunEvent,
  StepFinishedEvent,
  WorkflowStep,
} from "../../src/domain/types.js";
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
    const implementerPrompt = await readFile(
      join(scenario.stateDirectory, "prompt-implement-1.txt"),
      "utf8",
    );
    expect(implementerPrompt).toContain("## Allowed path prefixes\n- src/");
    expect(implementerPrompt).toContain(
      "These prefixes are the complete write authority for this assignment.",
    );
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

  it("runs every hardening gate in configured order", async () => {
    const scenario = await createScenario({
      steps: hardeningSteps(1, 1),
      profiles: hardeningProfiles("gate-pass", "pending"),
    });
    await rewriteProfilesForState(scenario, hardeningProfiles("gate-pass", scenario.stateDirectory));

    const result = await runScenario(scenario);

    expect(result.state.terminalState).toBe("passed");
    expect(await readExecutionLog(scenario)).toEqual([
      "agent:implement:1",
      ...hardeningGateIds.map((gate) => `gate:${gate}`),
    ]);
  });

  it("reruns the complete hardening chain from quick after repair", async () => {
    const scenario = await createScenario({
      steps: hardeningSteps(2, 1),
      profiles: hardeningProfiles("gate-pass", "pending"),
    });
    await rewriteProfilesForState(
      scenario,
      hardeningProfiles("gate-pass", scenario.stateDirectory, { crap: "gate-fail-once" }),
    );

    const result = await runScenario(scenario);

    expect(result.state.terminalState).toBe("passed");
    expect(await readExecutionLog(scenario)).toEqual([
      "agent:implement:1",
      "gate:quick",
      "gate:coverage",
      "gate:crap",
      "agent:repair:1",
      ...hardeningGateIds.map((gate) => `gate:${gate}`),
    ]);
  });

  it("exhausts bounded hardening repair before downstream gates", async () => {
    const scenario = await createScenario({
      steps: hardeningSteps(2, 1),
      profiles: hardeningProfiles("gate-pass", "pending"),
    });
    await rewriteProfilesForState(
      scenario,
      hardeningProfiles("gate-pass", scenario.stateDirectory, { mutation: "gate-always-fail" }),
    );

    const result = await runScenario(scenario);

    expect(result.state.terminalState).toBe("blocked");
    expect(result.state.blocker).toMatchObject({ code: "visit-limit-exceeded", stepId: "repair" });
    expect(await readExecutionLog(scenario)).toEqual([
      "agent:implement:1",
      "gate:quick",
      "gate:coverage",
      "gate:crap",
      "gate:knip",
      "gate:mutation",
      "agent:repair:1",
      "gate:quick",
      "gate:coverage",
      "gate:crap",
      "gate:knip",
      "gate:mutation",
    ]);
    expect(stepStarts(result.events)).not.toContain("sonar");
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

  it("rejects a runs root equal to the clean workspace before trace creation", async () => {
    const harness = directHarness({ cleanWorkspacePath: "/runs" });

    await expect(runController(harness.input, harness.services)).rejects.toThrow(
      "The runs root cannot be the workspace root.",
    );
    expect(harness.openedProtectedPaths).toEqual([
      "/configuration/workflow.json",
      "/task.md",
      "/runs",
      "/configuration/worker.md",
    ]);
    expect(harness.traceEvents).toEqual([]);
  });

  it("records an exact configured terminal blocker", async () => {
    const harness = directHarness({ configuration: terminalConfiguration("blocked") });
    const result = await runController(harness.input, harness.services);

    expect(result.state).toMatchObject({
      terminalState: "blocked",
      blocker: {
        code: "configured-terminal-blocked",
        message: "Terminal step 'stop' blocks the run.",
        stepId: "stop",
      },
    });
    expect(finishedSteps(result.events)[0]).toMatchObject({
      stepType: "terminal",
      outcome: "blocked",
      process: null,
      changedPaths: [],
    });
    expect(startedSteps(result.events)).toEqual([{ stepId: "stop", stepType: "terminal" }]);

    const passedHarness = directHarness({ configuration: terminalConfiguration("passed") });
    const passed = await runController(passedHarness.input, passedHarness.services);
    expect(finishedSteps(passed.events)[0]).toMatchObject({ outcome: "passed", blocker: null });
  });

  it("uses exact default native and agent command requests", async () => {
    const gate = directHarness({ configuration: gateConfiguration() });
    const gateResult = await runController(gate.input, gate.services);
    expect(gate.commands).toEqual([{
      executable: "gate",
      args: ["check"],
      cwd: "/workspace",
      stdin: null,
      timeoutMs: 900_000,
      environmentKeys: [],
    }]);
    expect(startedSteps(gateResult.events)[0]).toEqual({ stepId: "quality", stepType: "gate" });
    expect(finishedSteps(gateResult.events)[0]?.changedPaths).toEqual([]);

    const agent = directHarness();
    const agentResult = await runController(agent.input, agent.services);
    expect(agent.commands).toHaveLength(1);
    expect(agent.commands[0]).toMatchObject({
      executable: "agent",
      args: ["run"],
      cwd: "/workspace",
      timeoutMs: 900_000,
    });
    expect(agent.commands[0]?.stdin).toContain("Stable worker prompt.");
    expect(agent.commands[0]).not.toHaveProperty("environmentKeys");
    expect(startedSteps(agentResult.events)[0]).toEqual({ stepId: "work", stepType: "agent" });
  });

  it.each([
    ["agent spawn", agentConfiguration(), processArtifact("spawn-error"), "agent-spawn-error", "Agent step 'work' could not be launched."],
    ["agent timeout", agentConfiguration(), processArtifact("timeout"), "agent-timeout", "Agent step 'work' timed out."],
    ["agent signal", agentConfiguration(), processArtifact("signal", "SIGUSR1"), "agent-signal", "Agent step 'work' ended from signal 'SIGUSR1'."],
    ["agent unknown signal", agentConfiguration(), processArtifact("signal"), "agent-signal", "Agent step 'work' ended from signal 'unknown'."],
    ["agent exit", agentConfiguration(), processArtifact("exited", null, 7), "agent-exit-nonzero", "Agent step 'work' exited with status 7."],
    ["gate spawn", gateConfiguration(), processArtifact("spawn-error"), "gate-spawn-error", "Gate step 'quality' could not be launched."],
    ["gate timeout", gateConfiguration(), processArtifact("timeout"), "gate-timeout", "Gate step 'quality' timed out."],
    ["gate unknown signal", gateConfiguration(), processArtifact("signal"), "gate-signal", "Gate step 'quality' ended from signal 'unknown'."],
  ] as const)("blocks an exact %s outcome", async (_name, configuration, process, code, message) => {
    const harness = directHarness({ configuration, process });
    const result = await runController(harness.input, harness.services);

    expect(result.state.blocker).toEqual({ code, message, stepId: configuration.workflow.entryStepId });
  });

  it("blocks Git inspection failures before and after an agent process", async () => {
    const before = directHarness({ snapshotFailure: "snapshot failed" });
    const beforeResult = await runController(before.input, before.services);
    expect(before.commands).toEqual([]);
    expect(beforeResult.state.blocker).toEqual({
      code: "git-inspection-failed",
      message: "snapshot failed",
      stepId: "work",
    });
    expect(finishedSteps(beforeResult.events)[0]).toMatchObject({ process: null, changedPaths: [] });

    const after = directHarness({ changedPathsFailure: new Error("comparison failed") });
    const afterResult = await runController(after.input, after.services);
    expect(after.commands).toHaveLength(1);
    expect(afterResult.state.blocker).toEqual({
      code: "git-inspection-failed",
      message: "comparison failed",
      stepId: "work",
    });
    expect(finishedSteps(afterResult.events)[0]).toMatchObject({
      process: { kind: "exited", exitCode: 0 },
      changedPaths: [],
    });
  });

  it("distinguishes directory, exact-file, and protected path authority", async () => {
    const harness = directHarness({
      changedPaths: [
        "src/good.ts",
        "src/policy",
        "src/policy/child.ts",
        "src/policyish",
        "README.md",
        "README.md/child",
        "other.txt",
      ],
      protectedPaths: ["src/policy"],
    });
    const result = await runController(harness.input, harness.services);

    expect(result.state.blocker).toEqual({
      code: "unauthorized-changes",
      message: "Step 'work' changed unauthorized paths: src/policy, src/policy/child.ts, README.md/child, other.txt.",
      stepId: "work",
    });
  });

  it.each([
    ["profile", { configuration: { ...gateConfiguration(), profiles: {} } }, "Planner selected unknown quality profile 'quality'."],
    ["role", { configuration: { ...agentConfiguration(), roles: {} } }, "Planner selected unknown role 'worker'."],
    ["provider", { configuration: { ...agentConfiguration(), providers: {} } }, "Role 'worker' selected unknown provider 'local'."],
    ["prompt", { prompts: {} }, "No loaded prompt is available for role 'worker'."],
  ] as const)("rejects a missing planned %s dependency", async (_name, options, message) => {
    const harness = directHarness(options);
    await expect(runController(harness.input, harness.services)).rejects.toThrow(message);
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

interface DirectHarnessOptions {
  readonly configuration?: Configuration;
  readonly prompts?: Readonly<Record<string, string>>;
  readonly process?: ProcessArtifact;
  readonly cleanWorkspacePath?: string;
  readonly protectedPaths?: readonly string[];
  readonly changedPaths?: readonly string[];
  readonly snapshotFailure?: unknown;
  readonly changedPathsFailure?: unknown;
}

function directHarness(options: DirectHarnessOptions = {}): {
  readonly input: ControllerInput;
  readonly services: RuntimeServices;
  readonly commands: CommandRequest[];
  readonly openedProtectedPaths: string[];
  readonly traceEvents: RunEvent[];
} {
  const commands: CommandRequest[] = [];
  const openedProtectedPaths: string[] = [];
  const traceEvents: RunEvent[] = [];
  let timestamp = 0;
  const input: ControllerInput = {
    configuration: options.configuration ?? agentConfiguration(),
    prompts: options.prompts ?? { worker: "Stable worker prompt." },
    configPath: "/configuration/workflow.json",
    promptPaths: ["/configuration/worker.md"],
    workspacePath: "/workspace",
    task: "Perform the direct test task.",
    taskPath: "/task.md",
    runsRoot: "/runs",
  };
  const services: RuntimeServices = {
    commandRunner: {
      run: async (request) => {
        commands.push(request);
        return options.process ?? processArtifact("exited");
      },
    },
    git: {
      openCleanWorkspace: async (_workspacePath, protectedPaths) => {
        openedProtectedPaths.push(...protectedPaths);
        return {
          path: options.cleanWorkspacePath ?? "/workspace",
          protectedPaths: options.protectedPaths ?? [],
        };
      },
      snapshot: async () => {
        if (Object.hasOwn(options, "snapshotFailure")) {
          throw options.snapshotFailure;
        }
        return { fingerprints: {} };
      },
      changedPathsSince: async () => {
        if (Object.hasOwn(options, "changedPathsFailure")) {
          throw options.changedPathsFailure;
        }
        return options.changedPaths ?? [];
      },
    },
    traces: {
      create: async () => ({
        runDirectory: "/runs/direct-run",
        append: async (event) => { traceEvents.push(event); },
      }),
      read: async () => traceEvents,
    },
    createRunId: () => "direct-run",
    now: () => `2026-01-01T00:00:${String(timestamp++).padStart(2, "0")}.000Z`,
  };
  return { input, services, commands, openedProtectedPaths, traceEvents };
}

function agentConfiguration(): Configuration {
  return {
    schemaVersion: 1,
    workflow: {
      id: "direct-agent",
      entryStepId: "work",
      steps: {
        work: { type: "agent", role: "worker", maxVisits: 1, onCompleted: "passed" },
        passed: { type: "terminal", outcome: "passed" },
      },
    },
    roles: {
      worker: {
        provider: "local",
        promptPath: "worker.md",
        allowedPathPrefixes: ["src/", "README.md"],
      },
    },
    providers: {
      local: { type: "command", executable: "agent", args: ["run"], promptTransport: "stdin" },
    },
    profiles: {},
  };
}

function gateConfiguration(): Configuration {
  return {
    schemaVersion: 1,
    workflow: {
      id: "direct-gate",
      entryStepId: "quality",
      steps: {
        quality: {
          type: "gate",
          profile: "quality",
          maxVisits: 1,
          onPassed: "passed",
          onFailed: "passed",
        },
        passed: { type: "terminal", outcome: "passed" },
      },
    },
    roles: {},
    providers: {},
    profiles: { quality: { executable: "gate", args: ["check"] } },
  };
}

function terminalConfiguration(outcome: "passed" | "blocked"): Configuration {
  return {
    schemaVersion: 1,
    workflow: {
      id: "direct-terminal",
      entryStepId: "stop",
      steps: { stop: { type: "terminal", outcome } },
    },
    roles: {},
    providers: {},
    profiles: {},
  };
}

function processArtifact(
  kind: ProcessArtifact["kind"],
  signal: string | null = null,
  exitCode = kind === "exited" ? 0 : null,
): ProcessArtifact {
  return {
    kind,
    exitCode,
    signal,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

function finishedSteps(events: readonly RunEvent[]): readonly StepFinishedEvent[] {
  return events.filter((event): event is StepFinishedEvent => event.type === "step-finished");
}

function startedSteps(events: readonly RunEvent[]): readonly { readonly stepId: string; readonly stepType: string }[] {
  return events
    .filter((event) => event.type === "step-started")
    .map(({ stepId, stepType }) => ({ stepId, stepType }));
}

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

const hardeningGateIds = ["quick", "coverage", "crap", "knip", "mutation", "sonar"] as const;

function hardeningSteps(
  gateMaxVisits: number,
  repairMaxVisits: number,
): Readonly<Record<string, WorkflowStep>> {
  return {
    implement: { type: "agent", role: "implementer", maxVisits: 1, onCompleted: "quick" },
    quick: { type: "gate", profile: "quick", maxVisits: gateMaxVisits, onPassed: "coverage", onFailed: "repair" },
    coverage: { type: "gate", profile: "coverage", maxVisits: gateMaxVisits, onPassed: "crap", onFailed: "repair" },
    crap: { type: "gate", profile: "crap", maxVisits: gateMaxVisits, onPassed: "knip", onFailed: "repair" },
    knip: { type: "gate", profile: "knip", maxVisits: gateMaxVisits, onPassed: "mutation", onFailed: "repair" },
    mutation: { type: "gate", profile: "mutation", maxVisits: gateMaxVisits, onPassed: "sonar", onFailed: "repair" },
    sonar: { type: "gate", profile: "sonar", maxVisits: gateMaxVisits, onPassed: "passed", onFailed: "repair" },
    repair: { type: "agent", role: "repairer", maxVisits: repairMaxVisits, onCompleted: "quick" },
    passed: { type: "terminal", outcome: "passed" },
  };
}

function hardeningProfiles(
  defaultMode: string,
  stateDirectory: string,
  overrides: Partial<Record<(typeof hardeningGateIds)[number], string>> = {},
): Configuration["profiles"] {
  return Object.fromEntries(
    hardeningGateIds.map((gate) => [
      gate,
      profile(overrides[gate] ?? defaultMode, stateDirectory, gate),
    ]),
  );
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
