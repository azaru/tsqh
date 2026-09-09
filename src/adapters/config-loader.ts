import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILT_IN_PROMPTS } from "../application/default-prompts.js";
import { compareStrings } from "../domain/order.js";
import {
  expandProjectConfiguration,
  type TsqhProjectConfiguration,
} from "../application/default-project-configuration.js";
import { validateConfigurationGraph } from "../domain/validation.js";
import type { Configuration } from "../domain/types.js";
import { evaluateTypescriptConfiguration } from "./typescript-config-evaluator.js";

const MAX_CONFIG_BYTES = 1_048_576;
const MAX_PROMPT_BYTES = 262_144;
const workflowSchemaPath = fileURLToPath(new URL("../../schemas/workflow.schema.json", import.meta.url));
const projectSchemaPath = fileURLToPath(new URL("../../schemas/project-config.schema.json", import.meta.url));

export interface LoadedConfiguration {
  readonly configuration: Configuration;
  readonly configPath: string | null;
  readonly configRoot: string;
  readonly prompts: Readonly<Record<string, string>>;
  readonly promptPaths: readonly string[];
}

export interface RunConfigurationInput {
  readonly workspacePath: string;
  readonly explicitConfigPath?: string;
}

export async function loadRunConfiguration(
  input: RunConfigurationInput,
): Promise<LoadedConfiguration> {
  if (input.explicitConfigPath !== undefined) {
    return loadExplicitConfiguration(input.explicitConfigPath, input.workspacePath);
  }

  const discoveredPath = resolve(input.workspacePath, "tsqh.config.ts");
  let details;
  try {
    details = await lstat(discoveredPath);
  } catch (error) {
    if (isMissingPath(error)) {
      return loadBuiltInConfiguration({}, input.workspacePath, null);
    }
    throw error;
  }
  if (!details.isFile()) {
    throw new Error(`The discovered configuration path is not a regular file: ${discoveredPath}`);
  }
  return loadTypescriptConfiguration(discoveredPath, input.workspacePath);
}

export async function loadConfiguration(inputPath: string): Promise<LoadedConfiguration> {
  const configPath = await realpath(resolve(inputPath));
  const bytes = await readBoundedFile(configPath, MAX_CONFIG_BYTES, "configuration");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(bytes, "configuration"));
  } catch (error) {
    throw new Error(`Configuration is not valid JSON: ${errorMessage(error)}`);
  }
  return loadCompleteConfiguration(parsed, configPath);
}

async function loadExplicitConfiguration(
  inputPath: string,
  workspacePath: string,
): Promise<LoadedConfiguration> {
  if (extname(inputPath) === ".json") {
    return loadConfiguration(inputPath);
  }
  if (basename(inputPath) === "tsqh.config.ts") {
    return loadTypescriptConfiguration(inputPath, workspacePath);
  }
  throw new Error("Configuration path must be a .json file or be named tsqh.config.ts.");
}

async function loadTypescriptConfiguration(
  inputPath: string,
  workspacePath: string,
): Promise<LoadedConfiguration> {
  const configPath = await realpath(resolve(inputPath));
  const bytes = await readBoundedFile(configPath, MAX_CONFIG_BYTES, "configuration");
  decodeUtf8(bytes, "configuration");
  const parsed = await evaluateTypescriptConfiguration(configPath, resolve(workspacePath));
  if (hasSchemaVersion(parsed)) {
    return loadCompleteConfiguration(parsed, configPath);
  }
  const project = await validateProjectConfiguration(parsed);
  return loadBuiltInConfiguration(project, workspacePath, configPath);
}

async function loadCompleteConfiguration(
  parsed: unknown,
  configPath: string,
): Promise<LoadedConfiguration> {
  const configRoot = dirname(configPath);
  const configuration = await validateCompleteConfiguration(parsed);
  const prompts: Record<string, string> = {};
  const promptPaths: string[] = [];
  for (const [roleId, role] of Object.entries(configuration.roles)) {
    const lexicalPath = resolve(configRoot, role.promptPath);
    const promptPath = await realpath(lexicalPath);
    assertBeneath(configRoot, promptPath, `Prompt path for role '${roleId}'`);
    const promptBytes = await readBoundedFile(promptPath, MAX_PROMPT_BYTES, `prompt for role '${roleId}'`);
    prompts[roleId] = decodeUtf8(promptBytes, `prompt for role '${roleId}'`);
    promptPaths.push(promptPath);
  }

  return {
    configuration,
    configPath,
    configRoot,
    prompts: Object.freeze(prompts),
    promptPaths: Object.freeze([...new Set(promptPaths)].sort(compareStrings)),
  };
}

async function loadBuiltInConfiguration(
  project: TsqhProjectConfiguration,
  workspacePath: string,
  configPath: string | null,
): Promise<LoadedConfiguration> {
  const configuration = await validateCompleteConfiguration(expandProjectConfiguration(project));
  const prompts: Record<string, string> = {};
  for (const roleId of Object.keys(configuration.roles)) {
    prompts[roleId] = BUILT_IN_PROMPTS[roleId as keyof typeof BUILT_IN_PROMPTS];
  }
  return {
    configuration,
    configPath,
    configRoot: resolve(workspacePath),
    prompts: Object.freeze(prompts),
    promptPaths: Object.freeze([]),
  };
}

export async function loadTask(taskPathInput: string): Promise<{ readonly path: string; readonly content: string }> {
  const taskPath = await realpath(resolve(taskPathInput));
  const bytes = await readBoundedFile(taskPath, MAX_CONFIG_BYTES, "task");
  return { path: taskPath, content: decodeUtf8(bytes, "task") };
}

async function validateCompleteConfiguration(parsed: unknown): Promise<Configuration> {
  const validate = await getValidator(workflowSchemaPath);
  assertSchema(validate, parsed, "Configuration");
  const configuration = deepFreeze(parsed as Configuration);
  validateConfigurationGraph(configuration);
  return configuration;
}

async function validateProjectConfiguration(parsed: unknown): Promise<TsqhProjectConfiguration> {
  const validate = await getValidator(projectSchemaPath);
  assertSchema(validate, parsed, "Project configuration");
  return deepFreeze(parsed as TsqhProjectConfiguration);
}

function assertSchema(validate: ValidateFunction, value: unknown, label: string): void {
  if (validate(value)) return;
  const details = (validate.errors ?? [])
    .map((error: ErrorObject) => `${error.instancePath || "/"} ${String(error.message)}`)
    .join("; ");
  throw new Error(`${label} schema validation failed: ${details}`);
}

async function getValidator(path: string): Promise<ValidateFunction> {
  const schema = JSON.parse(await readFile(path, "utf8")) as object;
  return new Ajv({ allErrors: true }).compile(schema);
}

async function readBoundedFile(path: string, maximumBytes: number, label: string): Promise<Buffer> {
  const details = await stat(path);
  if (!details.isFile()) {
    throw new Error(`The ${label} path is not a regular file: ${path}`);
  }
  if (details.size > maximumBytes) {
    throw new Error(`The ${label} exceeds the ${String(maximumBytes)} byte limit.`);
  }
  return readFile(path);
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`The ${label} is not valid UTF-8.`);
  }
}

function assertBeneath(root: string, candidate: string, label: string): void {
  const difference = relative(root, candidate);
  if (difference === ".." || difference.startsWith(`..${sep}`) || isAbsolute(difference)) {
    throw new Error(`${label} escapes the configuration root.`);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function hasSchemaVersion(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.hasOwn(value, "schemaVersion");
}
