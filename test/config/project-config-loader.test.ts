import { chmod, cp, mkdtemp, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadRunConfiguration } from "../../src/adapters/config-loader.js";
import { evaluateTypescriptConfiguration } from "../../src/adapters/typescript-config-evaluator.js";

describe("project configuration discovery", () => {
  it("uses the frozen built-in default when tsqh.config.ts is absent", async () => {
    const workspace = await temporaryWorkspace();
    const loaded = await loadRunConfiguration({ workspacePath: workspace });

    expect(loaded.configPath).toBeNull();
    expect(loaded.configRoot).toBe(resolve(workspace));
    expect(loaded.promptPaths).toEqual([]);
    expect(Object.keys(loaded.configuration.workflow.steps)).toEqual([
      "implement",
      "quick",
      "coverage",
      "crap",
      "knip",
      "mutation",
      "sonar",
      "repair",
      "passed",
    ]);
    expect(loaded.prompts).toHaveProperty("implementer");
    expect(Object.keys(loaded.prompts)).toEqual(["implementer"]);
    expect(Object.isFrozen(loaded.configuration)).toBe(true);
    expect(Object.isFrozen(loaded.configuration.workflow.steps)).toBe(true);
  });

  it("discovers a typed partial object and omits its disabled stage", async () => {
    const workspace = await temporaryWorkspace();
    const configPath = await writeProjectConfiguration(workspace, `
      export default {
        quality: { sonar: false },
      } satisfies { quality: { sonar: boolean } };
    `);

    const loaded = await loadRunConfiguration({ workspacePath: workspace });

    expect(loaded.configPath).toBe(configPath);
    expect(loaded.configuration.workflow.steps.sonar).toBeUndefined();
    expect(loaded.configuration.profiles.sonar).toBeUndefined();
    expect(loaded.configuration.workflow.steps.mutation).toMatchObject({ onPassed: "passed" });
  });

  it("treats an empty discovered object as the unchanged default", async () => {
    const workspace = await temporaryWorkspace();
    await writeProjectConfiguration(workspace, "export default {};\n");
    const discovered = await loadRunConfiguration({ workspacePath: workspace });
    const absent = await loadRunConfiguration({ workspacePath: await temporaryWorkspace() });

    expect(discovered.configuration).toEqual(absent.configuration);
    expect(discovered.prompts).toEqual(absent.prompts);
  });

  it("does not search parent directories or discover legacy JSON", async () => {
    const parent = await temporaryWorkspace();
    await writeProjectConfiguration(parent, "export default { quality: { sonar: false } };\n");
    const child = join(parent, "child");
    await mkdir(child);
    await writeFile(join(child, "workflow.json"), "{ invalid", "utf8");

    const loaded = await loadRunConfiguration({ workspacePath: child });

    expect(loaded.configuration.workflow.steps.sonar).toBeDefined();
  });

  it("loads an explicit tsqh.config.ts outside the candidate workspace", async () => {
    const workspace = await temporaryWorkspace();
    const configurationRoot = await temporaryWorkspace();
    const configPath = await writeProjectConfiguration(
      configurationRoot,
      "export default { quality: { sonar: false } };\n",
    );

    const loaded = await loadRunConfiguration({
      workspacePath: workspace,
      explicitConfigPath: configPath,
    });

    expect(loaded.configPath).toBe(configPath);
    expect(loaded.configRoot).toBe(resolve(workspace));
    expect(loaded.configuration.workflow.steps.sonar).toBeUndefined();
  });

  it("loads a discovered complete workflow and resolves prompts from its configuration root", async () => {
    const workspace = await temporaryWorkspace();
    await writeCompleteTypescriptConfiguration(workspace, completeWorkflow());

    const loaded = await loadRunConfiguration({ workspacePath: workspace });
    const canonicalWorkspace = await realpath(workspace);

    expect(loaded.configuration.workflow.id).toBe("typescript-complete");
    expect(loaded.configRoot).toBe(canonicalWorkspace);
    expect(loaded.prompts.worker).toBe("Complete TypeScript worker prompt.\n");
    expect(loaded.promptPaths).toEqual([join(canonicalWorkspace, "prompts", "worker.md")]);
  });

  it("loads provider, role, and step selections from complete TypeScript configuration", async () => {
    const workspace = await temporaryWorkspace();
    const configuration = completeWorkflow();
    const workflow = configuration.workflow as Record<string, unknown>;
    const steps = workflow.steps as Record<string, Record<string, unknown>>;
    const roles = configuration.roles as Record<string, Record<string, unknown>>;
    const providers = configuration.providers as Record<string, Record<string, unknown>>;
    steps.work!.model = "step-model";
    roles.worker!.effort = "role-effort";
    providers.local!.model = "provider-model";
    providers.local!.effort = "provider-effort";
    providers.local!.args = ["run", "{model}", "{effort}"];
    await writeCompleteTypescriptConfiguration(workspace, configuration);

    const loaded = await loadRunConfiguration({ workspacePath: workspace });

    expect(loaded.configuration.workflow.steps.work).toMatchObject({ model: "step-model" });
    expect(loaded.configuration.roles.worker).toMatchObject({ effort: "role-effort" });
    expect(loaded.configuration.providers.local).toMatchObject({
      model: "provider-model",
      effort: "provider-effort",
    });
  });

  it("loads an explicit complete tsqh.config.ts outside the candidate workspace", async () => {
    const workspace = await temporaryWorkspace();
    const configurationRoot = await temporaryWorkspace();
    const configPath = await writeCompleteTypescriptConfiguration(
      configurationRoot,
      completeWorkflow(),
    );

    const loaded = await loadRunConfiguration({
      workspacePath: workspace,
      explicitConfigPath: configPath,
    });

    expect(loaded.configuration.workflow.id).toBe("typescript-complete");
    expect(loaded.configRoot).toBe(await realpath(configurationRoot));
    expect(loaded.prompts.worker).toBe("Complete TypeScript worker prompt.\n");
  });

  it("loads a default-exported Swarm Forge workflow object equivalently", async () => {
    const jsonPath = resolve("workflows/swarm-forge/workflow.json");
    const jsonSource = await readFile(jsonPath, "utf8");
    const configurationRoot = await temporaryWorkspace();
    await cp(resolve("workflows/swarm-forge/prompts"), join(configurationRoot, "prompts"), {
      recursive: true,
    });
    const typescriptPath = await writeProjectConfiguration(
      configurationRoot,
      `export default ${jsonSource.trim()};\n`,
    );

    const [json, typescript] = await Promise.all([
      loadRunConfiguration({ workspacePath: configurationRoot, explicitConfigPath: jsonPath }),
      loadRunConfiguration({ workspacePath: configurationRoot, explicitConfigPath: typescriptPath }),
    ]);

    expect(typescript.configuration).toEqual(json.configuration);
    expect(typescript.prompts).toEqual(json.prompts);
    expect(typescript.configuration.workflow.id).toBe("swarm-forge");
  });

  it("does not forward a configured Sonar credential to TypeScript policy", async () => {
    const workspace = await temporaryWorkspace();
    await writeProjectConfiguration(workspace, `
      export default {
        quality: { sonar: process.env.SONAR_TOKEN !== undefined },
      };
    `);
    const previous = process.env.SONAR_TOKEN;
    process.env.SONAR_TOKEN = "must-not-reach-project-configuration";
    try {
      const loaded = await loadRunConfiguration({ workspacePath: workspace });
      expect(loaded.configuration.workflow.steps.sonar).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.SONAR_TOKEN;
      else process.env.SONAR_TOKEN = previous;
    }
  });

  it("applies configuration byte and UTF-8 limits before evaluation", async () => {
    const oversizedWorkspace = await temporaryWorkspace();
    await writeFile(
      join(oversizedWorkspace, "tsqh.config.ts"),
      Buffer.alloc(1_048_577, 32),
    );
    await expect(loadRunConfiguration({ workspacePath: oversizedWorkspace })).rejects.toThrow(
      "The configuration exceeds the 1048576 byte limit",
    );

    const invalidWorkspace = await temporaryWorkspace();
    await writeFile(join(invalidWorkspace, "tsqh.config.ts"), Buffer.from([0xff]));
    await expect(loadRunConfiguration({ workspacePath: invalidWorkspace })).rejects.toThrow(
      "The configuration is not valid UTF-8",
    );
  });

  it.each([
    [
      "unknown root property",
      "export default { surprise: true };",
      "Project configuration schema validation failed: / must NOT have additional properties",
    ],
    ["unknown quality property", "export default { quality: { lint: false } };", "must NOT have additional properties"],
    ["wrong quality value", "export default { quality: { sonar: 'no' } };", "must be boolean"],
    ["non-object export", "export default 'invalid';", "must be object"],
    ["array export", "export default [];", "must be object"],
  ])("rejects %s", async (_name, source, message) => {
    const workspace = await temporaryWorkspace();
    await writeProjectConfiguration(workspace, source);

    await expect(loadRunConfiguration({ workspacePath: workspace })).rejects.toThrow(message);
  });

  it.each([
    ["a missing default export", "export const value = {};"],
    ["a function", "export default () => ({});"],
    ["a class instance", "export default new (class ProjectConfiguration {})();"],
    ["an accessor", "export default { get quality() { return {}; } };"],
    ["a cycle", "const value = {}; value.self = value; export default value;"],
    ["an array subclass", "export default new (class Configuration extends Array {})();"],
    ["a sparse array", "export default Array(1);"],
    [
      "an array accessor",
      "const value = []; Object.defineProperty(value, '0', { enumerable: true, get() { return 1; } }); export default value;",
    ],
    ["a non-index array property", "const value = []; value.extra = true; export default value;"],
    ["an array cycle", "const value = []; value.push(value); export default value;"],
    ["an undefined value", "export default { quality: undefined };"],
    ["a symbol value", "export default { quality: Symbol('invalid') };"],
    ["a bigint value", "export default { quality: 1n };"],
    ["a non-finite number", "export default { quality: Number.NaN };"],
    ["malformed TypeScript", "export default {"],
  ])("rejects %s before accepting an evaluator envelope", async (_name, source) => {
    const workspace = await temporaryWorkspace();
    await writeProjectConfiguration(workspace, source);

    await expect(loadRunConfiguration({ workspacePath: workspace })).rejects.toThrow(
      "TypeScript configuration evaluator exited with status",
    );
  });

  it("rejects standard output and standard error noise", async () => {
    const stdoutWorkspace = await temporaryWorkspace();
    await writeProjectConfiguration(
      stdoutWorkspace,
      "console.log('noise'); export default {};",
    );
    await expect(loadRunConfiguration({ workspacePath: stdoutWorkspace })).rejects.toThrow(
      "wrote unexpected standard output",
    );

    const spoofWorkspace = await temporaryWorkspace();
    await writeProjectConfiguration(
      spoofWorkspace,
      `process.stdout.write('{"schemaVersion":1,"configuration":{}}'); process.exit(0); export default {};`,
    );
    await expect(loadRunConfiguration({ workspacePath: spoofWorkspace })).rejects.toThrow(
      "wrote unexpected standard output",
    );

    const whitespaceWorkspace = await temporaryWorkspace();
    await writeProjectConfiguration(
      whitespaceWorkspace,
      "process.stdout.write('\\n'); export default {};",
    );
    await expect(loadRunConfiguration({ workspacePath: whitespaceWorkspace })).rejects.toThrow(
      "wrote unexpected standard output",
    );

    const stderrWorkspace = await temporaryWorkspace();
    await writeProjectConfiguration(
      stderrWorkspace,
      "console.error('noise'); export default {};",
    );
    await expect(loadRunConfiguration({ workspacePath: stderrWorkspace })).rejects.toThrow(
      "wrote unexpected standard error output",
    );
  });

  it.each([
    "null",
    '"text"',
    "[]",
    "{}",
    '{"schemaVersion":2,"configuration":{}}',
    '{"schemaVersion":1,"other":{}}',
    '{"schemaVersion":1,"configuration":{},"extra":true}',
  ])(
    "rejects malformed evaluator envelope %s",
    async (envelope) => {
      const workspace = await temporaryWorkspace();
      const configPath = await writeProjectConfiguration(workspace, "export default {};\n");
      const executable = await writeEvaluatorExecutable(workspace, envelope);

      await expect(evaluateTypescriptConfiguration(configPath, workspace, executable)).rejects.toThrow(
        "returned a malformed envelope",
      );
    },
  );

  it("rejects a non-canonical evaluator envelope", async () => {
    const workspace = await temporaryWorkspace();
    const configPath = await writeProjectConfiguration(workspace, "export default {};\n");
    const executable = await writeEvaluatorExecutable(
      workspace,
      ' {"schemaVersion":1,"configuration":{}}',
    );

    await expect(evaluateTypescriptConfiguration(configPath, workspace, executable)).rejects.toThrow(
      "output is not one exact JSON envelope",
    );
  });

  it("rejects evaluator output that is not JSON", async () => {
    const workspace = await temporaryWorkspace();
    const configPath = await writeProjectConfiguration(workspace, "export default {};\n");
    const executable = await writeEvaluatorExecutable(workspace, "not-json");

    await expect(evaluateTypescriptConfiguration(configPath, workspace, executable)).rejects.toThrow(
      "output is not one valid JSON envelope",
    );
  });

  it("clears the evaluator timeout after a normal exit", async () => {
    vi.useFakeTimers();
    try {
      const workspace = await temporaryWorkspace();
      const configPath = await writeProjectConfiguration(workspace, "export default {};\n");

      await expect(evaluateTypescriptConfiguration(configPath, workspace)).resolves.toEqual({});
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves a computed __proto__ property for strict schema rejection", async () => {
    const workspace = await temporaryWorkspace();
    await writeProjectConfiguration(
      workspace,
      "export default { ['__proto__']: { surprise: true } };\n",
    );

    await expect(loadRunConfiguration({ workspacePath: workspace })).rejects.toThrow(
      "Project configuration schema validation failed",
    );
  });

  it("uses schemaVersion as a fail-closed complete-workflow discriminator", async () => {
    const workspace = await temporaryWorkspace();
    await writeProjectConfiguration(
      workspace,
      "export default { schemaVersion: 2, quality: { sonar: false } };\n",
    );

    await expect(loadRunConfiguration({ workspacePath: workspace })).rejects.toThrow(
      "Configuration schema validation failed",
    );
  });

  it.each([
    [
      "a complete schema violation",
      { schemaVersion: 1, surprise: true },
      "Configuration schema validation failed",
    ],
    [
      "invalid complete graph semantics",
      (() => {
        const configuration = completeWorkflow();
        const workflow = configuration.workflow as Record<string, unknown>;
        const steps = workflow.steps as Record<string, Record<string, unknown>>;
        steps.work!.onCompleted = "missing";
        return configuration;
      })(),
      "onCompleted references unknown step 'missing'",
    ],
  ])("rejects %s from TypeScript", async (_name, configuration, message) => {
    const workspace = await temporaryWorkspace();
    await writeProjectConfiguration(
      workspace,
      `export default ${JSON.stringify(configuration)};\n`,
    );

    await expect(loadRunConfiguration({ workspacePath: workspace })).rejects.toThrow(message);
  });

  it("retains complete-workflow prompt containment for TypeScript configuration", async () => {
    const workspace = await temporaryWorkspace();
    const outside = await temporaryWorkspace();
    await writeFile(join(outside, "outside.md"), "Outside prompt.\n", "utf8");
    const configuration = completeWorkflow();
    const roles = configuration.roles as Record<string, Record<string, unknown>>;
    roles.worker!.promptPath = "prompts/worker.md";
    await mkdir(join(workspace, "prompts"));
    await symlink(join(outside, "outside.md"), join(workspace, "prompts", "worker.md"));
    await writeProjectConfiguration(
      workspace,
      `export default ${JSON.stringify(configuration)};\n`,
    );

    await expect(loadRunConfiguration({ workspacePath: workspace })).rejects.toThrow(
      "Prompt path for role 'worker' escapes the configuration root",
    );
  });

  it("reports an evaluator spawn error without exposing process output", async () => {
    const workspace = await temporaryWorkspace();
    const configPath = await writeProjectConfiguration(workspace, "export default {};\n");

    await expect(evaluateTypescriptConfiguration(
      configPath,
      workspace,
      join(workspace, "missing-node-executable"),
    )).rejects.toThrow("Unable to start the TypeScript configuration evaluator");
  });

  it("classifies nonzero, signal, oversized, and timed-out evaluation", async () => {
    const nonzeroWorkspace = await temporaryWorkspace();
    await writeProjectConfiguration(nonzeroWorkspace, "process.exit(7); export default {};");
    await expect(loadRunConfiguration({ workspacePath: nonzeroWorkspace })).rejects.toThrow(
      "exited with status 7",
    );

    const signalWorkspace = await temporaryWorkspace();
    await writeProjectConfiguration(
      signalWorkspace,
      "process.kill(process.pid, 'SIGTERM'); export default {};",
    );
    await expect(loadRunConfiguration({ workspacePath: signalWorkspace })).rejects.toThrow(
      "ended from signal 'SIGTERM'",
    );

    const oversizedWorkspace = await temporaryWorkspace();
    await writeProjectConfiguration(
      oversizedWorkspace,
      "process.stdout.write('x'.repeat(70000)); export default {};",
    );
    await expect(loadRunConfiguration({ workspacePath: oversizedWorkspace })).rejects.toThrow(
      "output exceeded the 65536 byte limit",
    );

    const timeoutWorkspace = await temporaryWorkspace();
    await writeProjectConfiguration(
      timeoutWorkspace,
      "await new Promise(() => setInterval(() => {}, 1000)); export default {};",
    );
    await expect(loadRunConfiguration({ workspacePath: timeoutWorkspace })).rejects.toThrow(
      "timed out after 5000 ms",
    );
  }, 10_000);

  it("does not fall back from a discovered directory or symbolic link", async () => {
    const directoryWorkspace = await temporaryWorkspace();
    await mkdir(join(directoryWorkspace, "tsqh.config.ts"));
    await expect(loadRunConfiguration({ workspacePath: directoryWorkspace })).rejects.toThrow(
      "The discovered configuration path is not a regular file",
    );

    const linkWorkspace = await temporaryWorkspace();
    const target = join(linkWorkspace, "target.ts");
    await writeFile(target, "export default {};\n", "utf8");
    await symlink(target, join(linkWorkspace, "tsqh.config.ts"));
    await expect(loadRunConfiguration({ workspacePath: linkWorkspace })).rejects.toThrow(
      "The discovered configuration path is not a regular file",
    );
  });

  it("does not treat a discovery filesystem error as an absent file", async () => {
    const invalidWorkspace = join(tmpdir(), "x".repeat(300));

    await expect(loadRunConfiguration({ workspacePath: invalidWorkspace })).rejects.toMatchObject({
      code: "ENAMETOOLONG",
    });
  });

  it("gives an explicit legacy JSON path precedence over discovery", async () => {
    const workspace = await temporaryWorkspace();
    await writeProjectConfiguration(workspace, "export default { surprise: true };\n");
    const explicitPath = await writeLegacyConfiguration(workspace);

    const loaded = await loadRunConfiguration({
      workspacePath: workspace,
      explicitConfigPath: explicitPath,
    });

    expect(loaded.configPath).toBe(explicitPath);
    expect(loaded.configuration.workflow.id).toBe("legacy");
  });

  it("rejects unsupported explicit extensions", async () => {
    const workspace = await temporaryWorkspace();
    await expect(loadRunConfiguration({
      workspacePath: workspace,
      explicitConfigPath: join(workspace, "workflow.yaml"),
    })).rejects.toThrow("must be a .json file or be named tsqh.config.ts");
  });
});

async function temporaryWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "tsqh-project-config-test-"));
}

async function writeProjectConfiguration(workspace: string, source: string): Promise<string> {
  const path = join(workspace, "tsqh.config.ts");
  await writeFile(path, source, "utf8");
  return realpath(path);
}

async function writeCompleteTypescriptConfiguration(
  workspace: string,
  configuration: Record<string, unknown>,
): Promise<string> {
  await mkdir(join(workspace, "prompts"));
  await writeFile(
    join(workspace, "prompts", "worker.md"),
    "Complete TypeScript worker prompt.\n",
    "utf8",
  );
  return writeProjectConfiguration(
    workspace,
    `export default ${JSON.stringify(configuration)};\n`,
  );
}

function completeWorkflow(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    workflow: {
      id: "typescript-complete",
      entryStepId: "work",
      steps: {
        work: { type: "agent", role: "worker", maxVisits: 1, onCompleted: "passed" },
        passed: { type: "terminal", outcome: "passed" },
      },
    },
    roles: {
      worker: {
        provider: "local",
        promptPath: "prompts/worker.md",
        allowedPathPrefixes: ["src/"],
      },
    },
    providers: {
      local: {
        type: "command",
        executable: "agent",
        args: ["run"],
        promptTransport: "stdin",
      },
    },
    profiles: {},
  };
}

async function writeLegacyConfiguration(workspace: string): Promise<string> {
  const promptRoot = join(workspace, "legacy-prompts");
  await mkdir(promptRoot);
  await writeFile(join(promptRoot, "worker.md"), "Stable worker prompt.\n", "utf8");
  const configuration = {
    schemaVersion: 1,
    workflow: {
      id: "legacy",
      entryStepId: "work",
      steps: {
        work: { type: "agent", role: "worker", maxVisits: 1, onCompleted: "passed" },
        passed: { type: "terminal", outcome: "passed" },
      },
    },
    roles: {
      worker: {
        provider: "local",
        promptPath: "legacy-prompts/worker.md",
        allowedPathPrefixes: ["src/"],
      },
    },
    providers: {
      local: { type: "command", executable: "agent", args: ["run"], promptTransport: "stdin" },
    },
    profiles: {},
  };
  const path = join(workspace, "workflow.json");
  await writeFile(path, `${JSON.stringify(configuration)}\n`, "utf8");
  return realpath(path);
}

async function writeEvaluatorExecutable(workspace: string, output: string): Promise<string> {
  const path = join(workspace, "controlled-evaluator.mjs");
  await writeFile(path, `#!${process.execPath}
import { writeFileSync } from "node:fs";
writeFileSync(3, ${JSON.stringify(output)});
`, "utf8");
  await chmod(path, 0o755);
  return path;
}
