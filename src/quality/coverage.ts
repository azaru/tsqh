import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import {
  EvidenceError,
  isRecord,
  normalizeReportPath,
  parseJsonObject,
  readFreshEvidence,
} from "./evidence.js";

const REQUIRED_PERCENTAGE = 90;
const DOMAIN_REQUIRED_PERCENTAGE = 100;

type MetricName = "lines" | "statements" | "functions" | "branches";

interface Count {
  readonly covered: number;
  readonly total: number;
}

type Counts = Readonly<Record<MetricName, Count>>;

export interface CoverageValidation {
  readonly coverageDigest: string;
  readonly lcovDigest: string;
  readonly productionFiles: readonly string[];
  readonly global: Readonly<Record<MetricName, number>>;
  readonly domain: Readonly<Record<MetricName, number>>;
}

export interface CoverageValidationOptions {
  readonly workspace: string;
  readonly invocationStartedAtMs: number;
}

export async function validateCoverage(
  options: CoverageValidationOptions,
): Promise<CoverageValidation> {
  const workspace = resolve(options.workspace);
  const sources = await discoverSources(workspace);
  if (sources.executable.length === 0) {
    throw new EvidenceError("Coverage scope contains no executable production source files.");
  }

  const minimumMtimeMs = Math.max(options.invocationStartedAtMs, sources.newestMtimeMs);
  const coverage = await readFreshEvidence(
    join(workspace, "coverage/coverage-final.json"),
    "Coverage JSON report",
    minimumMtimeMs,
  );
  const lcov = await readFreshEvidence(
    join(workspace, "coverage/lcov.info"),
    "LCOV report",
    minimumMtimeMs,
  );
  const jsonCounts = parseCoverageJson(workspace, coverage.content, sources);
  const lcovCounts = parseLcov(workspace, lcov.content, sources.all);

  for (const source of sources.executable) {
    const json = jsonCounts.get(source);
    const lcovRecord = lcovCounts.get(source);
    if (json === undefined) {
      throw new EvidenceError(`Coverage JSON is partial; missing production file: ${source}`);
    }
    if (lcovRecord === undefined) {
      throw new EvidenceError(`LCOV is partial; missing production file: ${source}`);
    }
    assertCountsAgree(source, json, lcovRecord);
  }

  const globalCounts = totalCounts(sources.executable.map((source) => jsonCounts.get(source)!));
  const domainSources = sources.executable.filter((source) => source.startsWith("src/domain/"));
  if (domainSources.length === 0) {
    throw new EvidenceError("Coverage scope contains no executable domain source files.");
  }
  const domainCounts = totalCounts(domainSources.map((source) => jsonCounts.get(source)!));
  const global = percentages(globalCounts);
  const domain = percentages(domainCounts);
  assertThresholds("Global", global, REQUIRED_PERCENTAGE);
  assertThresholds("Domain", domain, DOMAIN_REQUIRED_PERCENTAGE);

  return {
    coverageDigest: coverage.digest,
    lcovDigest: lcov.digest,
    productionFiles: sources.executable,
    global,
    domain,
  };
}

interface SourceInventory {
  readonly all: ReadonlySet<string>;
  readonly executable: readonly string[];
  readonly newestMtimeMs: number;
}

async function discoverSources(workspace: string): Promise<SourceInventory> {
  const sourceRoot = join(workspace, "src");
  const files = await walkTypeScript(sourceRoot).catch((error: unknown) => {
    if (error instanceof EvidenceError) {
      throw error;
    }
    throw new EvidenceError(`Cannot discover production sources under ${sourceRoot}.`);
  });
  const all = new Set<string>();
  const executable: string[] = [];
  let newestMtimeMs = 0;

  for (const absolutePath of files) {
    const relativePath = relative(workspace, absolutePath).split(sep).join("/");
    const [source, details] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
    all.add(relativePath);
    newestMtimeMs = Math.max(newestMtimeMs, details.mtimeMs);
    if (!absolutePath.endsWith(".d.ts") && hasRuntimeCode(source, absolutePath)) {
      executable.push(relativePath);
    }
  }

  executable.sort();
  return { all, executable, newestMtimeMs };
}

async function walkTypeScript(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new EvidenceError(`Production source scope contains a symbolic link: ${path}`);
    }
    if (entry.isDirectory()) {
      paths.push(...(await walkTypeScript(path)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      paths.push(path);
    }
  }
  return paths;
}

function hasRuntimeCode(source: string, fileName: string): boolean {
  const output = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      target: ts.ScriptTarget.ES2023,
    },
  }).outputText.trim();
  return output !== "" && output !== "export {};";
}

function parseCoverageJson(
  workspace: string,
  content: string,
  sources: SourceInventory,
): ReadonlyMap<string, Counts> {
  const report = parseJsonObject(content, "Coverage JSON report");
  if (Object.keys(report).length === 0) {
    throw new EvidenceError("Coverage JSON report contains no file records.");
  }
  const counts = new Map<string, Counts>();
  for (const [reportedPath, value] of Object.entries(report)) {
    const source = normalizeReportPath(workspace, reportedPath, "Coverage JSON file key");
    if (counts.has(source)) {
      throw new EvidenceError(`Coverage JSON contains ambiguous duplicate paths for ${source}.`);
    }
    counts.set(source, parseCoverageRecord(workspace, sources, source, value));
  }
  return counts;
}

function parseCoverageRecord(
  workspace: string,
  sources: SourceInventory,
  source: string,
  value: unknown,
): Counts {
  if (!sources.all.has(source)) {
    throw new EvidenceError(`Coverage JSON contains a file outside production scope: ${source}`);
  }
  if (!isRecord(value)) {
    throw new EvidenceError(`Coverage JSON record must be an object: ${source}`);
  }
  const recordPath = normalizeReportPath(workspace, value.path, "Coverage JSON record path");
  if (recordPath !== source) {
    throw new EvidenceError(`Coverage JSON key and record path disagree for ${source}.`);
  }
  return countsForRecord(value, source);
}

function countsForRecord(record: Record<string, unknown>, source: string): Counts {
  const statements = numericCounts(record.s, `${source} statement counts`);
  const functions = numericCounts(record.f, `${source} function counts`);
  const branches = branchCounts(record.b, `${source} branch counts`);
  const statementMap = requiredRecord(record.statementMap, `${source} statement map`);
  const functionMap = requiredRecord(record.fnMap, `${source} function map`);
  const branchMap = requiredRecord(record.branchMap, `${source} branch map`);
  assertSameKeys(statements.values, statementMap, `${source} statements`);
  assertSameKeys(functions.values, functionMap, `${source} functions`);
  assertSameKeys(branches.values, branchMap, `${source} branches`);

  const lines = lineCounts(source, statementMap, statements.values);

  return {
    lines,
    statements: statements.count,
    functions: functions.count,
    branches: branches.count,
  };
}

function lineCounts(
  source: string,
  statementMap: Readonly<Record<string, unknown>>,
  statementHits: Readonly<Record<string, number>>,
): Count {
  const lineHits = new Map<number, number>();
  for (const [id, location] of Object.entries(statementMap)) {
    const line = statementLine(source, id, location);
    lineHits.set(line, Math.max(lineHits.get(line) ?? 0, statementHits[id]!));
  }
  return countHits([...lineHits.values()]);
}

function statementLine(source: string, id: string, value: unknown): number {
  if (!isRecord(value) || !isRecord(value.start)) {
    throw new EvidenceError(`${source} statement '${id}' has no valid start location.`);
  }
  const line = value.start.line;
  if (!Number.isSafeInteger(line) || (line as number) <= 0) {
    throw new EvidenceError(`${source} statement '${id}' has an invalid start line.`);
  }
  return line as number;
}

function numericCounts(value: unknown, label: string): { values: Record<string, number>; count: Count } {
  const record = requiredRecord(value, label);
  const values: Record<string, number> = {};
  for (const [id, hits] of Object.entries(record)) {
    if (!Number.isSafeInteger(hits) || (hits as number) < 0) {
      throw new EvidenceError(`${label} contains an invalid hit count for '${id}'.`);
    }
    values[id] = hits as number;
  }
  return { values, count: countHits(Object.values(values)) };
}

function branchCounts(value: unknown, label: string): { values: Record<string, unknown>; count: Count } {
  const record = requiredRecord(value, label);
  const values: Record<string, readonly number[]> = {};
  for (const [id, hits] of Object.entries(record)) {
    if (
      !Array.isArray(hits) ||
      hits.length === 0 ||
      hits.some((hit) => !Number.isSafeInteger(hit) || hit < 0)
    ) {
      throw new EvidenceError(`${label} contains invalid branch counts for '${id}'.`);
    }
    values[id] = hits;
  }
  return { values, count: countHits(Object.values(values).flat()) };
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new EvidenceError(`${label} must be an object.`);
  }
  return value;
}

function assertSameKeys(
  counts: Readonly<Record<string, unknown>>,
  locations: Readonly<Record<string, unknown>>,
  label: string,
): void {
  const countKeys = Object.keys(counts).sort();
  const locationKeys = Object.keys(locations).sort();
  if (countKeys.length !== locationKeys.length || countKeys.some((key, index) => key !== locationKeys[index])) {
    throw new EvidenceError(`${label} counts and locations disagree.`);
  }
}

function countHits(hits: readonly number[]): Count {
  return { covered: hits.filter((hit) => hit > 0).length, total: hits.length };
}

function parseLcov(
  workspace: string,
  content: string,
  sources: ReadonlySet<string>,
): ReadonlyMap<string, Counts> {
  const records = new Map<string, Counts>();
  let currentPath: string | null = null;
  let fields: Partial<Record<"LF" | "LH" | "FNF" | "FNH" | "BRF" | "BRH", number>> = {};
  for (const line of content.split(/\r?\n/u)) {
    const result = processLcovLine({ workspace, sources, records, currentPath, fields }, line);
    currentPath = result.currentPath;
    fields = result.fields;
  }
  if (currentPath !== null) {
    throw new EvidenceError(`LCOV record for ${currentPath} is missing end_of_record.`);
  }
  if (records.size === 0) {
    throw new EvidenceError("LCOV report contains no file records.");
  }
  return records;
}

interface LcovState {
  readonly workspace: string;
  readonly sources: ReadonlySet<string>;
  readonly records: Map<string, Counts>;
  readonly currentPath: string | null;
  readonly fields: Partial<Record<"LF" | "LH" | "FNF" | "FNH" | "BRF" | "BRH", number>>;
}

function processLcovLine(state: LcovState, line: string): Pick<LcovState, "currentPath" | "fields"> {
  if (line.startsWith("SF:")) {
    return beginLcovRecord(state, line.slice(3));
  }
  const summary = /^(LF|LH|FNF|FNH|BRF|BRH):(\d+)$/u.exec(line);
  if (summary !== null) {
    if (state.currentPath === null) {
      throw new EvidenceError("LCOV contains a summary field without a source path.");
    }
    return addLcovField(state, summary);
  }
  if (line === "end_of_record") {
    return endLcovRecord(state);
  }
  return state;
}

function beginLcovRecord(state: LcovState, reportedPath: string): Pick<LcovState, "currentPath" | "fields"> {
  if (state.currentPath !== null) {
    throw new EvidenceError(`LCOV record for ${state.currentPath} is missing end_of_record.`);
  }
  const currentPath = normalizeReportPath(state.workspace, reportedPath, "LCOV source path");
  if (state.records.has(currentPath)) {
    throw new EvidenceError(`LCOV contains ambiguous duplicate paths for ${currentPath}.`);
  }
  if (!state.sources.has(currentPath)) {
    throw new EvidenceError(`LCOV contains a file outside production scope: ${currentPath}`);
  }
  return { currentPath, fields: {} };
}

function addLcovField(
  state: LcovState,
  summary: RegExpExecArray,
): Pick<LcovState, "currentPath" | "fields"> {
  const field = summary[1] as keyof LcovState["fields"];
  if (state.fields[field] !== undefined) {
    throw new EvidenceError(`LCOV record for ${state.currentPath!} repeats ${field}.`);
  }
  return { currentPath: state.currentPath, fields: { ...state.fields, [field]: Number(summary[2]) } };
}

function endLcovRecord(state: LcovState): Pick<LcovState, "currentPath" | "fields"> {
  if (state.currentPath === null) {
    throw new EvidenceError("LCOV contains end_of_record without a source path.");
  }
  state.records.set(state.currentPath, countsFromLcovFields(state.currentPath, state.fields));
  return { currentPath: null, fields: {} };
}

function countsFromLcovFields(
  source: string,
  fields: Partial<Record<"LF" | "LH" | "FNF" | "FNH" | "BRF" | "BRH", number>>,
): Counts {
  for (const field of ["LF", "LH", "FNF", "FNH", "BRF", "BRH"] as const) {
    if (fields[field] === undefined) {
      throw new EvidenceError(`LCOV record for ${source} is missing ${field}.`);
    }
  }
  return {
    lines: { covered: fields.LH!, total: fields.LF! },
    statements: { covered: 0, total: 0 },
    functions: { covered: fields.FNH!, total: fields.FNF! },
    branches: { covered: fields.BRH!, total: fields.BRF! },
  };
}

function assertCountsAgree(source: string, json: Counts, lcov: Counts): void {
  for (const metric of ["lines", "functions", "branches"] as const) {
    if (
      json[metric].covered !== lcov[metric].covered ||
      json[metric].total !== lcov[metric].total
    ) {
      throw new EvidenceError(`Coverage JSON and LCOV ${metric} counts disagree for ${source}.`);
    }
  }
}

function totalCounts(items: readonly Counts[]): Counts {
  const total = (metric: MetricName): Count => ({
    covered: items.reduce((sum, item) => sum + item[metric].covered, 0),
    total: items.reduce((sum, item) => sum + item[metric].total, 0),
  });
  return {
    lines: total("lines"),
    statements: total("statements"),
    functions: total("functions"),
    branches: total("branches"),
  };
}

function percentages(counts: Counts): Readonly<Record<MetricName, number>> {
  const percentage = ({ covered, total }: Count): number => total === 0 ? 100 : (covered / total) * 100;
  return {
    lines: percentage(counts.lines),
    statements: percentage(counts.statements),
    functions: percentage(counts.functions),
    branches: percentage(counts.branches),
  };
}

function assertThresholds(
  label: string,
  values: Readonly<Record<MetricName, number>>,
  threshold: number,
): void {
  for (const metric of ["lines", "statements", "functions", "branches"] as const) {
    if (values[metric] < threshold) {
      throw new EvidenceError(
        `${label} ${metric} coverage is ${values[metric].toFixed(2)}%; required ${String(threshold)}%.`,
      );
    }
  }
}
