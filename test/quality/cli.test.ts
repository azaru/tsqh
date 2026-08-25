import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseQualityGate,
  runQualityCli,
  type QualityCliRuntime,
} from "../../src/quality/cli-main.js";
import type { ProcessArtifact } from "../../src/domain/types.js";

describe("quality gate CLI", () => {
  it.each(["coverage", "crap", "knip", "mutation", "sonar"] as const)("parses %s", (gateId) => {
    expect(parseQualityGate([gateId])).toBe(gateId);
  });

  it.each([[[]], [["unknown"]], [["knip", "extra"]]] as const)("rejects arguments %#", async (args) => {
    const stderr: string[] = [];
    const exitCode = await runQualityCli(args, "/unused", runtime(), {
      stdout: { write: () => true },
      stderr: { write: (value) => { stderr.push(String(value)); return true; } },
    });

    expect(exitCode).toBe(2);
    expect(stderr.join("")).toMatch(/Usage/u);
  });

  it("renders a gate blocker without spawning", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-quality-cli-"));
    await writeFile(join(root, "package.json"), '{"name":"other"}\n', "utf8");
    const stderr: string[] = [];

    const exitCode = await runQualityCli(["knip"], root, runtime(), {
      stdout: { write: () => true },
      stderr: { write: (value) => { stderr.push(String(value)); return true; } },
    });

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/knip: blocked.*package root/u);
  });

  it("forwards native output and renders a passed gate on stdout", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-quality-cli-pass-"));
    await mkdir(join(root, "node_modules/knip"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"name":"tsqh-mvp"}\n', "utf8");
    await writeFile(join(root, "knip.json"), '{}\n', "utf8");
    await writeFile(
      join(root, "node_modules/knip/package.json"),
      '{"name":"knip","version":"6.32.2"}\n',
      "utf8",
    );
    const stdout: string[] = [];
    const stderr: string[] = [];
    const process: ProcessArtifact = {
      kind: "exited",
      exitCode: 0,
      signal: null,
      stdout: '{"issues":[]}\n',
      stderr: "native diagnostic\n",
      stdoutTruncated: false,
      stderrTruncated: false,
    };

    const exitCode = await runQualityCli(["knip"], root, {
      ...runtime(),
      commandRunner: { run: async () => process },
    }, {
      stdout: { write: (value) => { stdout.push(String(value)); return true; } },
      stderr: { write: (value) => { stderr.push(String(value)); return true; } },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toBe('{"issues":[]}\nknip: passed: knip evidence is current, complete, and satisfies policy.\n');
    expect(stderr.join("")).toBe("native diagnostic\n");
  });
});

function runtime(): QualityCliRuntime {
  return {
    commandRunner: { run: () => Promise.reject(new Error("must not spawn")) },
    environment: {},
    now: () => 0,
    sonarApi: { getJson: () => Promise.reject(new Error("must not request")) },
  };
}
