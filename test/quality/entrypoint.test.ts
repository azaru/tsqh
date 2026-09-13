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
    const { selectQualityEnvironment } = await import("../../src/quality/cli.js");

    expect(runQualityCli).toHaveBeenCalledOnce();
    expect(runQualityCli.mock.calls[0]![0]).toEqual(["knip"]);
    expect(process.exitCode).toBe(7);
    expect(selectQualityEnvironment({ OTHER: "ignored" })).toStrictEqual({});
    expect(selectQualityEnvironment({
      SONAR_HOST_URL: "http://localhost:9000",
      SONAR_TOKEN: "token",
      SONAR_ORGANIZATION: "organization",
      OTHER: "ignored",
    })).toStrictEqual({
      SONAR_HOST_URL: "http://localhost:9000",
      SONAR_TOKEN: "token",
      SONAR_ORGANIZATION: "organization",
    });
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
  }
});
