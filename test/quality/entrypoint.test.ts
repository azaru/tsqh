import { resolve } from "node:path";
import { expect, it, vi } from "vitest";

const runQualityCli = vi.hoisted(() => vi.fn(async (_args: readonly string[]) => 7));

vi.mock("../../src/quality/cli-main.js", () => ({ runQualityCli }));

it("passes only user arguments from the quality executable entrypoint", async () => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  process.argv = [process.execPath, resolve("src/quality/cli.ts"), "knip"];
  process.exitCode = undefined;

  try {
    await import("../../src/quality/cli.js");

    expect(runQualityCli).toHaveBeenCalledOnce();
    expect(runQualityCli.mock.calls[0]![0]).toEqual(["knip"]);
    expect(process.exitCode).toBe(7);
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
  }
});
