import { join, resolve } from "node:path";
import { validateCoverage } from "./coverage.js";
import {
  EvidenceError,
  isRecord,
  parseJsonObject,
  readFreshEvidence,
} from "./evidence.js";

const REQUIRED_PROPERTIES = {
  "sonar.sources": "src",
  "sonar.tests": "test",
  "sonar.sourceEncoding": "UTF-8",
  "sonar.javascript.lcov.reportPaths": "coverage/lcov.info",
  "sonar.exclusions": "dist/**,coverage/**,reports/**,.scannerwork/**,.stryker-tmp/**",
  "sonar.qualitygate.wait": "true",
  "sonar.qualitygate.timeout": "300",
  "sonar.qualitygate.ignoreSmallChanges": "false",
} as const;

const REQUIRED_CONDITIONS = {
  violations: ["GT", "0"],
  new_violations: ["GT", "0"],
  security_hotspots_reviewed: ["LT", "100"],
  new_security_hotspots_reviewed: ["LT", "100"],
  coverage: ["LT", "90"],
  new_coverage: ["LT", "90"],
  duplicated_lines_density: ["GT", "3"],
  new_duplicated_lines_density: ["GT", "3"],
} as const;

const MAIN_BRANCH = "main";

export interface SonarEnvironment {
  readonly SONAR_HOST_URL?: string;
  readonly SONAR_ORGANIZATION?: string;
  readonly SONAR_TOKEN?: string;
}

export interface SonarPreflight {
  readonly coverageDigest: string;
  readonly expectedPolicy: SonarPolicyIdentity;
  readonly hostUrl: string;
  readonly organization: string | null;
  readonly projectKey: string;
}

export async function validateSonarPreflight(
  workspacePath: string,
  environment: SonarEnvironment,
): Promise<SonarPreflight> {
  const workspace = resolve(workspacePath);
  const token = requiredSecret(environment.SONAR_TOKEN, "SONAR_TOKEN");
  const hostUrl = normalizedHostUrl(environment.SONAR_HOST_URL);
  const propertiesEvidence = await readFreshEvidence(
    join(workspace, "sonar-project.properties"),
    "Sonar configuration",
    0,
  );
  if (propertiesEvidence.content.includes(token)) {
    throw new EvidenceError("Sonar configuration contains SONAR_TOKEN.");
  }
  const properties = parseProperties(propertiesEvidence.content);
  validateRequiredProperties(properties);
  const policyEvidence = await readFreshEvidence(
    join(workspace, "sonar-policy.json"),
    "Sonar policy identity",
    0,
  );
  if (policyEvidence.content.includes(token)) {
    throw new EvidenceError("Sonar policy identity contains SONAR_TOKEN.");
  }
  const policy = validatePolicyFile(
    parseJsonObject(policyEvidence.content, "Sonar policy identity"),
  );
  const target = validateSonarTarget(properties, environment, hostUrl, policy);
  const coverage = await validateCoverage({ workspace, invocationStartedAtMs: 0 });
  return {
    coverageDigest: coverage.lcovDigest,
    expectedPolicy: {
      newCodeDefinition: policy.newCodeDefinition,
      qualityGate: policy.qualityGate,
      typescriptProfile: policy.typescriptProfile,
    },
    hostUrl,
    ...target,
  };
}

function validateRequiredProperties(properties: Readonly<Record<string, string>>): void {
  for (const [key, expected] of Object.entries(REQUIRED_PROPERTIES)) {
    if (properties[key] !== expected) {
      throw new EvidenceError(`Sonar property ${key} must be '${expected}'.`);
    }
  }
  for (const key of Object.keys(properties)) {
    if (/(?:token|password|secret|login)/iu.test(key)) {
      throw new EvidenceError(`Sonar configuration contains secret-bearing property ${key}.`);
    }
  }
}

function validateSonarTarget(
  properties: Readonly<Record<string, string>>,
  environment: SonarEnvironment,
  hostUrl: string,
  policy: SonarPolicyFile,
): Pick<SonarPreflight, "organization" | "projectKey"> {
  const projectKey = properties["sonar.projectKey"];
  if (projectKey === undefined || !/^[A-Za-z0-9_.:-]{1,400}$/u.test(projectKey)) {
    throw new EvidenceError("Sonar property sonar.projectKey is missing or invalid.");
  }
  const configuredOrganization = properties["sonar.organization"] ?? null;
  const environmentOrganization = environment.SONAR_ORGANIZATION ?? null;
  if (configuredOrganization !== environmentOrganization) {
    throw new EvidenceError("SONAR_ORGANIZATION does not match sonar.organization.");
  }
  requireEqual(policy.hostUrl, hostUrl, "Sonar approved host URL");
  requireEqual(policy.projectKey, projectKey, "Sonar approved project key");
  requireEqual(policy.organization, configuredOrganization, "Sonar approved organization");
  return { organization: configuredOrganization, projectKey };
}

interface SonarPolicyFile extends SonarPolicyIdentity {
  readonly schemaVersion: 1;
  readonly hostUrl: string;
  readonly organization: string | null;
  readonly projectKey: string;
}

function validatePolicyFile(value: Record<string, unknown>): SonarPolicyFile {
  const expectedKeys = [
    "schemaVersion",
    "hostUrl",
    "projectKey",
    "organization",
    "qualityGate",
    "typescriptProfile",
    "newCodeDefinition",
  ];
  const actualKeys = Object.keys(value);
  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !actualKeys.includes(key))
  ) {
    throw new EvidenceError("Sonar policy identity has missing or unknown properties.");
  }
  if (value.schemaVersion !== 1) {
    throw new EvidenceError("Sonar policy identity schemaVersion must be 1.");
  }
  const hostUrl = normalizedHostUrl(value.hostUrl);
  const projectKey = requiredString(value.projectKey, "Sonar policy project key");
  if (!/^[A-Za-z0-9_.:-]{1,400}$/u.test(projectKey)) {
    throw new EvidenceError("Sonar policy project key is invalid.");
  }
  const organization = optionalString(value.organization, "Sonar policy organization");
  return {
    schemaVersion: 1,
    hostUrl,
    projectKey,
    organization,
    qualityGate: requiredString(value.qualityGate, "Sonar policy quality gate"),
    typescriptProfile: requiredString(value.typescriptProfile, "Sonar policy TypeScript profile"),
    newCodeDefinition: requiredString(value.newCodeDefinition, "Sonar policy new-code definition"),
  };
}

type SonarProcessKind = "exited" | "spawn-error" | "timeout" | "signal";

interface SonarProcessResult {
  readonly kind: SonarProcessKind;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SonarPolicyIdentity {
  readonly newCodeDefinition: string;
  readonly qualityGate: string;
  readonly typescriptProfile: string;
}

export interface SonarTaskIdentity {
  readonly digest: string;
  readonly taskId: string;
  readonly taskUrl: string;
}

export interface SonarPolicyResponses {
  readonly newCodePeriod: unknown;
  readonly qualityGateAssignment: unknown;
  readonly qualityGateDefinition: unknown;
  readonly qualityProfiles: unknown;
}

export interface SonarResultOptions {
  readonly workspace: string;
  readonly invocationStartedAtMs: number;
  readonly hostUrl: string;
  readonly projectKey: string;
  readonly token: string;
  readonly process: SonarProcessResult;
  readonly computeTaskResponse: unknown;
  readonly qualityGateResponse: unknown;
  readonly expectedPolicy: SonarPolicyIdentity;
  readonly remotePolicy: SonarPolicyIdentity;
}

export interface SonarValidation {
  readonly analysisId: string;
  readonly gateStatus: "OK";
  readonly redactedStderr: string;
  readonly redactedStdout: string;
  readonly taskId: string;
}

export async function validateSonarResult(options: SonarResultOptions): Promise<SonarValidation> {
  const output = validateSonarScanner(options.process, options.token);
  const task = await readSonarTaskIdentity({
    workspace: options.workspace,
    invocationStartedAtMs: options.invocationStartedAtMs,
    hostUrl: options.hostUrl,
    projectKey: options.projectKey,
    token: options.token,
  });
  const analysisId = validateSonarComputeTask(
    options.computeTaskResponse,
    task.taskId,
    options.projectKey,
    options.token,
  );
  validateSonarQualityGate(options.qualityGateResponse, options.token);
  validateSonarPolicy(options.expectedPolicy, options.remotePolicy);

  return { analysisId, gateStatus: "OK", ...output, taskId: task.taskId };
}

function validateSonarScanner(
  process: SonarProcessResult,
  token: string,
): Pick<SonarValidation, "redactedStderr" | "redactedStdout"> {
  const secrets = [token];
  const redactedStdout = redactSecrets(process.stdout, secrets);
  const redactedStderr = redactSecrets(process.stderr, secrets);
  if (process.kind !== "exited") {
    throw new EvidenceError(`Sonar scanner ended with ${process.kind}.`);
  }
  if (process.exitCode !== 0) {
    throw new EvidenceError(`Sonar scanner exited with status ${String(process.exitCode)}.`);
  }
  return { redactedStderr, redactedStdout };
}

export async function readSonarTaskIdentity(options: {
  readonly workspace: string;
  readonly invocationStartedAtMs: number;
  readonly hostUrl: string;
  readonly projectKey: string;
  readonly token: string;
}): Promise<SonarTaskIdentity> {
  const taskEvidence = await readFreshEvidence(
    join(resolve(options.workspace), ".scannerwork/report-task.txt"),
    "Sonar task report",
    options.invocationStartedAtMs,
  );
  assertNoSecret(taskEvidence.content, options.token, "Sonar task report");
  const taskReport = parseProperties(taskEvidence.content);
  const taskId = requiredString(taskReport.ceTaskId, "Sonar task id");
  requireEqual(taskReport.projectKey, options.projectKey, "Sonar task project key");
  requireEqual(
    normalizedHostUrl(taskReport.serverUrl),
    normalizedHostUrl(options.hostUrl),
    "Sonar task server URL",
  );
  const taskUrl = validateTaskUrl(taskReport.ceTaskUrl, options.hostUrl, taskId);
  return { digest: taskEvidence.digest, taskId, taskUrl };
}

export function validateSonarComputeTask(
  response: unknown,
  taskId: string,
  projectKey: string,
  token: string,
): string {
  assertNoSecret(JSON.stringify(response), token, "Sonar compute-task response");
  const computeTask = record(record(response, "compute-task response").task, "compute task");
  requireEqual(computeTask.id, taskId, "Sonar compute task id");
  requireEqual(computeTask.componentKey, projectKey, "Sonar compute task project key");
  requireEqual(computeTask.status, "SUCCESS", "Sonar compute task status");
  return requiredString(computeTask.analysisId, "Sonar analysis id");
}

export function validateSonarQualityGate(response: unknown, token: string): void {
  assertNoSecret(JSON.stringify(response), token, "Sonar quality-gate response");
  const projectStatus = record(
    record(response, "quality-gate response").projectStatus,
    "project status",
  );
  requireEqual(projectStatus.status, "OK", "Sonar computed quality gate");
  requireEqual(projectStatus.ignoredConditions, false, "Sonar ignored conditions");
  if (Object.hasOwn(projectStatus, "conditions")) {
    validateComputedConditions(projectStatus.conditions);
  }
}

export function readRemoteSonarPolicy(
  responses: SonarPolicyResponses,
  token: string,
  projectKey: string,
): SonarPolicyIdentity {
  assertNoSecret(JSON.stringify(responses), token, "Sonar remote policy response");
  const assignment = record(
    record(responses.qualityGateAssignment, "quality-gate assignment response").qualityGate,
    "assigned quality gate",
  );
  const assignedGateName = requiredString(assignment.name, "Sonar assigned quality-gate name");
  const gateDefinition = record(responses.qualityGateDefinition, "quality-gate definition response");
  requireEqual(
    gateDefinition.name,
    assignedGateName,
    "Sonar quality-gate definition name",
  );
  validateConfiguredConditions(gateDefinition.conditions);
  const profileResponse = record(responses.qualityProfiles, "quality-profile response");
  if (!Array.isArray(profileResponse.profiles) || profileResponse.profiles.length !== 1) {
    throw new EvidenceError("Sonar TypeScript quality-profile assignment is missing or ambiguous.");
  }
  const profile = record(profileResponse.profiles[0], "TypeScript quality profile");
  requireEqual(profile.language, "ts", "Sonar quality-profile language");
  const period = record(responses.newCodePeriod, "new-code definition response");
  requireEqual(period.projectKey, projectKey, "Sonar new-code definition project key");
  requireEqual(period.branchKey, MAIN_BRANCH, "Sonar new-code definition branch key");
  if (Object.hasOwn(period, "inherited")) {
    requireEqual(period.inherited, false, "Sonar new-code definition inheritance");
  }
  const type = requiredString(period.type, "Sonar new-code definition type");
  const value = optionalString(period.value, "Sonar new-code definition value");
  return {
    qualityGate: assignedGateName,
    typescriptProfile: requiredString(profile.name, "Sonar TypeScript quality-profile name"),
    newCodeDefinition: value === null ? type : `${type}:${value}`,
  };
}

export function validateSonarPolicy(
  expected: SonarPolicyIdentity,
  remote: SonarPolicyIdentity,
): void {
  for (const key of ["qualityGate", "typescriptProfile", "newCodeDefinition"] as const) {
    if (expected[key].length === 0 || remote[key] !== expected[key]) {
      throw new EvidenceError(`Sonar remote ${key} is missing or does not match approved policy.`);
    }
  }
}

export function redactSecrets(value: string, secrets: readonly string[]): string {
  return secrets.reduce(
    (sanitized, secret) => secret.length === 0 ? sanitized : sanitized.replaceAll(secret, "[REDACTED]"),
    value,
  );
}

function parseProperties(content: string): Readonly<Record<string, string>> {
  const properties: Record<string, string> = {};
  for (const [index, rawLine] of content.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new EvidenceError(`Malformed property on line ${String(index + 1)}.`);
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key in properties) {
      throw new EvidenceError(`Duplicate property: ${key}.`);
    }
    properties[key] = value;
  }
  return properties;
}

function validateConfiguredConditions(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new EvidenceError("Sonar quality-gate definition conditions are missing.");
  }
  const conditions = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    const condition = record(item, "quality-gate definition condition");
    const metricKey = requiredString(condition.metric, "Sonar condition metric key");
    if (conditions.has(metricKey)) {
      throw new EvidenceError(`Sonar quality gate repeats condition ${metricKey}.`);
    }
    conditions.set(metricKey, condition);
  }
  for (const [metricKey, [comparator, threshold]] of Object.entries(REQUIRED_CONDITIONS)) {
    const condition = conditions.get(metricKey);
    if (condition === undefined) {
      throw new EvidenceError(`Sonar quality gate is missing required condition ${metricKey}.`);
    }
    requireEqual(condition.op, comparator, `Sonar ${metricKey} comparator`);
    requireEqual(condition.error, threshold, `Sonar ${metricKey} threshold`);
  }
  if (conditions.size !== Object.keys(REQUIRED_CONDITIONS).length) {
    throw new EvidenceError("Sonar quality gate contains unapproved conditions.");
  }
}

function validateComputedConditions(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new EvidenceError("Sonar computed quality-gate conditions are malformed.");
  }
  const metricKeys = new Set<string>();
  for (const item of value) {
    const condition = record(item, "computed quality-gate condition");
    const metricKey = requiredString(condition.metricKey, "Sonar computed condition metric key");
    if (metricKeys.has(metricKey)) {
      throw new EvidenceError(`Sonar computed quality gate repeats condition ${metricKey}.`);
    }
    metricKeys.add(metricKey);
    requireEqual(condition.status, "OK", `Sonar computed ${metricKey} status`);
  }
}

function validateTaskUrl(value: unknown, hostUrl: string, taskId: string): string {
  const taskUrl = url(requiredString(value, "Sonar compute task URL"), "Sonar compute task URL");
  const host = new URL(normalizedHostUrl(hostUrl));
  if (taskUrl.origin !== host.origin || taskUrl.searchParams.get("id") !== taskId) {
    throw new EvidenceError("Sonar compute task URL does not match the approved server or task.");
  }
  return taskUrl.href;
}

function normalizedHostUrl(value: unknown): string {
  const parsed = url(requiredString(value, "SONAR_HOST_URL"), "SONAR_HOST_URL");
  if (!isHttpProtocol(parsed.protocol) || hasUrlMetadata(parsed)) {
    throw new EvidenceError("SONAR_HOST_URL must be an HTTP(S) server URL without credentials or query data.");
  }
  return parsed.href.replace(/\/$/u, "");
}

function isHttpProtocol(protocol: string): boolean {
  return protocol === "https:" || protocol === "http:";
}

function hasUrlMetadata(value: URL): boolean {
  return value.username !== "" || value.password !== "" || value.search !== "" || value.hash !== "";
}

function url(value: string, label: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new EvidenceError(`${label} is not a valid URL.`);
  }
}

function requiredSecret(value: unknown, label: string): string {
  const secret = requiredString(value, label);
  if (secret !== secret.trim()) {
    throw new EvidenceError(`${label} contains surrounding whitespace.`);
  }
  return secret;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new EvidenceError(`${label} is missing.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | null {
  if (value == null || value === "") {
    return null;
  }
  return requiredString(value, label);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new EvidenceError(`${label} must be an object.`);
  }
  return value;
}

function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new EvidenceError(`${label} must be ${JSON.stringify(expected)}.`);
  }
}

function assertNoSecret(value: string, secret: string, label: string): void {
  if (secret.length > 0 && value.includes(secret)) {
    throw new EvidenceError(`${label} contains a secret.`);
  }
}
