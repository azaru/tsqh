import { mkdtemp, mkdir, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfiguration, loadTask } from "../../src/adapters/config-loader.js";

describe("strict configuration loading", () => {
  it("loads and freezes a valid independent configuration", async () => {
    const path = await writeConfiguration(validConfiguration());
    const loaded = await loadConfiguration(path);
    expect(loaded.configuration.workflow.entryStepId).toBe("work");
    expect(loaded.prompts.worker).toContain("Stable role");
    expect(Object.isFrozen(loaded.configuration)).toBe(true);
    expect(Object.isFrozen(loaded.configuration.workflow.steps)).toBe(true);
    expect(Object.isFrozen(loaded.configuration.roles.worker!.allowedPathPrefixes)).toBe(true);
    expect(Object.isFrozen(loaded.prompts)).toBe(true);
    expect(Object.isFrozen(loaded.promptPaths)).toBe(true);
  });

  it("loads provider, role, and agent-step model and effort selections", async () => {
    const value = validConfiguration();
    const step = agentStep(value);
    const worker = role(value);
    const providers = value.providers as Record<string, Record<string, unknown>>;
    const local = providers.local!;
    local.args = ["run", "--model", "{model}", "--effort={effort}"];
    local.model = "provider-model";
    local.effort = "provider-effort";
    worker.model = "role-model";
    worker.effort = "role-effort";
    step.model = "step-model";
    step.effort = "step-effort";

    const loaded = await loadConfiguration(await writeConfiguration(value));

    expect(loaded.configuration.workflow.steps.work).toMatchObject({
      model: "step-model",
      effort: "step-effort",
    });
    expect(loaded.configuration.roles.worker).toMatchObject({
      model: "role-model",
      effort: "role-effort",
    });
    expect(loaded.configuration.providers.local).toMatchObject({
      model: "provider-model",
      effort: "provider-effort",
    });
  });

  it("reports malformed JSON and schema details exactly", async () => {
    const malformed = await writeRawConfiguration(Buffer.from("{"));
    await expect(loadConfiguration(malformed)).rejects.toThrow(
      /^Configuration is not valid JSON: /u,
    );

    const value = validConfiguration();
    value.surprise = true;
    const invalid = await writeConfiguration(value);
    await expect(loadConfiguration(invalid)).rejects.toThrow(
      "Configuration schema validation failed: / must NOT have additional properties",
    );

    value.schemaVersion = 2;
    const invalidTwice = await writeConfiguration(value);
    await expect(loadConfiguration(invalidTwice)).rejects.toThrow(
      "Configuration schema validation failed: / must NOT have additional properties; /schemaVersion must be equal to constant",
    );
  });

  it("returns unique prompt paths in deterministic order", async () => {
    const value = validConfiguration();
    value.roles = {
      zebra: roleConfiguration("prompts/zebra.md"),
      alpha: roleConfiguration("prompts/alpha.md"),
      duplicate: roleConfiguration("prompts/alpha.md"),
    };
    agentStep(value).role = "zebra";
    const path = await writeConfiguration(value);
    const root = dirname(path);
    await writeFile(join(root, "prompts", "zebra.md"), "Zebra prompt.", "utf8");
    await writeFile(join(root, "prompts", "alpha.md"), "Alpha prompt.", "utf8");

    const loaded = await loadConfiguration(path);

    expect(loaded.prompts).toEqual({
      zebra: "Zebra prompt.",
      alpha: "Alpha prompt.",
      duplicate: "Alpha prompt.",
    });
    expect(loaded.promptPaths).toEqual([
      join(loaded.configRoot, "prompts", "alpha.md"),
      join(loaded.configRoot, "prompts", "zebra.md"),
    ]);
  });

  it("accepts exact configuration and prompt byte limits", async () => {
    const value = validConfiguration();
    const configuration = padJson(value, 1_048_576);
    const path = await writeRawConfiguration(configuration, Buffer.alloc(262_144, 120));

    const loaded = await loadConfiguration(path);

    expect(loaded.prompts.worker).toHaveLength(262_144);
  });

  it("rejects oversized configuration and prompt files", async () => {
    const oversizedConfiguration = await writeRawConfiguration(Buffer.alloc(1_048_577, 32));
    await expect(loadConfiguration(oversizedConfiguration)).rejects.toThrow(
      "The configuration exceeds the 1048576 byte limit.",
    );

    const oversizedPrompt = await writeConfiguration(validConfiguration(), Buffer.alloc(262_145));
    await expect(loadConfiguration(oversizedPrompt)).rejects.toThrow(
      "The prompt for role 'worker' exceeds the 262144 byte limit.",
    );
  });

  it("rejects non-file configuration and prompt paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-config-directory-test-"));
    const canonicalRoot = await realpath(root);
    await expect(loadConfiguration(root)).rejects.toThrow(
      `The configuration path is not a regular file: ${canonicalRoot}`,
    );

    const path = await writeConfiguration(validConfiguration());
    const promptPath = join(dirname(path), "prompts", "worker.md");
    await unlink(promptPath);
    await mkdir(promptPath);
    const canonicalPromptPath = join(await realpath(dirname(path)), "prompts", "worker.md");
    await expect(loadConfiguration(path)).rejects.toThrow(
      `The prompt for role 'worker' path is not a regular file: ${canonicalPromptPath}`,
    );
  });

  it("rejects invalid UTF-8 in configuration and prompt files", async () => {
    const invalidConfiguration = await writeRawConfiguration(Buffer.from([0xff]));
    await expect(loadConfiguration(invalidConfiguration)).rejects.toThrow(
      "The configuration is not valid UTF-8.",
    );

    const invalidPrompt = await writeConfiguration(validConfiguration(), Buffer.from([0xff]));
    await expect(loadConfiguration(invalidPrompt)).rejects.toThrow(
      "The prompt for role 'worker' is not valid UTF-8.",
    );
  });

  it.each([
    ["its parent", async (root: string) => dirname(root)],
    ["a sibling file", async () => {
      const outside = join(await mkdtemp(join(tmpdir(), "tsqh-outside-prompt-")), "outside.md");
      await writeFile(outside, "Outside.", "utf8");
      return outside;
    }],
  ])("rejects a prompt symlink resolving to %s", async (_name, target) => {
    const path = await writeConfiguration(validConfiguration());
    const root = dirname(path);
    const promptPath = join(root, "prompts", "worker.md");
    await unlink(promptPath);
    await symlink(await target(root), promptPath);

    await expect(loadConfiguration(path)).rejects.toThrow(
      "Prompt path for role 'worker' escapes the configuration root.",
    );
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
    ["model on a gate step", (value: Record<string, unknown>) => {
      const steps = workflow(value).steps as Record<string, Record<string, unknown>>;
      steps.work = {
        type: "gate",
        profile: "quick",
        model: "forbidden",
        maxVisits: 1,
        onPassed: "passed",
        onFailed: "passed",
      };
    }],
    ["invalid agent model", (value: Record<string, unknown>) => agentStep(value).model = " bad"],
    ["invalid role effort", (value: Record<string, unknown>) => role(value).effort = "bad effort"],
    ["invalid provider model", (value: Record<string, unknown>) => {
      const providers = value.providers as Record<string, Record<string, unknown>>;
      providers.local!.model = "-flag";
    }],
    ["unknown transition target", (value: Record<string, unknown>) => agentStep(value).onCompleted = "missing"],
    ["invalid profile environment key", (value: Record<string, unknown>) => {
      const profiles = value.profiles as Record<string, Record<string, unknown>>;
      profiles.quick!.environmentKeys = ["bad-key"];
    }],
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

describe("bounded task loading", () => {
  it("loads an exact-limit UTF-8 task by canonical path", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-task-test-"));
    const taskPath = join(root, "task.md");
    await writeFile(taskPath, Buffer.alloc(1_048_576, 120));

    const task = await loadTask(taskPath);
    expect(task.path).toBe(await realpath(taskPath));
    expect(task.content).toHaveLength(1_048_576);
    expect(task.content).toMatch(/^x+$/u);
  });

  it("rejects oversized, non-file, and invalid UTF-8 tasks", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-task-invalid-test-"));
    const oversized = join(root, "oversized.md");
    const invalid = join(root, "invalid.md");
    await writeFile(oversized, Buffer.alloc(1_048_577));
    await writeFile(invalid, Buffer.from([0xff]));
    const canonicalRoot = await realpath(root);

    await expect(loadTask(oversized)).rejects.toThrow(
      "The task exceeds the 1048576 byte limit.",
    );
    await expect(loadTask(root)).rejects.toThrow(
      `The task path is not a regular file: ${canonicalRoot}`,
    );
    await expect(loadTask(invalid)).rejects.toThrow("The task is not valid UTF-8.");
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

async function writeConfiguration(
  value: unknown,
  prompt: string | Uint8Array = "Stable role prompt.\n",
): Promise<string> {
  return writeRawConfiguration(Buffer.from(JSON.stringify(value)), prompt);
}

async function writeRawConfiguration(
  configuration: Uint8Array,
  prompt: string | Uint8Array = "Stable role prompt.\n",
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-config-test-"));
  await mkdir(join(root, "prompts"));
  await writeFile(join(root, "prompts", "worker.md"), prompt);
  const path = join(root, "workflow.json");
  await writeFile(path, configuration);
  return path;
}

function padJson(value: unknown, bytes: number): Buffer {
  const json = Buffer.from(JSON.stringify(value));
  return Buffer.concat([json, Buffer.alloc(bytes - json.byteLength, 32)]);
}

function roleConfiguration(promptPath: string): Record<string, unknown> {
  return { provider: "local", promptPath, allowedPathPrefixes: ["src/"] };
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
