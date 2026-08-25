import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { runController, type ControllerResult } from "../../src/application/controller.js";
import { SpawnCommandRunner } from "../../src/adapters/command-runner.js";
import { loadConfiguration, loadTask } from "../../src/adapters/config-loader.js";
import { LocalGitInspector } from "../../src/adapters/git-inspector.js";
import { JsonlTraceStore } from "../../src/adapters/trace-store.js";
import type { Configuration, WorkflowStep } from "../../src/domain/types.js";

const execFileAsync = promisify(execFile);
export const fakeCommandPath = resolve("test/fixtures/fake-command.mjs");

export interface Scenario {
  readonly root: string;
  readonly workspace: string;
  readonly stateDirectory: string;
  readonly runsRoot: string;
  readonly configPath: string;
  readonly taskPath: string;
}

export interface ScenarioOptions {
  readonly steps: Readonly<Record<string, WorkflowStep>>;
  readonly entryStepId?: string;
  readonly providerMode?: string;
  readonly providerExecutable?: string;
  readonly providerTimeoutMs?: number;
  readonly profiles?: Configuration["profiles"];
  readonly roles?: Configuration["roles"];
}

export async function createScenario(options: ScenarioOptions): Promise<Scenario> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-test-"));
  const workspace = join(root, "workspace");
  const configRoot = join(root, "configuration");
  const promptRoot = join(configRoot, "prompts");
  const stateDirectory = join(root, "fake-state");
  const runsRoot = join(root, "runs");
  const configPath = join(configRoot, "workflow.json");
  const taskPath = join(root, "task.md");
  await mkdir(workspace);
  await mkdir(promptRoot, { recursive: true });
  await writeFile(join(workspace, "seed.txt"), "seed\n", "utf8");
  await writeFile(join(workspace, ".gitignore"), "reports/\n", "utf8");
  await writeFile(taskPath, "Perform the deterministic test assignment exactly.\n", "utf8");

  const roles =
    options.roles ??
    ({
      implementer: { provider: "shared", promptPath: "prompts/implementer.md", allowedPathPrefixes: ["src/"] },
      reviewer: { provider: "shared", promptPath: "prompts/reviewer.md", allowedPathPrefixes: ["src/"] },
      verifier: { provider: "shared", promptPath: "prompts/verifier.md", allowedPathPrefixes: ["src/"] },
      repairer: { provider: "shared", promptPath: "prompts/repairer.md", allowedPathPrefixes: ["src/"] },
    } satisfies Configuration["roles"]);
  for (const role of Object.keys(roles)) {
    await writeFile(join(promptRoot, `${role}.md`), `Stable instructions for ${role}.\n`, "utf8");
  }

  const provider = {
    type: "command" as const,
    executable: options.providerExecutable ?? process.execPath,
    args: [fakeCommandPath, options.providerMode ?? "agent-log", stateDirectory],
    promptTransport: "stdin" as const,
    timeoutMs: options.providerTimeoutMs ?? 2_000,
  };
  const profiles =
    options.profiles ??
    ({
      quick: {
        executable: process.execPath,
        args: [fakeCommandPath, "gate-pass", stateDirectory, "quick"],
        timeoutMs: 2_000,
      },
      full: {
        executable: process.execPath,
        args: [fakeCommandPath, "gate-pass", stateDirectory, "full"],
        timeoutMs: 2_000,
      },
    } satisfies Configuration["profiles"]);
  const configuration: Configuration = {
    schemaVersion: 1,
    workflow: {
      id: "test-workflow",
      entryStepId: options.entryStepId ?? Object.keys(options.steps)[0] ?? "missing",
      steps: options.steps,
    },
    roles,
    providers: { shared: provider },
    profiles,
  };
  await writeFile(configPath, `${JSON.stringify(configuration, null, 2)}\n`, "utf8");

  await execFileAsync("git", ["init", "--quiet"], { cwd: workspace });
  await execFileAsync("git", ["config", "user.email", "tests@tsqh.local"], { cwd: workspace });
  await execFileAsync("git", ["config", "user.name", "TSQH Tests"], { cwd: workspace });
  await execFileAsync("git", ["add", "seed.txt", ".gitignore"], { cwd: workspace });
  await execFileAsync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: workspace });

  return { root, workspace, stateDirectory, runsRoot, configPath, taskPath };
}

export async function runScenario(scenario: Scenario): Promise<ControllerResult> {
  const loaded = await loadConfiguration(scenario.configPath);
  const task = await loadTask(scenario.taskPath);
  let timestamp = 0;
  return runController(
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
      createRunId: () => "deterministic-run",
      now: () => `2026-01-01T00:00:${String(timestamp++).padStart(2, "0")}.000Z`,
    },
  );
}

export async function readExecutionLog(scenario: Scenario): Promise<readonly string[]> {
  const content = await readFile(join(scenario.stateDirectory, "execution.log"), "utf8");
  return content.trim().split("\n");
}

export async function placeConfigurationInWorkspace(
  scenario: Scenario,
  mutate: (configuration: Record<string, unknown>) => void,
): Promise<Scenario> {
  const configuration = JSON.parse(await readFile(scenario.configPath, "utf8")) as Record<string, unknown>;
  mutate(configuration);
  const configPath = join(scenario.workspace, "workflow.json");
  await writeFile(configPath, `${JSON.stringify(configuration, null, 2)}\n`, "utf8");
  await cp(join(dirname(scenario.configPath), "prompts"), join(scenario.workspace, "prompts"), {
    recursive: true,
  });
  await execFileAsync("git", ["add", "workflow.json", "prompts"], { cwd: scenario.workspace });
  await execFileAsync("git", ["commit", "--quiet", "-m", "add protected configuration"], {
    cwd: scenario.workspace,
  });
  return { ...scenario, configPath };
}
