import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ProcessArtifact } from "../domain/types.js";
import { EvidenceError, parseJsonObject, readFreshEvidence } from "./evidence.js";
import type { QualityProcessSummary, QualityStatus } from "./summary.js";

class NativeQualityFailure extends Error {
  public constructor(
    public readonly status: QualityStatus,
    public readonly exitCode: number,
    message: string,
  ) {
    super(message);
    this.name = "NativeQualityFailure";
  }
}

export async function assertQualityWorkspace(workspace: string): Promise<void> {
  const manifest = parseJsonObject(
    (await readFreshEvidence(join(workspace, "package.json"), "Package manifest", 0)).content,
    "Package manifest",
  );
  if (manifest.name !== "tsqh-mvp") {
    throw new EvidenceError("Quality gates must run from the tsqh-mvp package root.");
  }
}

export async function cleanQualityPaths(
  workspace: string,
  gateId: string,
  paths: readonly string[],
): Promise<void> {
  await rm(join(workspace, `reports/quality/${gateId}-summary.json`), { force: true });
  for (const path of paths) {
    await rm(join(workspace, path), { force: true, recursive: true });
  }
}

export async function loadPinnedToolVersions(
  workspace: string,
  expected: Readonly<Record<string, string>>,
): Promise<Readonly<Record<string, string>>> {
  const versions: Record<string, string> = {};
  for (const [packageName, expectedVersion] of Object.entries(expected)) {
    const manifest = parseJsonObject(
      (await readFreshEvidence(
        join(workspace, "node_modules", packageName, "package.json"),
        `${packageName} package manifest`,
        0,
      )).content,
      `${packageName} package manifest`,
    );
    if (manifest.version !== expectedVersion) {
      throw new EvidenceError(
        `${packageName} version must be ${expectedVersion}; found ${String(manifest.version)}.`,
      );
    }
    versions[packageName] = expectedVersion;
  }
  return versions;
}

export async function digestQualityFiles(
  workspace: string,
  paths: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  const digests: Record<string, string> = {};
  for (const path of paths) {
    digests[path] = (await readFreshEvidence(
      join(workspace, path),
      `Configuration ${path}`,
      0,
    )).digest;
  }
  return digests;
}

export function assertNativeQualitySuccess(gateId: string, process: ProcessArtifact): void {
  if (process.kind !== "exited") {
    throw new NativeQualityFailure("blocked", 1, `${gateId} process ended with ${process.kind}.`);
  }
  if (process.exitCode !== 0) {
    throw new NativeQualityFailure(
      "failed",
      process.exitCode ?? 1,
      `${gateId} process exited with status ${String(process.exitCode)}.`,
    );
  }
}

export function classifyQualityFailure(
  error: unknown,
  process: ProcessArtifact | null,
): { readonly status: QualityStatus; readonly reason: string; readonly exitCode: number } {
  if (error instanceof NativeQualityFailure) {
    return { status: error.status, reason: error.message, exitCode: error.exitCode };
  }
  const reason = error instanceof Error ? error.message : String(error);
  const nativeExit = process?.kind === "exited" ? process.exitCode : null;
  return { status: "blocked", reason, exitCode: nativeExit === 0 ? 1 : (nativeExit ?? 1) };
}

export function summarizeQualityProcess(process: ProcessArtifact | null): QualityProcessSummary {
  if (process === null) {
    return {
      kind: "not-run",
      exitCode: null,
      signal: null,
      stdoutDigest: digestText(""),
      stderrDigest: digestText(""),
      stdoutTruncated: false,
      stderrTruncated: false,
    };
  }
  return {
    kind: process.kind,
    exitCode: process.exitCode,
    signal: process.signal,
    stdoutDigest: digestText(process.stdout),
    stderrDigest: digestText(process.stderr),
    stdoutTruncated: process.stdoutTruncated,
    stderrTruncated: process.stderrTruncated,
  };
}

export function digestText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
