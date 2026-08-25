import { resolve } from "node:path";
import { expect, it, vi } from "vitest";

it("passes only user arguments from the executable entrypoint", async () => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  process.argv = [process.execPath, resolve("src/cli.ts"), "status"];
  process.exitCode = undefined;

  try {
    await import("../../src/cli.js");

    expect(process.exitCode).toBe(2);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(
      /^TSQH error: Missing required option '--run'\./u,
    ));
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    stderr.mockRestore();
  }
});
