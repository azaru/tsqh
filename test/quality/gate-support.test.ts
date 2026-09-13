import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessArtifact } from "../../src/domain/types.js";
import {
  assertNativeQualitySuccess,
  assertQualityWorkspace,
  classifyQualityFailure,
  cleanQualityPaths,
  digestText,
  loadPinnedToolVersions,
  summarizeQualityProcess,
} from "../../src/quality/gate-support.js";

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("quality gate support", () => {
  it("validates the workspace package manifest", async () => {
    const root = await fixture();
    await expect(assertQualityWorkspace(root)).resolves.toBeUndefined();

    const missing = await fixture(false);
    await expect(assertQualityWorkspace(missing)).rejects.toThrow(
      `Package manifest is missing: ${join(missing, "package.json")}`,
    );

    const malformed = await fixture(false);
    await writeFile(join(malformed, "package.json"), "{", "utf8");
    await expect(assertQualityWorkspace(malformed)).rejects.toThrow(
      "Package manifest is malformed JSON.",
    );
  });

  it("loads only the exact pinned tool version", async () => {
    const root = await fixture();
    const manifest = join(root, "node_modules/tool/package.json");
    await writeJson(manifest, { name: "tool", version: "1.2.3" });

    await expect(loadPinnedToolVersions(root, { tool: "1.2.3" })).resolves.toEqual({
      tool: "1.2.3",
    });

    const missing = await fixture();
    await expect(loadPinnedToolVersions(missing, { tool: "1.2.3" })).rejects.toThrow(
      `tool package manifest is missing: ${join(missing, "node_modules/tool/package.json")}`,
    );

    await writeFile(manifest, "{", "utf8");
    await expect(loadPinnedToolVersions(root, { tool: "1.2.3" })).rejects.toThrow(
      "tool package manifest is malformed JSON.",
    );
  });

  it("removes only the requested gate artifacts", async () => {
    const root = await fixture();
    const summary = join(root, "reports/quality/coverage-summary.json");
    const evidence = join(root, "coverage/stale.txt");
    const preserved = join(root, "preserved.txt");
    await writeFile(summary, "stale", "utf8");
    await writeFile(evidence, "stale", "utf8");
    await writeFile(preserved, "keep", "utf8");

    await cleanQualityPaths(root, "coverage", ["coverage"]);

    await expect(access(summary)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(evidence)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(preserved)).resolves.toBeUndefined();
  });

  it("classifies native and unexpected failures without masking exit status", () => {
    const process = exited(7);
    let nativeFailure: unknown;
    try {
      assertNativeQualitySuccess("coverage", process);
    } catch (error) {
      nativeFailure = error;
    }

    expect(nativeFailure).toMatchObject({
      name: "NativeQualityFailure",
      message: "coverage process exited with status 7.",
    });
    expect(classifyQualityFailure(nativeFailure, process)).toEqual({
      status: "failed",
      reason: "coverage process exited with status 7.",
      exitCode: 7,
    });
    expect(classifyQualityFailure(new Error("invalid evidence"), process)).toEqual({
      status: "blocked",
      reason: "invalid evidence",
      exitCode: 7,
    });
    expect(classifyQualityFailure(new Error("invalid evidence"), exited(0))).toEqual({
      status: "blocked",
      reason: "invalid evidence",
      exitCode: 1,
    });
  });

  it("summarizes a process that was never started", () => {
    expect(summarizeQualityProcess(null)).toEqual({
      kind: "not-run",
      exitCode: null,
      signal: null,
      stdoutDigest: EMPTY_SHA256,
      stderrDigest: EMPTY_SHA256,
      stdoutTruncated: false,
      stderrTruncated: false,
    });
    expect(digestText("")).toBe(EMPTY_SHA256);
  });
});

async function fixture(withManifest = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-gate-support-"));
  await mkdir(join(root, "reports/quality"), { recursive: true });
  await mkdir(join(root, "coverage"));
  if (withManifest) {
    await writeJson(join(root, "package.json"), { name: "tsqh-mvp" });
  }
  return root;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

function exited(exitCode: number): ProcessArtifact {
  return {
    kind: "exited",
    exitCode,
    signal: null,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}
