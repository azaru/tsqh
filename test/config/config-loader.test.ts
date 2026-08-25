import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfiguration } from "../../src/adapters/config-loader.js";

describe("strict configuration loading", () => {
  it("loads and freezes a valid independent configuration", async () => {
    const path = await writeConfiguration(validConfiguration());
    const loaded = await loadConfiguration(path);
    expect(loaded.configuration.workflow.entryStepId).toBe("work");
    expect(loaded.prompts.worker).toContain("Stable role");
    expect(Object.isFrozen(loaded.configuration.workflow.steps)).toBe(true);
  });

  it.each([
    ["unknown property", (value: Record<string, unknown>) => Object.assign(value, { surprise: true })],
    ["unknown role reference", (value: Record<string, unknown>) => agentStep(value).role = "missing"],
    ["unknown provider reference", (value: Record<string, unknown>) => role(value).provider = "missing"],
    ["unknown profile reference", (value: Record<string, unknown>) => {
      const steps = workflow(value).steps as Record<string, Record<string, unknown>>;
      steps.work = {
        type: "gate",
        profile: "missing",
        maxVisits: 1,
        onPassed: "passed",
        onFailed: "passed",
      };
    }],
    ["unknown entry step", (value: Record<string, unknown>) => workflow(value).entryStepId = "missing"],
    ["missing edge", (value: Record<string, unknown>) => delete agentStep(value).onCompleted],
    ["invalid limit", (value: Record<string, unknown>) => agentStep(value).maxVisits = 0],
    ["invalid prompt path", (value: Record<string, unknown>) => role(value).promptPath = "../escape.md"],
    ["absolute prompt path", (value: Record<string, unknown>) => role(value).promptPath = "/tmp/escape.md"],
    ["invalid allowed prefix", (value: Record<string, unknown>) => role(value).allowedPathPrefixes = ["src/../policy/"]],
    ["unknown step type", (value: Record<string, unknown>) => agentStep(value).type = "oracle"],
    ["unknown transition target", (value: Record<string, unknown>) => agentStep(value).onCompleted = "missing"],
  ])("rejects %s", async (_name, mutate) => {
    const value = validConfiguration();
    mutate(value);
    const path = await writeConfiguration(value);
    await expect(loadConfiguration(path)).rejects.toThrow(/validation|invalid|unknown/i);
  });

  it("rejects a graph with no reachable terminal behavior", async () => {
    const value = validConfiguration();
    const steps = workflow(value).steps as Record<string, unknown>;
    steps.work = { type: "agent", role: "worker", maxVisits: 1, onCompleted: "loop" };
    steps.loop = { type: "agent", role: "worker", maxVisits: 1, onCompleted: "work" };
    delete steps.passed;
    const path = await writeConfiguration(value);
    await expect(loadConfiguration(path)).rejects.toThrow(/no path to terminal behavior/);
  });
});

function validConfiguration(): Record<string, unknown> {
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
    profiles: {
      quick: { executable: "pnpm", args: ["test"] },
    },
  };
}

async function writeConfiguration(value: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-config-test-"));
  await mkdir(join(root, "prompts"));
  await writeFile(join(root, "prompts", "worker.md"), "Stable role prompt.\n", "utf8");
  const path = join(root, "workflow.json");
  await writeFile(path, JSON.stringify(value), "utf8");
  return path;
}

function workflow(value: Record<string, unknown>): Record<string, unknown> {
  return value.workflow as Record<string, unknown>;
}

function agentStep(value: Record<string, unknown>): Record<string, unknown> {
  return (workflow(value).steps as Record<string, Record<string, unknown>>).work!;
}

function role(value: Record<string, unknown>): Record<string, unknown> {
  return (value.roles as Record<string, Record<string, unknown>>).worker!;
}
