import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it, type MockInstance, vi } from "vitest";
import { SpawnCommandRunner } from "../../src/adapters/command-runner.js";

describe("shell-disabled command execution", () => {
  it("captures output with a fixed bound and sanitizes terminal controls", async () => {
    const artifact = await new SpawnCommandRunner().run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('\\u001b[31m' + 'x'.repeat(70000))"],
      cwd: process.cwd(),
      stdin: null,
      timeoutMs: 2_000,
    });
    expect(artifact.kind).toBe("exited");
    expect(artifact.exitCode).toBe(0);
    expect(artifact.stdoutTruncated).toBe(true);
    expect(Buffer.byteLength(artifact.stdout)).toBeLessThanOrEqual(65_536);
    expect(artifact.stdout).not.toContain("\u001b");
  });

  it("retains a complete provider log while exposing bounded output with a stderr tail", async () => {
    const parent = resolve("tmp/codex-provider-log-test");
    await mkdir(parent, { recursive: true });
    const owned = await mkdtemp(join(parent, "run-"));
    const logPath = join(owned, "provider", "tester-1.log");
    const prefix = "provider documentation prefix\n" + "x".repeat(40_000);
    const suffix = "\nprovider failure at the end\n";
    try {
      const artifact = await new SpawnCommandRunner().run({
        executable: process.execPath,
        args: ["-e", `process.stdout.write("summary\\n"); process.stderr.write(${JSON.stringify(prefix + suffix)}); process.exit(1)`],
        cwd: process.cwd(),
        stdin: null,
        timeoutMs: 2_000,
        outputMode: "provider",
        outputLogPath: logPath,
      });

      expect(artifact).toMatchObject({
        kind: "exited",
        exitCode: 1,
        signal: null,
        stdout: "summary\n",
        stdoutTruncated: false,
        stderrTruncated: true,
        logPath,
      });
      expect(artifact.stderr).toContain("provider failure at the end");
      expect(artifact.stderr).not.toContain("provider documentation prefix");
      expect(Buffer.byteLength(artifact.stderr)).toBeLessThanOrEqual(32_768);

      const fullLog = await readFile(logPath, "utf8");
      expect(fullLog).toContain("TSQH provider output log v1");
      expect(fullLog).toContain(prefix);
      expect(fullLog).toContain(suffix);
    } finally {
      await rm(owned, { recursive: true, force: true });
    }
  });

  it("captures stderr and sanitizes control, ANSI, and astral text exactly", async () => {
    const artifact = await runNode([
      "process.stderr.write('\\u001b[?25l\\u001b[1 qred\\u001b[0m\\0\\t\\n😀')",
    ]);

    expect(artifact).toMatchObject({
      kind: "exited",
      exitCode: 0,
      stdout: "",
      stderr: "red\uFFFD\t\n\uFFFD\uFFFD",
      stdoutTruncated: false,
      stderrTruncated: false,
    });
  });

  it("distinguishes exact and overflowing output bounds", async () => {
    const exact = await runNode(["process.stdout.write('x'.repeat(65536))"]);
    const overflow = await runNode(["process.stdout.write('x'.repeat(65537))"]);
    const exactAfterExpansion = await runNode([
      "process.stdout.write(Buffer.concat([Buffer.alloc(65533, 120), Buffer.from([255])]))",
    ]);

    expect(Buffer.byteLength(exact.stdout)).toBe(65_536);
    expect(exact.stdoutTruncated).toBe(false);
    expect(Buffer.byteLength(overflow.stdout)).toBe(65_536);
    expect(overflow.stdoutTruncated).toBe(true);
    expect(Buffer.byteLength(exactAfterExpansion.stdout)).toBe(65_536);
    expect(exactAfterExpansion.stdout).toMatch(/\uFFFD$/u);
  });

  it("rebounds replacement-character expansion to the encoded byte limit", async () => {
    const artifact = await runNode(["process.stdout.write(Buffer.alloc(65536, 255))"]);

    expect(Buffer.byteLength(artifact.stdout)).toBe(65_535);
    expect(artifact.stdout).toHaveLength(21_845);
    expect(artifact.stdoutTruncated).toBe(false);
  });

  it("keeps a leading replacement character when sanitizer expansion exceeds the bound", async () => {
    const artifact = await runNode([
      "process.stdout.write(Buffer.concat([Buffer.from([255]), Buffer.alloc(65534, 120), Buffer.from([195])]))",
    ]);

    expect(Buffer.byteLength(artifact.stdout)).toBe(65_536);
    expect(artifact.stdout).toMatch(/^\uFFFDx+$/u);
    expect(artifact.stdoutTruncated).toBe(false);
  });

  it("passes prompt content only through standard input", async () => {
    const prompt = "untrusted `text` $(that must not execute)";
    const artifact = await new SpawnCommandRunner().run({
      executable: process.execPath,
      args: ["-e", "process.stdin.pipe(process.stdout)"],
      cwd: process.cwd(),
      stdin: prompt,
      timeoutMs: 2_000,
    });
    expect(artifact.stdout).toBe(prompt);
  });

  it("closes null standard input instead of leaving an unread pipe open", async () => {
    const artifact = await new SpawnCommandRunner().run({
      executable: process.execPath,
      args: ["-e", "process.stdin.pipe(process.stdout)"],
      cwd: process.cwd(),
      stdin: null,
      timeoutMs: 1_000,
    });

    expect(artifact).toMatchObject({ kind: "exited", exitCode: 0, stdout: "" });
  });

  it("ignores a child-side stdin close while sending a large prompt", async () => {
    const artifact = await new SpawnCommandRunner().run({
      executable: process.execPath,
      args: ["-e", "process.exit(0)"],
      cwd: process.cwd(),
      stdin: "x".repeat(1_000_000),
      timeoutMs: 1_000,
    });

    expect(artifact).toMatchObject({ kind: "exited", exitCode: 0 });
  });

  it("passes only explicitly requested additional environment keys", async () => {
    const key = "TSQH_TEST_PROFILE_SECRET";
    const mutationKey = "Stryker was here";
    const originalMutationValue = process.env[mutationKey];
    process.env[key] = "not-for-agent-processes";
    try {
      const allowed = await new SpawnCommandRunner().run({
        executable: process.execPath,
        args: ["-e", `process.exit(process.env.${key} ? 0 : 1)`],
        cwd: process.cwd(),
        stdin: null,
        timeoutMs: 2_000,
        environmentKeys: [key],
      });
      const denied = await new SpawnCommandRunner().run({
        executable: process.execPath,
        args: ["-e", `process.exit(process.env.${key} ? 1 : 0)`],
        cwd: process.cwd(),
        stdin: null,
        timeoutMs: 2_000,
      });

      expect(allowed.exitCode).toBe(0);
      expect(denied.exitCode).toBe(0);
      expect(allowed.stdout).not.toContain(process.env[key]!);
      expect(allowed.stderr).not.toContain(process.env[key]!);

      process.env[mutationKey] = "mutation sentinel";
      const defaultDenied = await runNode([
        `process.exit(process.env[${JSON.stringify(mutationKey)}] === undefined ? 0 : 1)`,
      ]);
      expect(defaultDenied.exitCode).toBe(0);
    } finally {
      delete process.env[key];
      if (originalMutationValue === undefined) {
        delete process.env[mutationKey];
      } else {
        process.env[mutationKey] = originalMutationValue;
      }
    }
  });

  it("reports nonzero exits, signals, and spawn errors exactly", async () => {
    await expect(runNode(["process.stderr.write('failed'); process.exit(7)"])).resolves.toMatchObject({
      kind: "exited",
      exitCode: 7,
      signal: null,
      stderr: "failed",
    });
    await expect(runNode(["process.kill(process.pid, 'SIGTERM')"])).resolves.toMatchObject({
      kind: "signal",
      exitCode: null,
      signal: "SIGTERM",
    });

    const missing = await new SpawnCommandRunner().run({
      executable: join(process.cwd(), "missing-executable"),
      args: [],
      cwd: process.cwd(),
      stdin: null,
      timeoutMs: 1_000,
    });
    expect(missing).toMatchObject({
      kind: "spawn-error",
      exitCode: null,
      signal: null,
      stderr: expect.stringMatching(/ENOENT/u),
      stderrTruncated: false,
    });
  });

  it("clears a pending timeout after a process exits", async () => {
    const setTimeout = vi.spyOn(globalThis, "setTimeout");
    const clearTimeout = vi.spyOn(globalThis, "clearTimeout");
    try {
      await runNode(["process.exit(0)"], 60_000);
      expect(clearTimeout).toHaveBeenCalledWith(timerCreatedFor(setTimeout, 60_000));
    } finally {
      setTimeout.mockRestore();
      clearTimeout.mockRestore();
    }
  });

  it("classifies a graceful timeout and a forced kill as timeouts", async () => {
    const setTimeout = vi.spyOn(globalThis, "setTimeout");
    const clearTimeout = vi.spyOn(globalThis, "clearTimeout");
    try {
      const graceful = await runNode(["setInterval(() => undefined, 1000)"], 500);
      expect(graceful).toMatchObject({ kind: "timeout", signal: "SIGTERM" });
      expect(clearTimeout).toHaveBeenCalledWith(timerCreatedFor(setTimeout, 500));
      expect(clearTimeout).toHaveBeenCalledWith(timerCreatedFor(setTimeout, 1_000));

      setTimeout.mockClear();
      clearTimeout.mockClear();
      const forced = await runNode([
        "process.on('SIGTERM', () => undefined); setInterval(() => undefined, 1000)",
      ], 500);
      expect(forced).toMatchObject({ kind: "timeout", signal: "SIGKILL" });
      expect(clearTimeout).toHaveBeenCalledWith(timerCreatedFor(setTimeout, 500));
      expect(clearTimeout).toHaveBeenCalledWith(timerCreatedFor(setTimeout, 1_000));
    } finally {
      setTimeout.mockRestore();
      clearTimeout.mockRestore();
    }
  });
});

async function runNode(source: readonly string[], timeoutMs = 2_000) {
  return new SpawnCommandRunner().run({
    executable: process.execPath,
    args: ["-e", source.join("; ")],
    cwd: process.cwd(),
    stdin: null,
    timeoutMs,
  });
}

function timerCreatedFor(
  setTimeout: MockInstance<typeof globalThis.setTimeout>,
  delay: number,
): NodeJS.Timeout {
  const index = setTimeout.mock.calls.findIndex(([, milliseconds]) => milliseconds === delay);
  expect(index).toBeGreaterThanOrEqual(0);
  return setTimeout.mock.results[index]!.value as NodeJS.Timeout;
}
