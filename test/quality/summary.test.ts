import { mkdtemp, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateQualitySummary,
  writeQualitySummary,
  type QualitySummary,
} from "../../src/quality/summary.js";

const hash = "a".repeat(64);

describe("versioned quality summaries", () => {
  it("accepts current facts written without secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-summary-"));
    const summary = passingSummary();
    await writeQualitySummary(root, summary);

    await expect(validateQualitySummary({
      workspace: root,
      invocationStartedAtMs: 0,
      expected: summary,
      secrets: ["never-present"],
    })).resolves.toMatch(/^[a-f0-9]{64}$/u);
    expect((await stat(join(root, "reports/quality/coverage-summary.json"))).mode & 0o777).toBe(0o600);
  });

  it("rejects missing, stale, and malformed summaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-summary-invalid-"));
    const summary = passingSummary();
    const path = await writeQualitySummary(root, summary);
    await unlink(path);
    await expect(validate(root, summary, 0)).rejects.toThrow(/coverage quality summary is missing/u);

    await writeQualitySummary(root, summary);
    const old = new Date(0);
    await utimes(path, old, old);
    await expect(validate(root, summary, 1)).rejects.toThrow(/stale/u);

    await writeFile(path, "{bad\n", "utf8");
    await expect(validate(root, summary, 0)).rejects.toThrow(/coverage quality summary is malformed JSON/u);
  });

  it("rejects summaries that contradict current facts", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-summary-contradiction-"));
    const expected = passingSummary();
    await writeQualitySummary(root, { ...expected, outputDigests: { report: "b".repeat(64) } });

    await expect(validate(root, expected, 0)).rejects.toThrow(/contradicts current gate facts/u);
  });

  it("rejects secret-bearing summaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-summary-secret-"));
    const secret = "summary-secret";
    const summary = { ...passingSummary(), reason: secret };
    await writeQualitySummary(root, summary);

    await expect(validateQualitySummary({
      workspace: root,
      invocationStartedAtMs: 0,
      expected: summary,
      secrets: [secret],
    })).rejects.toThrow(/contains a secret/u);
  });

  it("does not invent a default secret and ignores an empty secret", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-summary-no-secret-"));
    const summary = { ...passingSummary(), reason: "Stryker was here" };
    await writeQualitySummary(root, summary);

    await expect(validate(root, summary, 0)).resolves.toMatch(/^[a-f0-9]{64}$/u);
    await expect(validateQualitySummary({
      workspace: root,
      invocationStartedAtMs: 0,
      expected: summary,
      secrets: [""],
    })).resolves.toMatch(/^[a-f0-9]{64}$/u);
  });

  it("accepts explicit blocked preflight facts without fabricated tool or report digests", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-summary-blocked-"));
    const summary: QualitySummary = {
      ...passingSummary(),
      toolVersions: {},
      configDigests: {},
      outputDigests: {},
      process: {
        ...passingSummary().process,
        kind: "not-run",
        exitCode: null,
      },
      status: "blocked",
      reason: "Required executable is missing.",
    };
    await writeQualitySummary(root, summary);

    await expect(validate(root, summary, 0)).resolves.toMatch(/^[a-f0-9]{64}$/u);
  });

  it("accepts every native blocked process kind and a signal value", async () => {
    for (const kind of ["spawn-error", "timeout", "signal"] as const) {
      const root = await mkdtemp(join(tmpdir(), "tsqh-summary-process-kind-"));
      const summary: QualitySummary = {
        ...passingSummary(),
        status: "blocked",
        process: {
          ...passingSummary().process,
          kind,
          exitCode: null,
          signal: kind === "signal" ? "SIGTERM" : null,
        },
      };
      await writeQualitySummary(root, summary);

      await expect(validate(root, summary, 0)).resolves.toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it("accepts failed status, empty arguments, and every threshold scalar type", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-summary-valid-shapes-"));
    const summary: QualitySummary = {
      ...passingSummary(),
      status: "failed",
      command: { ...passingSummary().command, args: [] },
      thresholds: { number: 1, string: "OK", boolean: true },
      process: { ...passingSummary().process, exitCode: 1 },
    };
    await writeQualitySummary(root, summary);

    await expect(validate(root, summary, 0)).resolves.toMatch(/^[a-f0-9]{64}$/u);
  });

  it.each([
    ["schema version", (value: MutableSummary) => value.schemaVersion = 2, /schemaVersion/u],
    ["gate id", (value: MutableSummary) => value.gateId = "", /gateId/u],
    ["timestamp", (value: MutableSummary) => value.generatedAt = "never", /generatedAt/u],
    ["timestamp label", (value: MutableSummary) => value.generatedAt = null, /generatedAt must be nonempty/u],
    ["status", (value: MutableSummary) => value.status = "unknown", /status is invalid/u],
    ["top-level keys", (value: MutableSummary) => value.extra = true, /quality summary has missing or unknown properties/u],
    ["command object", (value: MutableSummary) => value.command = null, /command must be an object/u],
    ["command keys", (value: MutableSummary) => object(value, "command").extra = true, /command.*unknown/u],
    ["command executable", (value: MutableSummary) => object(value, "command").executable = "", /executable/u],
    ["command arguments", (value: MutableSummary) => object(value, "command").args = null, /args/u],
    ["mixed command arguments", (value: MutableSummary) => object(value, "command").args = ["run", 1], /command.args/u],
    ["empty scope", (value: MutableSummary) => value.scope = [], /scope/u],
    ["empty scope item", (value: MutableSummary) => value.scope = [""], /scope/u],
    ["mixed scope item", (value: MutableSummary) => value.scope = ["src", ""], /scope/u],
    ["tool version object", (value: MutableSummary) => value.toolVersions = null, /toolVersions.*object/u],
    ["empty tool versions", (value: MutableSummary) => value.toolVersions = {}, /toolVersions/u],
    ["invalid tool version", (value: MutableSummary) => value.toolVersions = { vitest: "" }, /toolVersions/u],
    ["threshold scalar", (value: MutableSummary) => value.thresholds = { global: 90, invalid: null }, /thresholds contains a non-scalar/u],
    ["empty config digests", (value: MutableSummary) => value.configDigests = {}, /configDigests/u],
    ["empty output digests", (value: MutableSummary) => value.outputDigests = {}, /outputDigests/u],
    ["digest type", (value: MutableSummary) => value.inputDigests = { input: 1 }, /inputDigests.input must be a SHA-256/u],
    ["digest format", (value: MutableSummary) => value.inputDigests = { input: "bad" }, /inputDigests.input must be a SHA-256/u],
    ["digest prefix", (value: MutableSummary) => value.inputDigests = { input: `x${hash}` }, /SHA-256/u],
    ["digest suffix", (value: MutableSummary) => value.inputDigests = { input: `${hash}x` }, /SHA-256/u],
    ["process object", (value: MutableSummary) => value.process = null, /process must be an object/u],
    ["process keys", (value: MutableSummary) => object(value, "process").extra = true, /process.*unknown/u],
    ["process kind", (value: MutableSummary) => object(value, "process").kind = "unknown", /process.kind/u],
    ["process exit", (value: MutableSummary) => object(value, "process").exitCode = 1.5, /process.exitCode/u],
    ["process signal", (value: MutableSummary) => object(value, "process").signal = 1, /process.signal/u],
    ["stdout digest", (value: MutableSummary) => object(value, "process").stdoutDigest = "bad", /process.stdoutDigest/u],
    ["stderr digest", (value: MutableSummary) => object(value, "process").stderrDigest = "bad", /process.stderrDigest/u],
    ["stdout truncation", (value: MutableSummary) => object(value, "process").stdoutTruncated = "false", /truncation/u],
    ["stderr truncation", (value: MutableSummary) => object(value, "process").stderrTruncated = "false", /truncation/u],
    ["reason", (value: MutableSummary) => value.reason = "", /reason/u],
    ["passed process kind", (value: MutableSummary) => object(value, "process").kind = "timeout", /contradicts/u],
    ["passed process exit", (value: MutableSummary) => object(value, "process").exitCode = 1, /contradicts/u],
  ])("rejects invalid %s", async (_label, mutate, message) => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-summary-shape-"));
    const value = structuredClone(passingSummary()) as unknown as MutableSummary;
    mutate(value);
    const summary = value as unknown as QualitySummary;
    await writeQualitySummary(root, summary);

    await expect(validate(root, summary, 0)).rejects.toThrow(message);
  });
});

type MutableSummary = Record<string, unknown>;

function object(value: MutableSummary, key: string): Record<string, unknown> {
  return value[key] as Record<string, unknown>;
}

function validate(root: string, expected: QualitySummary, invocationStartedAtMs: number) {
  return validateQualitySummary({ workspace: root, invocationStartedAtMs, expected });
}

function passingSummary(): QualitySummary {
  return {
    schemaVersion: 1,
    gateId: "coverage",
    generatedAt: "2026-08-25T00:00:00.000Z",
    toolVersions: { vitest: "4.1.11" },
    command: { executable: "node_modules/.bin/vitest", args: ["run", "--coverage"] },
    scope: ["src/**/*.ts", "test/**/*.ts"],
    thresholds: { global: 90, domain: 100 },
    configDigests: { "vitest.config.ts": hash },
    inputDigests: {},
    outputDigests: { "coverage/coverage-final.json": hash, "coverage/lcov.info": hash },
    process: {
      kind: "exited",
      exitCode: 0,
      signal: null,
      stdoutDigest: hash,
      stderrDigest: hash,
      stdoutTruncated: false,
      stderrTruncated: false,
    },
    status: "passed",
    reason: "Coverage reports are current, complete, and above both thresholds.",
  };
}
