import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfigurationGraph } from "../domain/validation.js";
import type { Configuration } from "../domain/types.js";

const MAX_CONFIG_BYTES = 1_048_576;
const MAX_PROMPT_BYTES = 262_144;
const schemaPath = fileURLToPath(new URL("../../schemas/workflow.schema.json", import.meta.url));
let validatorPromise: Promise<ValidateFunction> | null = null;

export interface LoadedConfiguration {
  readonly configuration: Configuration;
  readonly configPath: string;
  readonly configRoot: string;
  readonly prompts: Readonly<Record<string, string>>;
  readonly promptPaths: readonly string[];
}

export async function loadConfiguration(inputPath: string): Promise<LoadedConfiguration> {
  const configPath = await realpath(resolve(inputPath));
  const configRoot = dirname(configPath);
  const bytes = await readBoundedFile(configPath, MAX_CONFIG_BYTES, "configuration");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(bytes, "configuration"));
  } catch (error) {
    throw new Error(`Configuration is not valid JSON: ${errorMessage(error)}`);
  }

  const validate = await getValidator();
  if (!validate(parsed)) {
    const details = (validate.errors ?? [])
      .map((error: ErrorObject) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
      .join("; ");
    throw new Error(`Configuration schema validation failed: ${details}`);
  }

  const configuration = deepFreeze(parsed as Configuration);
  validateConfigurationGraph(configuration);
  const prompts: Record<string, string> = {};
  const promptPaths: string[] = [];
  for (const [roleId, role] of Object.entries(configuration.roles)) {
    const lexicalPath = resolve(configRoot, role.promptPath);
    assertBeneath(configRoot, lexicalPath, `Prompt path for role '${roleId}'`);
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
    promptPaths: Object.freeze([...new Set(promptPaths)].sort()),
  };
}

export async function loadTask(taskPathInput: string): Promise<{ readonly path: string; readonly content: string }> {
  const taskPath = await realpath(resolve(taskPathInput));
  const bytes = await readBoundedFile(taskPath, MAX_CONFIG_BYTES, "task");
  return { path: taskPath, content: decodeUtf8(bytes, "task") };
}

async function getValidator(): Promise<ValidateFunction> {
  validatorPromise ??= readFile(schemaPath, "utf8").then((schemaText) => {
    const schema = JSON.parse(schemaText) as object;
    const ajv = new Ajv({ allErrors: true, strict: true });
    return ajv.compile(schema);
  });
  return validatorPromise;
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
  if (difference === "" || (!difference.startsWith(`..${sep}`) && difference !== ".." && !isAbsolute(difference))) {
    return;
  }
  throw new Error(`${label} escapes the configuration root.`);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
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
