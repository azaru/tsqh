import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateKnipResult } from "../../src/quality/knip.js";

describe("Knip evidence", () => {
  it("accepts native success with an empty issue inventory", () => {
    expect(validateKnipResult({ processExitCode: 0, stdout: '{"issues":[]}\n' })).toEqual({ findings: 0 });
  });

  it("rejects native process failure", () => {
    expect(() => validateKnipResult({ processExitCode: 2, stdout: '{"issues":[]}\n' })).toThrow(
      /process status 2/u,
    );
  });

  it("rejects configuration hints even when the issue inventory is empty", () => {
    expect(() => validateKnipResult({ processExitCode: 1, stdout: '{"issues":[]}\n' })).toThrow(
      /configuration or tag hints/u,
    );
  });

  it("rejects every reported issue", () => {
    const stdout = JSON.stringify({
      issues: [{ file: "package.json", dependencies: [{ name: "unused" }], unresolved: [] }],
    });

    expect(() => validateKnipResult({ processExitCode: 1, stdout })).toThrow(/reported 1 finding/u);
  });

  it("rejects missing or malformed JSON output", () => {
    expect(() => validateKnipResult({ processExitCode: 0, stdout: "" })).toThrow(/no JSON report/u);
    expect(() => validateKnipResult({ processExitCode: 0, stdout: " \n" })).toThrow(/no JSON report/u);
    expect(() => validateKnipResult({ processExitCode: 0, stdout: "not json" })).toThrow(
      /Knip report is malformed JSON/u,
    );
  });

  it("rejects malformed issue inventories and records", () => {
    expect(() => validateKnipResult({ processExitCode: 0, stdout: '{"issues":{}}' })).toThrow(
      /Knip report issues must be an array/u,
    );
    expect(() => validateKnipResult({ processExitCode: 1, stdout: '{"issues":[null]}' })).toThrow(
      /Knip issue 0 is malformed/u,
    );
    expect(() => validateKnipResult({ processExitCode: 1, stdout: '{"issues":[{"file":""}]}' })).toThrow(
      /Knip issue 0 is malformed/u,
    );
    expect(() => validateKnipResult({ processExitCode: 1, stdout: '{"issues":[{"file":"a.ts"}]}' })).toThrow(
      /Knip issue 0 contains no findings/u,
    );
    expect(() => validateKnipResult({
      processExitCode: 1,
      stdout: '{"issues":[{"file":"a.ts","dependencies":{}}]}',
    })).toThrow(/Knip issue field 'dependencies' must be an array/u);
  });

  it("does not count Knip ownership metadata as a finding", () => {
    const stdout = JSON.stringify({
      issues: [{
        file: "package.json",
        owners: ["workspace", "package"],
        dependencies: [{ name: "unused" }],
      }],
    });

    expect(() => validateKnipResult({ processExitCode: 1, stdout })).toThrow(/reported 1 finding/u);
  });

  it("rejects a process that did not exit normally", () => {
    expect(() => validateKnipResult({ processExitCode: null, stdout: '{"issues":[]}' })).toThrow(
      /Knip process did not exit normally/u,
    );
  });

  it("checks every complete-project issue class and makes hints fatal", async () => {
    const config = JSON.parse(await readFile(resolve("knip.json"), "utf8")) as Record<string, unknown>;

    expect(config.include).toEqual([
      "files",
      "dependencies",
      "devDependencies",
      "optionalPeerDependencies",
      "unlisted",
      "binaries",
      "unresolved",
      "exports",
      "nsExports",
      "types",
      "nsTypes",
      "enumMembers",
      "namespaceMembers",
      "duplicates",
      "catalog",
      "catalogReferences",
      "cycles",
    ]);
    expect(config).toMatchObject({ treatConfigHintsAsErrors: true, treatTagHintsAsErrors: true });
    expect(config.entry).toEqual(["src/quality/cli.ts", "tsqh.config.ts", "scripts/**/*.mjs"]);
    expect(config.project).toContain("test/**/*.ts");
    expect(config.ignoreDependencies).toEqual(["@azaru/tscrap", "@sonar/scan"]);
  });
});
