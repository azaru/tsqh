import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export class EvidenceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EvidenceError";
  }
}

export interface EvidenceFile {
  readonly content: string;
  readonly digest: string;
}

export async function readFreshEvidence(
  path: string,
  label: string,
  minimumMtimeMs: number,
): Promise<EvidenceFile> {
  let details;
  try {
    details = await stat(path);
  } catch {
    throw new EvidenceError(`${label} is missing: ${path}`);
  }
  if (!details.isFile()) {
    throw new EvidenceError(`${label} is not a regular file: ${path}`);
  }
  if (details.size === 0) {
    throw new EvidenceError(`${label} is empty: ${path}`);
  }
  if (details.mtimeMs < minimumMtimeMs) {
    throw new EvidenceError(`${label} is stale: ${path}`);
  }

  const content = await readFile(path, "utf8");
  if (content.trim().length === 0) {
    throw new EvidenceError(`${label} contains only whitespace: ${path}`);
  }
  return {
    content,
    digest: createHash("sha256").update(content).digest("hex"),
  };
}

export function parseJsonObject(content: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new EvidenceError(`${label} is malformed JSON.`);
  }
  if (!isRecord(value)) {
    throw new EvidenceError(`${label} must contain a JSON object.`);
  }
  return value;
}

export function normalizeReportPath(workspace: string, value: unknown, label: string): string {
  const path = requirePathString(value, label);
  const absolutePath = resolve(workspace, path);
  const workspaceRelative = relative(workspace, absolutePath);
  if (isOutsideWorkspace(workspaceRelative)) {
    throw new EvidenceError(`${label} resolves outside the workspace: ${path}`);
  }
  return workspaceRelative.split(sep).join("/");
}

function requirePathString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new EvidenceError(`${label} must be a nonempty path string.`);
  }
  return value;
}

function isOutsideWorkspace(path: string): boolean {
  return path.length === 0 || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
