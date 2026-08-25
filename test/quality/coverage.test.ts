import { mkdir, mkdtemp, readFile, stat, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCoverage } from "../../src/quality/coverage.js";

describe("coverage evidence", () => {
  it("accepts fresh complete reports at both thresholds", async () => {
    const fixture = await createCoverageFixture();

    const result = await validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 });

    expect(result.productionFiles).toEqual(["src/domain/rule.ts", "src/value.ts"]);
    expect(result.global).toEqual({ lines: 100, statements: 100, functions: 100, branches: 100 });
    expect(result.domain).toEqual({ lines: 100, statements: 100, functions: 100, branches: 100 });
  });

  it("rejects missing evidence", async () => {
    const fixture = await createCoverageFixture();
    await unlink(fixture.coveragePath);

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /Coverage JSON report is missing/u,
    );
  });

  it("labels a missing LCOV report exactly", async () => {
    const fixture = await createCoverageFixture();
    await unlink(fixture.lcovPath);

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /LCOV report is missing/u,
    );
  });

  it("rejects stale evidence", async () => {
    const fixture = await createCoverageFixture();
    const old = new Date(0);
    await utimes(fixture.coveragePath, old, old);

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 1 })).rejects.toThrow(
      /stale/u,
    );
  });

  it("requires reports newer than both the invocation and the newest source", async () => {
    const sourceNewer = await createCoverageFixture();
    const reportTime = (await stat(sourceNewer.coveragePath)).mtimeMs;
    const newerSource = new Date(Math.ceil(reportTime) + 10);
    await utimes(sourceNewer.domainPath, newerSource, newerSource);
    await expect(validateCoverage({ workspace: sourceNewer.root, invocationStartedAtMs: 0 }))
      .rejects.toThrow(/Coverage JSON report is stale/u);

    const invocationNewer = await createCoverageFixture();
    const invocation = Math.ceil((await stat(invocationNewer.coveragePath)).mtimeMs) + 10;
    await expect(validateCoverage({ workspace: invocationNewer.root, invocationStartedAtMs: invocation }))
      .rejects.toThrow(/Coverage JSON report is stale/u);
  });

  it("rejects malformed evidence", async () => {
    const fixture = await createCoverageFixture();
    await writeFile(fixture.coveragePath, "{not json\n", "utf8");

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /Coverage JSON report is malformed JSON/u,
    );
  });

  it("rejects partial production scope", async () => {
    const fixture = await createCoverageFixture({ omitDomain: true });

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /partial.*src\/domain\/rule\.ts/u,
    );
  });

  it("returns the executable production inventory in canonical path order", async () => {
    const fixture = await createCoverageFixture();

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 }))
      .resolves.toMatchObject({
        productionFiles: ["src/domain/rule.ts", "src/value.ts"],
      });
  });

  it("rejects ambiguous report paths", async () => {
    const fixture = await createCoverageFixture({ duplicateValuePath: true });

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /ambiguous duplicate paths/u,
    );
  });

  it("rejects reports below the global threshold", async () => {
    const fixture = await createCoverageFixture({ uncoveredValue: true });

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /Global lines coverage is 50\.00%; required 90%/u,
    );
  });

  it("identifies a domain-only threshold failure", async () => {
    const fixture = await createCoverageFixture();
    const report = JSON.parse(await readFile(fixture.coveragePath, "utf8")) as CoverageReport;
    object(report[fixture.valuePath]).b = { "0": Array.from({ length: 18 }, () => 1) };
    object(report[fixture.domainPath]).b = { "0": [0, 1] };
    await writeFile(fixture.coveragePath, `${JSON.stringify(report)}\n`, "utf8");
    await writeFile(
      fixture.lcovPath,
      lcovRecord(fixture.valuePath, 1, { branchFound: 18, branchHit: 18 }) +
        lcovRecord(fixture.domainPath, 1, { branchFound: 2, branchHit: 1 }),
      "utf8",
    );

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /Domain branches coverage is 50\.00%; required 100%/u,
    );
  });

  it("reports 100 percent for metrics with no executable units", async () => {
    const fixture = await createCoverageFixture();
    const report = JSON.parse(await readFile(fixture.coveragePath, "utf8")) as CoverageReport;
    for (const value of Object.values(report)) {
      const record = object(value);
      record.f = {};
      record.fnMap = {};
      record.b = {};
      record.branchMap = {};
    }
    await writeFile(fixture.coveragePath, `${JSON.stringify(report)}\n`, "utf8");
    await writeFile(
      fixture.lcovPath,
      lcovRecord(fixture.valuePath, 1, { functionFound: 0, functionHit: 0, branchFound: 0, branchHit: 0 }) +
        lcovRecord(fixture.domainPath, 1, { functionFound: 0, functionHit: 0, branchFound: 0, branchHit: 0 }),
      "utf8",
    );

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).resolves.toMatchObject({
      global: { functions: 100, branches: 100 },
      domain: { functions: 100, branches: 100 },
    });
  });

  it("rejects a zero-source scope while excluding declaration-only files deterministically", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-coverage-empty-"));
    await mkdir(join(root, "src/domain"), { recursive: true });
    await writeFile(join(root, "src/domain/types.ts"), "export interface Value { value: string }\n", "utf8");

    await expect(validateCoverage({ workspace: root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /no executable production source files/u,
    );
  });

  it("rejects an unavailable or symbolic-link source scope", async () => {
    const missing = await mkdtemp(join(tmpdir(), "tsqh-coverage-nosrc-"));
    await expect(validateCoverage({ workspace: missing, invocationStartedAtMs: 0 })).rejects.toThrow(
      /Cannot discover production sources/u,
    );

    const linked = await createCoverageFixture();
    await symlink(linked.valuePath, join(linked.root, "src/linked.ts"));
    await expect(validateCoverage({ workspace: linked.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /symbolic link/u,
    );
  });

  it("requires executable domain source", async () => {
    const fixture = await createCoverageFixture();
    await unlink(fixture.domainPath);
    await writeFile(fixture.coveragePath, `${JSON.stringify({
      [fixture.valuePath]: coverageRecord(fixture.valuePath, 1),
    })}\n`, "utf8");
    await writeFile(fixture.lcovPath, lcovRecord(fixture.valuePath, 1), "utf8");

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /no executable domain source files/u,
    );
  });

  it.each([
    ["empty report", (report: CoverageReport) => clear(report), /no file records/u],
    ["non-object record", (report: CoverageReport) => first(report).value = null, /record must be an object/u],
    ["disagreeing record path", (report: CoverageReport) => object(first(report).value).path = "src/other.ts", /key and record path disagree/u],
    ["statement counts object", (report: CoverageReport) => object(first(report).value).s = null, /statement counts must be an object/u],
    ["function counts object", (report: CoverageReport) => object(first(report).value).f = null, /function counts must be an object/u],
    ["branch counts object", (report: CoverageReport) => object(first(report).value).b = null, /branch counts must be an object/u],
    ["statement hit", (report: CoverageReport) => object(object(first(report).value).s)["0"] = -1, /invalid hit count/u],
    ["branch array", (report: CoverageReport) => object(object(first(report).value).b)["0"] = 1, /invalid branch counts/u],
    ["empty branch", (report: CoverageReport) => object(object(first(report).value).b)["0"] = [], /invalid branch counts/u],
    ["branch hit", (report: CoverageReport) => object(object(first(report).value).b)["0"] = [-1], /invalid branch counts/u],
    ["mixed branch hit", (report: CoverageReport) => object(object(first(report).value).b)["0"] = [1, -1], /invalid branch counts/u],
    ["statement map", (report: CoverageReport) => object(first(report).value).statementMap = null, /statement map must be an object/u],
    ["function map", (report: CoverageReport) => object(first(report).value).fnMap = null, /function map must be an object/u],
    ["branch map", (report: CoverageReport) => object(first(report).value).branchMap = null, /branch map must be an object/u],
    ["map keys", (report: CoverageReport) => object(first(report).value).statementMap = {}, /counts and locations disagree/u],
    ["function map keys", (report: CoverageReport) => object(first(report).value).fnMap = {}, /functions counts and locations disagree/u],
    ["branch map keys", (report: CoverageReport) => object(first(report).value).branchMap = {}, /branches counts and locations disagree/u],
    ["statement location", (report: CoverageReport) => object(object(first(report).value).statementMap)["0"] = null, /no valid start location/u],
    ["statement start", (report: CoverageReport) => object(object(first(report).value).statementMap)["0"] = { start: null }, /no valid start location/u],
    ["statement line", (report: CoverageReport) => object(object(first(report).value).statementMap)["0"] = { start: { line: 0 } }, /invalid start line/u],
  ])("rejects invalid coverage JSON: %s", async (_label, mutate, message) => {
    const fixture = await createCoverageFixture();
    const report = JSON.parse(await readFile(fixture.coveragePath, "utf8")) as CoverageReport;
    mutate(report);
    await writeFile(fixture.coveragePath, `${JSON.stringify(report)}\n`, "utf8");

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(message);
  });

  it("rejects a Coverage JSON file outside the production inventory", async () => {
    const fixture = await createCoverageFixture();
    const report = JSON.parse(await readFile(fixture.coveragePath, "utf8")) as CoverageReport;
    const outside = join(fixture.root, "outside.ts");
    report[outside] = coverageRecord(outside, 1);
    await writeFile(fixture.coveragePath, `${JSON.stringify(report)}\n`, "utf8");

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /Coverage JSON contains a file outside production scope/u,
    );
  });

  it("labels invalid Coverage JSON key and record paths exactly", async () => {
    const invalidKey = await createCoverageFixture();
    const keyReport = JSON.parse(await readFile(invalidKey.coveragePath, "utf8")) as CoverageReport;
    keyReport["../outside.ts"] = coverageRecord("../outside.ts", 1);
    await writeFile(invalidKey.coveragePath, `${JSON.stringify(keyReport)}\n`, "utf8");
    await expect(validateCoverage({ workspace: invalidKey.root, invocationStartedAtMs: 0 }))
      .rejects.toThrow(/Coverage JSON file key resolves outside/u);

    const invalidRecord = await createCoverageFixture();
    const recordReport = JSON.parse(await readFile(invalidRecord.coveragePath, "utf8")) as CoverageReport;
    object(recordReport[invalidRecord.valuePath]).path = null;
    await writeFile(invalidRecord.coveragePath, `${JSON.stringify(recordReport)}\n`, "utf8");
    await expect(validateCoverage({ workspace: invalidRecord.root, invocationStartedAtMs: 0 }))
      .rejects.toThrow(/Coverage JSON record path must be a nonempty path string/u);
  });

  it("accepts matching coverage ids regardless of object insertion order", async () => {
    for (const reverseCounts of [true, false]) {
      const fixture = await createCoverageFixture();
      const report = JSON.parse(await readFile(fixture.coveragePath, "utf8")) as CoverageReport;
      const record = object(report[fixture.valuePath]);
      const location = { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } };
      record.s = reverseCounts ? { b: 1, a: 1 } : { a: 1, b: 1 };
      record.statementMap = reverseCounts ? { a: location, b: location } : { b: location, a: location };
      await writeFile(fixture.coveragePath, `${JSON.stringify(report)}\n`, "utf8");

      await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 }))
        .resolves.toMatchObject({ global: { statements: 100 } });
    }
  });

  it("rejects same-sized coverage id inventories with one disagreement", async () => {
    const fixture = await createCoverageFixture();
    const report = JSON.parse(await readFile(fixture.coveragePath, "utf8")) as CoverageReport;
    const record = object(report[fixture.valuePath]);
    const location = { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } };
    record.s = { a: 1, b: 1 };
    record.statementMap = { a: location, c: location };
    await writeFile(fixture.coveragePath, `${JSON.stringify(report)}\n`, "utf8");

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /statements counts and locations disagree/u,
    );
  });

  it("rejects a coverage location inventory with one extra id", async () => {
    const fixture = await createCoverageFixture();
    const report = JSON.parse(await readFile(fixture.coveragePath, "utf8")) as CoverageReport;
    const statementMap = object(object(report[fixture.valuePath]).statementMap);
    statementMap["1"] = { start: { line: 2, column: 0 }, end: { line: 2, column: 1 } };
    await writeFile(fixture.coveragePath, `${JSON.stringify(report)}\n`, "utf8");

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /statements counts and locations disagree/u,
    );
  });

  it("returns production files in deterministic repository order", async () => {
    const fixture = await createCoverageFixture();
    const firstPath = join(fixture.root, "src/aaa.ts");
    await writeFile(firstPath, "export const first = true;\n", "utf8");
    const report = JSON.parse(await readFile(fixture.coveragePath, "utf8")) as CoverageReport;
    report[firstPath] = coverageRecord(firstPath, 1);
    await writeFile(fixture.coveragePath, `${JSON.stringify(report)}\n`, "utf8");
    await writeFile(fixture.lcovPath, `${await readFile(fixture.lcovPath, "utf8")}${lcovRecord(firstPath, 1)}`, "utf8");
    const fresh = new Date(Math.ceil((await stat(firstPath)).mtimeMs) + 10);
    await utimes(fixture.coveragePath, fresh, fresh);
    await utimes(fixture.lcovPath, fresh, fresh);

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).resolves.toMatchObject({
      productionFiles: ["src/aaa.ts", "src/domain/rule.ts", "src/value.ts"],
    });
  });

  it.each([
    ["missing file", (fixture: CoverageFixture) => lcovRecord(fixture.valuePath, 1), /LCOV is partial/u],
    ["nested record", (fixture: CoverageFixture) => `SF:${fixture.valuePath}\nSF:${fixture.domainPath}\n`, /missing end_of_record/u],
    ["duplicate record", (fixture: CoverageFixture) => lcovRecord(fixture.valuePath, 1).repeat(2), /ambiguous duplicate/u],
    ["outside scope", (fixture: CoverageFixture) => lcovRecord(join(fixture.root, "outside.ts"), 1), /outside production scope/u],
    ["repeated field", (fixture: CoverageFixture) => lcovRecord(fixture.valuePath, 1).replace("FNF:1", "FNF:1\nFNF:1"), /repeats FNF/u],
    ["orphan terminator", () => "end_of_record\n", /without a source path/u],
    ["orphan summary", () => "LF:1\n", /summary field without a source path/u],
    ["unterminated record", (fixture: CoverageFixture) => `SF:${fixture.valuePath}\nLF:1\n`, /missing end_of_record/u],
    ["empty inventory", () => "TN:empty\n", /no file records/u],
    ["missing field", (fixture: CoverageFixture) => lcovRecord(fixture.valuePath, 1).replace("BRH:2\n", ""), /missing BRH/u],
    ["contradictory counts", (fixture: CoverageFixture) => lcovRecord(fixture.domainPath, 1) + lcovRecord(fixture.valuePath, 0), /counts disagree/u],
    ["prefixed summary", (fixture: CoverageFixture) => lcovRecord(fixture.valuePath, 1).replace("LF:1", "xLF:1"), /missing LF/u],
    ["suffixed summary", (fixture: CoverageFixture) => lcovRecord(fixture.valuePath, 1).replace("LF:1", "LF:1x"), /missing LF/u],
    ["multi-digit summary", (fixture: CoverageFixture) => lcovRecord(fixture.domainPath, 1) + lcovRecord(fixture.valuePath, 1).replace("LF:1", "LF:10"), /lines counts disagree/u],
    ["total-only contradiction", (fixture: CoverageFixture) => lcovRecord(fixture.domainPath, 1) + lcovRecord(fixture.valuePath, 1, { branchFound: 3, branchHit: 2 }), /branches counts disagree/u],
  ])("rejects invalid LCOV: %s", async (_label, content, message) => {
    const fixture = await createCoverageFixture();
    await writeFile(fixture.lcovPath, content(fixture), "utf8");

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(message);
  });

  it("identifies the first unterminated LCOV record in a nested record", async () => {
    const fixture = await createCoverageFixture();
    const content = `SF:${fixture.valuePath}\n${lcovRecord(fixture.domainPath, 1)}`;
    await writeFile(fixture.lcovPath, content, "utf8");

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /LCOV record for src\/value\.ts is missing end_of_record/u,
    );
  });

  it("labels an invalid LCOV source path exactly", async () => {
    const fixture = await createCoverageFixture();
    await writeFile(fixture.lcovPath, lcovRecord("../outside.ts", 1), "utf8");

    await expect(validateCoverage({ workspace: fixture.root, invocationStartedAtMs: 0 })).rejects.toThrow(
      /LCOV source path resolves outside/u,
    );
  });
});

type CoverageReport = Record<string, unknown>;

interface CoverageFixture {
  readonly root: string;
  readonly coveragePath: string;
  readonly lcovPath: string;
  readonly valuePath: string;
  readonly domainPath: string;
}

interface FixtureOptions {
  readonly duplicateValuePath?: boolean;
  readonly omitDomain?: boolean;
  readonly uncoveredValue?: boolean;
}

async function createCoverageFixture(options: FixtureOptions = {}): Promise<{
  readonly root: string;
  readonly coveragePath: string;
  readonly lcovPath: string;
  readonly valuePath: string;
  readonly domainPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-coverage-"));
  const sourceRoot = join(root, "src");
  const coverageRoot = join(root, "coverage");
  await mkdir(join(sourceRoot, "domain"), { recursive: true });
  await mkdir(coverageRoot);
  const valuePath = join(sourceRoot, "value.ts");
  const domainPath = join(sourceRoot, "domain/rule.ts");
  await writeFile(valuePath, "export function value() { return 1; }\n", "utf8");
  await writeFile(domainPath, "export function rule() { return true; }\n", "utf8");
  await writeFile(join(sourceRoot, "domain/types.ts"), "export interface Rule { ok: boolean }\n", "utf8");
  await writeFile(join(sourceRoot, "comments.ts"), "// declaration-only comment\n", "utf8");
  await writeFile(join(sourceRoot, "runtime.d.ts"), "export const leaked = 1;\n", "utf8");
  await writeFile(join(sourceRoot, "README.md"), "not TypeScript\n", "utf8");

  const valueHits = options.uncoveredValue === true ? 0 : 1;
  const report: Record<string, unknown> = {
    [valuePath]: coverageRecord(valuePath, valueHits),
  };
  if (options.omitDomain !== true) {
    report[domainPath] = coverageRecord(domainPath, 1);
  }
  if (options.duplicateValuePath === true) {
    report["src/value.ts"] = coverageRecord(valuePath, valueHits);
  }

  const coveragePath = join(coverageRoot, "coverage-final.json");
  await writeFile(coveragePath, `${JSON.stringify(report)}\n`, "utf8");
  const lcovRecords = [lcovRecord(valuePath, valueHits)];
  if (options.omitDomain !== true) {
    lcovRecords.push(lcovRecord(domainPath, 1));
  }
  const lcovPath = join(coverageRoot, "lcov.info");
  await writeFile(lcovPath, lcovRecords.join(""), "utf8");

  const newestSource = Math.max((await stat(valuePath)).mtimeMs, (await stat(domainPath)).mtimeMs);
  const fresh = new Date(Math.ceil(newestSource) + 10_000);
  await utimes(coveragePath, fresh, fresh);
  await utimes(lcovPath, fresh, fresh);
  return { root, coveragePath, lcovPath, valuePath, domainPath };
}

function object(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function first(report: CoverageReport): { key: string; value: unknown } {
  const key = Object.keys(report)[0]!;
  return {
    key,
    get value(): unknown {
      return report[key];
    },
    set value(value: unknown) {
      report[key] = value;
    },
  };
}

function clear(report: CoverageReport): void {
  for (const key of Object.keys(report)) {
    delete report[key];
  }
}

function coverageRecord(path: string, hits: number): Record<string, unknown> {
  return {
    path,
    statementMap: { "0": { start: { line: 1, column: 0 }, end: { line: 1, column: 42 } } },
    fnMap: { "0": { name: "value" } },
    branchMap: { "0": { type: "branch" } },
    s: { "0": hits },
    f: { "0": hits },
    b: { "0": [hits, hits] },
  };
}

interface LcovOptions {
  readonly branchFound?: number;
  readonly branchHit?: number;
  readonly functionFound?: number;
  readonly functionHit?: number;
}

function lcovRecord(path: string, hits: number, options: LcovOptions = {}): string {
  const functionFound = options.functionFound ?? 1;
  const functionHit = options.functionHit ?? hits;
  const branchFound = options.branchFound ?? 2;
  const branchHit = options.branchHit ?? hits * 2;
  return [
    `SF:${path}`,
    `FNF:${String(functionFound)}`,
    `FNH:${String(functionHit)}`,
    `BRF:${String(branchFound)}`,
    `BRH:${String(branchHit)}`,
    "LF:1",
    `LH:${String(hits)}`,
    "end_of_record",
    "",
  ].join("\n");
}
