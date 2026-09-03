import { describe, expect, it } from "vitest";
import {
  findArgumentPlaceholders,
  renderAgentArguments,
  resolveAgentSelection,
} from "../../src/domain/agent-selection.js";
import type { CommandProvider, Role, WorkflowStep } from "../../src/domain/types.js";

const provider: CommandProvider = {
  type: "command",
  executable: "agent",
  args: ["run", "{model}", "effort={effort}"],
  model: "provider-model",
  effort: "provider-effort",
  promptTransport: "stdin",
};

const role: Role = {
  provider: "local",
  model: "role-model",
  effort: "role-effort",
  promptPath: "prompts/worker.md",
  allowedPathPrefixes: [],
};

describe("agent provider selection", () => {
  it("resolves each field through step, role, and provider precedence", () => {
    expect(resolveAgentSelection(agentStep(), role, provider)).toEqual({
      model: "role-model",
      effort: "role-effort",
    });
    expect(resolveAgentSelection(
      agentStep({ model: "step-model" }),
      {
        provider: "local",
        model: "role-model",
        promptPath: "prompt.md",
        allowedPathPrefixes: [],
      },
      provider,
    )).toEqual({ model: "step-model", effort: "provider-effort" });
    expect(resolveAgentSelection(
      agentStep({ effort: "step-effort" }),
      { provider: "local", promptPath: "prompt.md", allowedPathPrefixes: [] },
      provider,
    )).toEqual({ model: "provider-model", effort: "step-effort" });
    expect(resolveAgentSelection(
      agentStep(),
      { provider: "local", promptPath: "prompt.md", allowedPathPrefixes: [] },
      {
        type: "command",
        executable: "agent",
        args: ["run"],
        promptTransport: "stdin",
      },
    )).toEqual({ model: undefined, effort: undefined });
  });

  it("renders within existing arguments and leaves the configured templates unchanged", () => {
    const args = ["run", "--model", "{model}", "--config", "effort=\"{effort}\""] as const;

    expect(renderAgentArguments(args, {
      model: "selected/model",
      effort: "selected-effort",
    })).toEqual([
      "run",
      "--model",
      "selected/model",
      "--config",
      "effort=\"selected-effort\"",
    ]);
    expect(args).toEqual(["run", "--model", "{model}", "--config", "effort=\"{effort}\""]);
  });

  it("fails closed when rendering a placeholder without a resolved value", () => {
    expect(() => renderAgentArguments(["{model}"], {
      model: undefined,
      effort: "high",
    })).toThrow("Provider argument placeholder '{model}' has no resolved model value.");
    expect(() => renderAgentArguments(["{effort}"], {
      model: "model",
      effort: undefined,
    })).toThrow("Provider argument placeholder '{effort}' has no resolved effort value.");
  });

  it("finds bounded placeholder tokens without inventing matches", () => {
    expect(findArgumentPlaceholders("prefix={model};effort={effort}")).toEqual([
      "{model}",
      "{effort}",
    ]);
    expect(findArgumentPlaceholders("plain-argument")).toEqual([]);
  });
});

function agentStep(
  overrides: { readonly model?: string; readonly effort?: string } = {},
): Extract<WorkflowStep, { readonly type: "agent" }> {
  return {
    type: "agent",
    role: "worker",
    maxVisits: 1,
    onCompleted: "passed",
    ...overrides,
  };
}
