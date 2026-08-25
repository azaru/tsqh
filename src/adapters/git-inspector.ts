import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readlink, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { CleanWorkspace, GitInspector, GitSnapshot } from "../application/ports.js";
import { isSafeRelativePath } from "../domain/validation.js";

const MAX_GIT_OUTPUT_BYTES = 4_194_304;

export class LocalGitInspector implements GitInspector {
  public async openCleanWorkspace(
    workspacePath: string,
    protectedAbsolutePaths: readonly string[],
  ): Promise<CleanWorkspace> {
    const workspace = await realpath(resolve(workspacePath));
    const details = await stat(workspace);
    if (!details.isDirectory()) {
      throw new Error(`Workspace is not a directory: ${workspace}`);
    }
    const rootResult = await runGit(workspace, ["rev-parse", "--show-toplevel"]);
    if (rootResult.exitCode !== 0) {
      throw new Error(`Workspace is not a Git worktree: ${cleanText(rootResult.stderr)}`);
    }
    const root = await realpath(cleanText(rootResult.stdout));
    if (root !== workspace) {
      throw new Error(`Workspace must name the Git worktree root: ${root}`);
    }
    const snapshot = await this.snapshot(workspace);
    if (Object.keys(snapshot.fingerprints).length > 0) {
      throw new Error("Workspace Git worktree is not clean.");
    }

    const protectedPaths = protectedAbsolutePaths
      .map((absolutePath) => repositoryRelativePath(workspace, absolutePath))
      .filter((value): value is string => value !== null)
      .sort();
    return { path: workspace, protectedPaths: [...new Set(protectedPaths)] };
  }

  public async snapshot(workspacePath: string): Promise<GitSnapshot> {
    const result = await runGit(workspacePath, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--no-renames",
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`Git status failed: ${cleanText(result.stderr)}`);
    }
    const statuses = parseStatus(result.stdout);
    const fingerprints: Record<string, string> = {};
    for (const [path, statusCode] of statuses) {
      await assertSafeWorkspacePath(workspacePath, path);
      fingerprints[path] = await fingerprintPath(workspacePath, path, statusCode);
    }
    return { fingerprints };
  }

  public async changedPathsSince(workspacePath: string, before: GitSnapshot): Promise<readonly string[]> {
    const after = await this.snapshot(workspacePath);
    const candidates = new Set([
      ...Object.keys(before.fingerprints),
      ...Object.keys(after.fingerprints),
    ]);
    return [...candidates]
      .filter((path) => before.fingerprints[path] !== after.fingerprints[path])
      .sort();
  }
}

interface GitResult {
  readonly exitCode: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

async function runGit(cwd: string, args: readonly string[]): Promise<GitResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn("git", [...args], { cwd, shell: false, env: gitEnvironment(process.env) });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let overflow = false;
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_GIT_OUTPUT_BYTES) {
        overflow = true;
        child.kill("SIGTERM");
      } else {
        stdout.push(chunk);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAX_GIT_OUTPUT_BYTES) {
        overflow = true;
        child.kill("SIGTERM");
      } else {
        stderr.push(chunk);
      }
    });
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      if (overflow) {
        reject(new Error("Git output exceeded the bounded capture limit."));
        return;
      }
      if (signal !== null || exitCode === null) {
        reject(new Error(`Git ended from signal '${signal ?? "unknown"}'.`));
        return;
      }
      resolveResult({ exitCode, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
  });
}

function parseStatus(output: Buffer): ReadonlyMap<string, string> {
  const decoded = decodeUtf8(output, "Git status output");
  const entries = decoded.split("\0");
  if (entries.at(-1) !== "") {
    throw new Error("Git status output was not NUL terminated.");
  }
  entries.pop();
  const statuses = new Map<string, string>();
  for (const entry of entries) {
    if (entry.length < 4 || entry[2] !== " ") {
      throw new Error("Git status returned a malformed path record.");
    }
    const statusCode = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!isSafeRelativePath(path, false)) {
      throw new Error(`Git returned an invalid or ambiguous changed path: ${JSON.stringify(path)}.`);
    }
    statuses.set(path, statusCode);
  }
  return statuses;
}

async function assertSafeWorkspacePath(workspace: string, repositoryPath: string): Promise<void> {
  const absolutePath = resolve(workspace, repositoryPath);
  const difference = relative(workspace, absolutePath);
  if (difference.startsWith(`..${sep}`) || difference === ".." || isAbsolute(difference)) {
    throw new Error(`Changed path escapes the workspace: ${repositoryPath}.`);
  }
  try {
    const resolvedPath = await realpath(absolutePath);
    const resolvedDifference = relative(workspace, resolvedPath);
    if (
      resolvedDifference.startsWith(`..${sep}`) ||
      resolvedDifference === ".." ||
      isAbsolute(resolvedDifference)
    ) {
      throw new Error(`Changed path resolves outside the workspace: ${repositoryPath}.`);
    }
  } catch (error) {
    const details = await lstat(absolutePath).catch(() => null);
    if (details !== null) {
      throw error;
    }
  }
}

async function fingerprintPath(workspace: string, repositoryPath: string, statusCode: string): Promise<string> {
  const absolutePath = resolve(workspace, repositoryPath);
  const details = await lstat(absolutePath).catch(() => null);
  if (details === null) {
    return `${statusCode}:deleted`;
  }
  if (details.isSymbolicLink()) {
    return `${statusCode}:symlink:${details.mode}:${await readlink(absolutePath)}`;
  }
  if (!details.isFile()) {
    throw new Error(`Changed path is not a regular file or symbolic link: ${repositoryPath}.`);
  }
  const digest = createHash("sha256");
  await new Promise<void>((resolveStream, reject) => {
    const stream = createReadStream(absolutePath);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolveStream);
  });
  return `${statusCode}:file:${details.mode}:${digest.digest("hex")}`;
}

function repositoryRelativePath(workspace: string, absolutePath: string): string | null {
  const difference = relative(workspace, absolutePath);
  if (
    difference === "" ||
    difference.startsWith(`..${sep}`) ||
    difference === ".." ||
    isAbsolute(difference)
  ) {
    return null;
  }
  const normalized = difference.split(sep).join("/");
  return isSafeRelativePath(normalized, false) ? normalized : null;
}

function gitEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" };
  for (const key of ["PATH", "HOME", "TMPDIR", "TMP", "TEMP"] as const) {
    const value = source[key];
    if (value !== undefined) {
      environment[key] = value;
    }
  }
  return environment;
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8.`);
  }
}

function cleanText(bytes: Buffer): string {
  return decodeUtf8(bytes, "Git output").trim();
}
