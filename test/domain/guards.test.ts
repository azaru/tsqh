import { describe, expect, it } from "vitest";
import { compareStrings } from "../../src/domain/order.js";
import { planNextAction } from "../../src/domain/planner.js";
import { reduceTrace, TraceValidationError } from "../../src/domain/reducer.js";
import type {
  Blocker,
  Configuration,
  ProcessArtifact,
  RunEvent,
  RunState,
  StepOutcome,
} from "../../src/domain/types.js";
import {
  ConfigurationValidationError,
  isSafeRelativePath,
  validateConfigurationGraph,
} from "../../src/domain/validation.js";

describe("canonical string ordering", () => {
  it("sorts with the fixed English locale", () => {
    expect(["z", "a", "b"].sort(compareStrings)).toEqual(["a", "b", "z"]);
    expect(compareStrings("same", "same")).toBe(0);
  });
});

describe("planner guards", () => {
  it.each([
    [
      "workflow mismatch",
      plannerState({ workflowId: "other" }),
      { code: "workflow-mismatch", message: "The run workflow does not match the configured workflow.", stepId: null },
    ],
    [
      "running action",
      plannerState({ phase: "running" }),
      { code: "action-already-running", message: "A workflow action is already running.", stepId: "work" },
    ],
    [
      "unknown ready step",
      plannerState({ currentStepId: "missing" }),
      { code: "unknown-step", message: "Step 'missing' does not exist.", stepId: "missing" },
    ],
    [
      "missing outcome",
      plannerState({ phase: "transition" }),
      {
        code: "missing-outcome",
        message: "No current recorded outcome is available for transition selection.",
        stepId: "work",
      },
    ],
    [
      "mismatched outcome",
      plannerState({ phase: "transition", latestOutcome: outcome("other", "completed") }),
      {
        code: "missing-outcome",
        message: "No current recorded outcome is available for transition selection.",
        stepId: "work",
      },
    ],
    [
      "unknown current step",
      plannerState({
        phase: "transition",
        currentStepId: "missing",
        latestOutcome: outcome("missing", "completed"),
      }),
      { code: "unknown-current-step", message: "Current step 'missing' does not exist.", stepId: "missing" },
    ],
    [
      "missing agent transition",
      plannerState({ phase: "transition", latestOutcome: outcome("work", "failed") }),
      {
        code: "missing-transition",
        message: "Step 'work' has no configured edge for outcome 'failed'.",
        stepId: "work",
      },
    ],
    [
      "missing gate transition",
      plannerState({
        phase: "transition",
        currentStepId: "gate",
        latestOutcome: outcome("gate", "completed"),
      }),
      {
        code: "missing-transition",
        message: "Step 'gate' has no configured edge for outcome 'completed'.",
        stepId: "gate",
      },
    ],
  ] as const)("blocks on %s", (_label, state, expectedBlocker) => {
    expect(planNextAction(PLANNER_CONFIGURATION, state)).toEqual({
      type: "finish",
      terminalState: "blocked",
      blocker: expectedBlocker,
    });
  });

  it("uses fallback values only for malformed internal state", () => {
    expect(planNextAction(
      PLANNER_CONFIGURATION,
      plannerState({ phase: "finished", terminalState: null }),
    )).toMatchObject({ type: "finish", terminalState: "blocked" });
    expect(planNextAction(
      PLANNER_CONFIGURATION,
      plannerState({ phase: "finished", terminalState: "passed" }),
    )).toMatchObject({ type: "finish", terminalState: "passed" });
    expect(planNextAction(
      PLANNER_CONFIGURATION,
      plannerState({ visitCounts: {} }),
    )).toMatchObject({ type: "dispatch-agent", visit: 1 });
  });

  it("preserves or creates an exact step blocker", () => {
    const existing: Blocker = { code: "exact", message: "Exact blocker.", stepId: "work" };
    const blocked = (blocker: Blocker | null): RunState => plannerState({
      phase: "transition",
      latestOutcome: { ...outcome("work", "blocked"), blocker },
    });

    expect(planNextAction(PLANNER_CONFIGURATION, blocked(existing))).toMatchObject({ blocker: existing });
    expect(planNextAction(PLANNER_CONFIGURATION, blocked(null))).toMatchObject({
      blocker: { code: "step-blocked", message: "Step 'work' recorded a blocker.", stepId: "work" },
    });
  });

  it("plans both terminal outcomes and every action kind", () => {
    expect(planNextAction(
      PLANNER_CONFIGURATION,
      plannerState({ currentStepId: "gate", visitCounts: { gate: 1 } }),
    )).toMatchObject({ type: "run-native-profile", profileId: "quick" });
    expect(planNextAction(
      PLANNER_CONFIGURATION,
      plannerState({ currentStepId: "passed", visitCounts: { passed: 1 } }),
    )).toMatchObject({ type: "enter-terminal", outcome: "passed" });
    expect(planNextAction(
      PLANNER_CONFIGURATION,
      plannerState({
        phase: "transition",
        currentStepId: "gate",
        latestOutcome: outcome("gate", "passed"),
      }),
    )).toEqual({ type: "enter-terminal", stepId: "passed", visit: 1, outcome: "passed" });

    for (const [stepId, terminalState, blocker] of [
      ["passed", "passed", null],
      [
        "blocked",
        "blocked",
        {
          code: "configured-terminal-blocked",
          message: "Terminal step 'blocked' blocks the run.",
          stepId: "blocked",
        },
      ],
    ] as const) {
      expect(planNextAction(
        PLANNER_CONFIGURATION,
        plannerState({
          phase: "transition",
          currentStepId: stepId,
          latestOutcome: outcome(stepId, "passed"),
        }),
      )).toMatchObject({ type: "finish", terminalState, blocker });
    }
  });

  it("blocks unknown targets and exhausted visits", () => {
    const configuration = structuredClone(PLANNER_CONFIGURATION);
    const work = configuration.workflow.steps.work;
    if (work?.type !== "agent") {
      throw new Error("Expected agent fixture step.");
    }
    Object.assign(work, { onCompleted: "missing" });
    const transition = plannerState({
      phase: "transition",
      latestOutcome: outcome("work", "completed"),
    });
    expect(planNextAction(configuration, transition)).toMatchObject({
      blocker: {
        code: "unknown-transition-target",
        message: "Transition target 'missing' does not exist.",
        stepId: "work",
      },
    });

    expect(planNextAction(
      PLANNER_CONFIGURATION,
      plannerState({
        phase: "transition",
        currentStepId: "gate",
        visitCounts: { gate: 1, work: 1 },
        latestOutcome: outcome("gate", "failed"),
      }),
    )).toMatchObject({
      blocker: {
        code: "visit-limit-exceeded",
        message: "Step 'work' would exceed maxVisits 1.",
        stepId: "work",
      },
    });
  });
});

describe("trace guards", () => {
  it.each([
    ["empty trace", [], /empty/u],
    ["first event type", [started(1)], /first trace event/u],
    ["changed run id", [created(), started(2, { runId: "other" })], /run id changed/u],
    ["duplicate creation", [created(), created(2)], /exactly once/u],
    ["event after finish", [created(), finishedRun(2, "passed"), started(3)], /follow run-finished/u],
    ["start while running", [created(), started(2), started(3)], /step-started is invalid/u],
    ["wrong initial visit", [created(), started(2, { visit: 2 })], /expected 1/u],
    ["finish while ready", [created(), finishedStep(2)], /does not match/u],
    [
      "wrong finished step",
      [created(), started(2), finishedStep(3, { stepId: "other" })],
      /does not match/u,
    ],
    [
      "wrong finished visit",
      [created(), started(2), finishedStep(3, { visit: 2 })],
      /does not match/u,
    ],
    ["finish while running", [created(), started(2), finishedRun(3, "passed")], /while a step is running/u],
    [
      "passed with blocker",
      [created(), finishedRun(2, "passed", blocker())],
      /passed run cannot contain/u,
    ],
    ["blocked without blocker", [created(), finishedRun(2, "blocked")], /blocked run must contain/u],
  ] as const)("rejects %s", (_label, events, message) => {
    expect(() => reduceTrace(events)).toThrow(message);
  });

  it("tracks, preserves, and clears the latest native gate failure", () => {
    const failed = [
      created(),
      started(2, { stepId: "gate", stepType: "gate" }),
      finishedStep(3, {
        stepId: "gate",
        stepType: "gate",
        outcome: "failed",
        process: exited(2),
      }),
    ];
    expect(reduceTrace(failed).mostRecentGateFailure).toEqual({
      stepId: "gate",
      visit: 1,
      processKind: "exited",
      exitCode: 2,
      signal: null,
      standardOutput: {
        text: "",
        capturedBytes: 0,
        includedBytes: 0,
        processTruncated: false,
        contextTruncated: false,
      },
      standardError: {
        text: "",
        capturedBytes: 0,
        includedBytes: 0,
        processTruncated: false,
        contextTruncated: false,
      },
    });

    const preserved = [
      ...failed,
      started(4, { stepId: "work", stepType: "agent", visit: 2 }),
      finishedStep(5, {
        stepId: "work",
        stepType: "agent",
        visit: 2,
        outcome: "failed",
        process: exited(1),
      }),
    ];
    expect(reduceTrace(preserved).mostRecentGateFailure).toMatchObject({ stepId: "gate" });

    const cleared = [
      ...failed,
      started(4, { stepId: "gate", stepType: "gate", visit: 2 }),
      finishedStep(5, { stepId: "gate", stepType: "gate", visit: 2, outcome: "passed" }),
    ];
    expect(reduceTrace(cleared).mostRecentGateFailure).toBeNull();
  });

  it("tracks successful agent stdout and preserves it across native gates", () => {
    const completedAgent = [
      created(),
      started(2),
      finishedStep(3, {
        process: { ...exited(0), stdout: "bounded handoff", stdoutTruncated: true },
      }),
    ];
    expect(reduceTrace(completedAgent).mostRecentAgentHandoff).toEqual({
      sourceStepId: "work",
      sourceVisit: 1,
      text: "bounded handoff",
      truncated: true,
    });

    const afterGate = [
      ...completedAgent,
      started(4, { stepId: "gate", stepType: "gate" }),
      finishedStep(5, { stepId: "gate", stepType: "gate", outcome: "passed" }),
    ];
    expect(reduceTrace(afterGate).mostRecentAgentHandoff).toEqual(
      reduceTrace(completedAgent).mostRecentAgentHandoff,
    );
  });

  it.each([
    ["blocked outcome", { outcome: "blocked", process: exited(0), blocker: blocker() }],
    ["nonzero process", { outcome: "completed", process: exited(1) }],
    ["missing process", { outcome: "completed", process: null }],
  ] as const)("does not create a handoff for a %s", (_label, overrides) => {
    const state = reduceTrace([created(), started(2), finishedStep(3, overrides)]);

    expect(state.mostRecentAgentHandoff).toBeNull();
  });

  it("does not interpret a non-agent process artifact as a handoff", () => {
    const state = reduceTrace([
      created(),
      started(2, { stepId: "gate", stepType: "gate" }),
      finishedStep(3, {
        stepId: "gate",
        stepType: "gate",
        outcome: "completed",
        process: { ...exited(0), stdout: "nextStep=passed" },
      }),
    ]);

    expect(state.mostRecentAgentHandoff).toBeNull();
  });

  it("accepts both valid terminal states", () => {
    expect(reduceTrace([created(), finishedRun(2, "passed")])).toMatchObject({
      phase: "finished",
      terminalState: "passed",
    });
    expect(reduceTrace([created(), finishedRun(2, "blocked", blocker())])).toMatchObject({
      phase: "finished",
      terminalState: "blocked",
    });
  });

  it("rejects non-integer sequence numbers", () => {
    expect(() => reduceTrace([created(1.5)])).toThrow(TraceValidationError);
  });

  it("rejects a sequence gap with the exact trace diagnostic", () => {
    expect(() => reduceTrace([created(), started(3)])).toThrow(
      "Trace sequence is not contiguous at line 2; received 3.",
    );
  });

  it("identifies trace validation errors by name", () => {
    expect(() => reduceTrace([])).toThrow(expect.objectContaining({ name: "TraceValidationError" }));
  });

  it("requires the finished step id even when an earlier visit has the same number", () => {
    const events = [
      created(),
      started(2, { stepId: "other" }),
      finishedStep(3, { stepId: "other" }),
      started(4, { visit: 2 }),
      finishedStep(5, { stepId: "other" }),
    ];

    expect(() => reduceTrace(events)).toThrow(
      "step-finished does not match the active step 'work'.",
    );
  });

  it("does not record a blocked gate as a native gate failure", () => {
    const state = reduceTrace([
      created(),
      started(2, { stepId: "gate", stepType: "gate" }),
      finishedStep(3, {
        stepId: "gate",
        stepType: "gate",
        outcome: "blocked",
        process: exited(2),
        blocker: blocker(),
      }),
    ]);

    expect(state.mostRecentGateFailure).toBeNull();
  });
});

describe("configuration graph guards", () => {
  it.each([
    [
      "prompt path",
      (value: MutableConfiguration): void => { value.roles.worker!.promptPath = ""; },
      "role 'worker' has invalid promptPath ''",
    ],
    [
      "write prefix",
      (value: MutableConfiguration): void => { value.roles.worker!.allowedPathPrefixes = [""]; },
      "role 'worker' has invalid allowed path prefix ''",
    ],
    [
      "environment key",
      (value: MutableConfiguration): void => { value.profiles.quick!.environmentKeys = ["bad"]; },
      "profile 'quick' has invalid environment key 'bad'",
    ],
    [
      "visit limit",
      (value: MutableConfiguration): void => { value.workflow.steps.work!.maxVisits = 0; },
      "step 'work' has invalid maxVisits '0'",
    ],
    [
      "executable",
      (value: MutableConfiguration): void => { value.providers.local!.executable = ""; },
      "provider 'local' has invalid executable",
    ],
    [
      "argument",
      (value: MutableConfiguration): void => { value.profiles.quick!.args = [""]; },
      "profile 'quick' has invalid argument at index 0",
    ],
    [
      "timeout",
      (value: MutableConfiguration): void => { value.profiles.quick!.timeoutMs = 0; },
      "profile 'quick' has invalid timeoutMs '0'",
    ],
    [
      "identifier",
      (value: MutableConfiguration): void => { value.workflow.id = "bad id"; },
      "workflow.id has invalid identifier 'bad id'",
    ],
  ] as const)("rejects an invalid %s", (_label, mutate, expectedIssue) => {
    const value = mutableConfiguration();
    mutate(value);
    expect(validationIssues(value)).toEqual([expectedIssue]);
  });

  it("returns a stable aggregate validation error", () => {
    const value = mutableConfiguration();
    value.workflow.id = "bad id";
    value.roles.worker!.promptPath = "";

    let failure: unknown;
    try {
      validateConfigurationGraph(value as unknown as Configuration);
    } catch (error) {
      failure = error;
    }

    expect(failure).toEqual(expect.objectContaining({
      name: "ConfigurationValidationError",
      message: [
        "Configuration validation failed:",
        "- workflow.id has invalid identifier 'bad id'",
        "- role 'worker' has invalid promptPath ''",
      ].join("\n"),
      issues: [
        "workflow.id has invalid identifier 'bad id'",
        "role 'worker' has invalid promptPath ''",
      ],
    }));
  });

  it.each([
    ["A", true],
    [`A${"a".repeat(63)}`, true],
    [`A${"a".repeat(64)}`, false],
    ["1name", false],
    ["name!", false],
    ["!name", false],
  ] as const)("enforces identifier boundaries for %j", (identifier, valid) => {
    const value = mutableConfiguration();
    value.workflow.id = identifier;
    if (valid) {
      expect(() => validateConfigurationGraph(value as unknown as Configuration)).not.toThrow();
    } else {
      expect(validationIssues(value)).toEqual([
        `workflow.id has invalid identifier '${identifier}'`,
      ]);
    }
  });

  it.each([
    ["A", true],
    [`A${"A".repeat(63)}`, true],
    [`A${"A".repeat(64)}`, false],
    ["1KEY", false],
    ["KEY-NAME", false],
    ["!KEY", false],
  ] as const)("enforces environment-key boundaries for %j", (key, valid) => {
    const value = mutableConfiguration();
    value.profiles.quick!.environmentKeys = [key];
    if (valid) {
      expect(() => validateConfigurationGraph(value as unknown as Configuration)).not.toThrow();
    } else {
      expect(validationIssues(value)).toEqual([
        `profile 'quick' has invalid environment key '${key}'`,
      ]);
    }
  });

  it.each([
    [
      "unknown entry",
      (value: MutableConfiguration): void => { value.workflow.entryStepId = "missing"; },
      ["workflow.entryStepId references unknown step 'missing'"],
    ],
    [
      "unknown provider",
      (value: MutableConfiguration): void => { value.roles.worker!.provider = "missing"; },
      ["role 'worker' references unknown provider 'missing'"],
    ],
    [
      "unknown role",
      (value: MutableConfiguration): void => { value.workflow.steps.work!.role = "missing"; },
      ["agent step 'work' references unknown role 'missing'"],
    ],
    [
      "invalid transition",
      (value: MutableConfiguration): void => { value.workflow.steps.work!.onCompleted = "bad target"; },
      [
        "step 'work' onCompleted has invalid identifier 'bad target'",
        "step 'work' onCompleted references unknown step 'bad target'",
      ],
    ],
    [
      "unreachable step",
      (value: MutableConfiguration): void => {
        value.workflow.steps.orphan = {
          type: "agent",
          role: "worker",
          maxVisits: 1,
          onCompleted: "orphanTerminal",
        };
        value.workflow.steps.orphanTerminal = { type: "terminal", outcome: "passed" };
      },
      [
        "workflow step 'orphan' is unreachable from entry step 'work'",
        "workflow step 'orphanTerminal' is unreachable from entry step 'work'",
      ],
    ],
    [
      "nonterminal cycle",
      (value: MutableConfiguration): void => { value.workflow.steps.work!.onCompleted = "work"; },
      [
        "workflow step 'passed' is unreachable from entry step 'work'",
        "workflow step 'work' has no path to terminal behavior",
      ],
    ],
  ] as const)("reports exact graph issues for %s", (_label, mutate, expectedIssues) => {
    const value = mutableConfiguration();
    mutate(value);
    expect(validationIssues(value)).toEqual(expectedIssues);
  });

  it("validates both gate transitions and the referenced profile", () => {
    const value = mutableConfiguration();
    value.workflow.steps.work = {
      type: "gate",
      profile: "missing",
      maxVisits: 1,
      onPassed: "bad target",
      onFailed: "also bad",
    };

    expect(validationIssues(value)).toEqual([
      "gate step 'work' references unknown profile 'missing'",
      "step 'work' onPassed has invalid identifier 'bad target'",
      "step 'work' onPassed references unknown step 'bad target'",
      "step 'work' onFailed has invalid identifier 'also bad'",
      "step 'work' onFailed references unknown step 'also bad'",
    ]);
  });

  it("validates record identifiers at each graph location", () => {
    const value = mutableConfiguration();
    value.workflow.entryStepId = "bad step";
    value.workflow.steps["bad step"] = value.workflow.steps.work!;
    delete value.workflow.steps.work;
    value.roles["bad role"] = value.roles.worker!;
    value.workflow.steps["bad step"]!.role = "bad role";
    delete value.roles.worker;
    value.providers["bad provider"] = value.providers.local!;
    value.roles["bad role"]!.provider = "bad provider";
    delete value.providers.local;
    value.profiles["bad profile"] = value.profiles.quick!;
    delete value.profiles.quick;

    expect(validationIssues(value)).toEqual([
      "workflow.entryStepId has invalid identifier 'bad step'",
      "workflow.steps key 'bad step' has invalid identifier 'bad step'",
      "roles key 'bad role' has invalid identifier 'bad role'",
      "providers key 'bad provider' has invalid identifier 'bad provider'",
      "profiles key 'bad profile' has invalid identifier 'bad profile'",
    ]);
  });

  it("enforces command and timeout boundaries", () => {
    const maximum = mutableConfiguration();
    maximum.providers.local!.timeoutMs = 86_400_000;
    expect(() => validateConfigurationGraph(maximum as unknown as Configuration)).not.toThrow();

    const invalid = mutableConfiguration();
    invalid.providers.local!.executable = " padded";
    invalid.providers.local!.args = ["run", "bad\0argument"];
    invalid.providers.local!.timeoutMs = 86_400_001;
    invalid.workflow.steps.work!.maxVisits = 1.5;
    expect(validationIssues(invalid)).toEqual([
      "step 'work' has invalid maxVisits '1.5'",
      "provider 'local' has invalid executable",
      "provider 'local' has invalid argument at index 1",
      "provider 'local' has invalid timeoutMs '86400001'",
    ]);
  });

  it.each([
    [
      "provider selection",
      (value: MutableConfiguration): void => {
        value.providers.local!.model = " invalid";
        value.providers.local!.args = ["{model}"];
      },
      "provider 'local' has invalid model ' invalid'",
    ],
    [
      "role selection",
      (value: MutableConfiguration): void => {
        value.roles.worker!.effort = "bad effort";
        value.providers.local!.args = ["{effort}"];
      },
      "role 'worker' has invalid effort 'bad effort'",
    ],
    [
      "step selection",
      (value: MutableConfiguration): void => {
        value.workflow.steps.work!.model = "-flag";
        value.providers.local!.args = ["{model}"];
      },
      "agent step 'work' has invalid model '-flag'",
    ],
  ] as const)("rejects an invalid %s value", (_label, mutate, expectedIssue) => {
    const value = mutableConfiguration();
    mutate(value);
    expect(validationIssues(value)).toEqual([expectedIssue]);
  });

  it.each([
    [
      "missing model placeholder",
      (value: MutableConfiguration): void => { value.providers.local!.model = "provider-model"; },
      "agent step 'work' resolves model 'provider-model' but provider 'local' has no '{model}' placeholder",
    ],
    [
      "unresolved effort placeholder",
      (value: MutableConfiguration): void => { value.providers.local!.args = ["{effort}"]; },
      "agent step 'work' cannot resolve effort required by provider 'local' placeholder '{effort}'",
    ],
    [
      "duplicate model placeholder",
      (value: MutableConfiguration): void => {
        value.providers.local!.model = "provider-model";
        value.providers.local!.args = ["{model}", "prefix={model}"];
      },
      "provider 'local' has duplicate '{model}' placeholders",
    ],
    [
      "unsupported placeholder",
      (value: MutableConfiguration): void => { value.providers.local!.args = ["{temperature}"]; },
      "provider 'local' has unsupported argument placeholder '{temperature}'",
    ],
  ] as const)("rejects a provider with %s", (_label, mutate, expectedIssue) => {
    const value = mutableConfiguration();
    mutate(value);
    expect(validationIssues(value)).toEqual([expectedIssue]);
  });

  it("enforces the complete bounded agent selection pattern", () => {
    const valid = mutableConfiguration();
    valid.providers.local!.model = "a.b/c:d+e-f_0";
    valid.providers.local!.args = ["{model}"];
    expect(() => validateConfigurationGraph(valid as unknown as Configuration)).not.toThrow();

    const invalidLeading = mutableConfiguration();
    invalidLeading.providers.local!.model = "_model";
    invalidLeading.providers.local!.args = ["{model}"];
    expect(validationIssues(invalidLeading)).toEqual([
      "provider 'local' has invalid model '_model'",
    ]);

    const invalidLength = mutableConfiguration();
    invalidLength.providers.local!.model = `a${"b".repeat(128)}`;
    invalidLength.providers.local!.args = ["{model}"];
    expect(validationIssues(invalidLength)).toEqual([
      `provider 'local' has invalid model '${invalidLength.providers.local!.model}'`,
    ]);
  });

  it.each([
    "",
    " padded",
    "has\0null",
    "has\ncontrol",
    "windows\\separator",
    "/absolute",
    "C:/absolute",
    "double//separator",
    ".",
    "../parent",
  ])("rejects unsafe path %j", (path) => {
    expect(isSafeRelativePath(path, false)).toBe(false);
  });

  it("handles trailing slash authority explicitly", () => {
    expect(isSafeRelativePath("src/", true)).toBe(true);
    expect(isSafeRelativePath("src/", false)).toBe(false);
    expect(isSafeRelativePath("/", true)).toBe(false);
    expect(isSafeRelativePath("src/file.ts", false)).toBe(true);
    expect(isSafeRelativePath("dir/C:/file.ts", false)).toBe(true);
  });

  it("does not allow a prompt path to use directory-prefix authority", () => {
    const value = mutableConfiguration();
    value.roles.worker!.promptPath = "prompts/";
    expect(validationIssues(value)).toEqual([
      "role 'worker' has invalid promptPath 'prompts/'",
    ]);
  });

  it("accepts the minimal valid graph", () => {
    expect(() => validateConfigurationGraph(
      mutableConfiguration() as unknown as Configuration,
    )).not.toThrow();
  });
});

function validationIssues(value: MutableConfiguration): readonly string[] {
  try {
    validateConfigurationGraph(value as unknown as Configuration);
  } catch (error) {
    if (error instanceof ConfigurationValidationError) {
      return error.issues;
    }
    throw error;
  }
  throw new Error("Expected configuration validation to fail.");
}

const PLANNER_CONFIGURATION: Configuration = {
  schemaVersion: 1,
  workflow: {
    id: "planner",
    entryStepId: "work",
    steps: {
      work: { type: "agent", role: "worker", maxVisits: 1, onCompleted: "gate" },
      gate: { type: "gate", profile: "quick", maxVisits: 1, onPassed: "passed", onFailed: "work" },
      passed: { type: "terminal", outcome: "passed" },
      blocked: { type: "terminal", outcome: "blocked" },
    },
  },
  roles: {
    worker: { provider: "local", promptPath: "prompts/worker.md", allowedPathPrefixes: ["src/"] },
  },
  providers: {
    local: { type: "command", executable: "agent", args: [], promptTransport: "stdin" },
  },
  profiles: { quick: { executable: "pnpm", args: ["test"] } },
};

function plannerState(overrides: Partial<RunState> = {}): RunState {
  return {
    runId: "run",
    workflowId: "planner",
    workspace: "/workspace",
    phase: "ready",
    currentStepId: "work",
    visitCounts: { work: 1 },
    latestOutcome: null,
    mostRecentAgentHandoff: null,
    mostRecentGateFailure: null,
    terminalState: null,
    blocker: null,
    ...overrides,
  };
}

function outcome(stepId: string, value: StepOutcome): NonNullable<RunState["latestOutcome"]> {
  return { stepId, stepType: "agent", visit: 1, outcome: value, blocker: null };
}

function created(sequence = 1): RunEvent {
  return {
    schemaVersion: 1,
    sequence,
    runId: "run",
    occurredAt: "2026-01-01T00:00:00.000Z",
    type: "run-created",
    workflowId: "planner",
    entryStepId: "work",
    workspace: "/workspace",
  };
}

function started(sequence: number, overrides: Record<string, unknown> = {}): RunEvent {
  return {
    schemaVersion: 1,
    sequence,
    runId: "run",
    occurredAt: "2026-01-01T00:00:00.000Z",
    type: "step-started",
    stepId: "work",
    stepType: "agent",
    visit: 1,
    ...overrides,
  } as RunEvent;
}

function finishedStep(sequence: number, overrides: Record<string, unknown> = {}): RunEvent {
  return {
    schemaVersion: 1,
    sequence,
    runId: "run",
    occurredAt: "2026-01-01T00:00:00.000Z",
    type: "step-finished",
    stepId: "work",
    stepType: "agent",
    visit: 1,
    outcome: "completed",
    process: null,
    changedPaths: [],
    blocker: null,
    ...overrides,
  } as RunEvent;
}

function finishedRun(
  sequence: number,
  terminalState: "passed" | "blocked",
  runBlocker: Blocker | null = null,
): RunEvent {
  return {
    schemaVersion: 1,
    sequence,
    runId: "run",
    occurredAt: "2026-01-01T00:00:00.000Z",
    type: "run-finished",
    terminalState,
    blocker: runBlocker,
  };
}

function blocker(): Blocker {
  return { code: "blocked", message: "Blocked.", stepId: "work" };
}

function exited(exitCode: number): ProcessArtifact {
  return {
    kind: "exited",
    exitCode,
    signal: null,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

interface MutableConfiguration {
  schemaVersion: number;
  workflow: {
    id: string;
    entryStepId: string;
    steps: Record<string, Record<string, unknown>>;
  };
  roles: Record<string, {
    provider: string;
    model?: string;
    effort?: string;
    promptPath: string;
    allowedPathPrefixes: string[];
  }>;
  providers: Record<string, {
    type: string;
    executable: string;
    args: string[];
    model?: string;
    effort?: string;
    promptTransport: string;
    timeoutMs?: number;
  }>;
  profiles: Record<string, { executable: string; args: string[]; environmentKeys?: string[]; timeoutMs?: number }>;
}

function mutableConfiguration(): MutableConfiguration {
  return {
    schemaVersion: 1,
    workflow: {
      id: "valid",
      entryStepId: "work",
      steps: {
        work: { type: "agent", role: "worker", maxVisits: 1, onCompleted: "passed" },
        passed: { type: "terminal", outcome: "passed" },
      },
    },
    roles: {
      worker: { provider: "local", promptPath: "prompts/worker.md", allowedPathPrefixes: ["src/"] },
    },
    providers: {
      local: { type: "command", executable: "agent", args: ["run"], promptTransport: "stdin" },
    },
    profiles: { quick: { executable: "pnpm", args: ["test"] } },
  };
}
