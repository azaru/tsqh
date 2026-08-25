import { describe, expect, it } from "vitest";
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
});
