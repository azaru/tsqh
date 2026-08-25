import { mkdir, mkdtemp, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeReportPath,
  parseJsonObject,
  readFreshEvidence,
} from "../../src/quality/evidence.js";

describe("quality evidence primitives", () => {
  it("accepts a current regular file and JSON object", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-evidence-"));
    const path = join(root, "report.json");
    await writeFile(path, "{\"ok\":true}\n", "utf8");

    await expect(readFreshEvidence(path, "Report", 0)).resolves.toMatchObject({
      content: "{\"ok\":true}\n",
    });
    expect(parseJsonObject("{\"ok\":true}", "Report")).toEqual({ ok: true });
    expect(normalizeReportPath(root, path, "Report path")).toBe("report.json");
  });

  it.each([
    ["directory", async (root: string) => join(root, "directory"), /not a regular file/u],
    ["empty", async (root: string) => write(root, "empty", ""), /is empty/u],
    ["whitespace", async (root: string) => write(root, "space", " \n"), /only whitespace/u],
  ])("rejects a %s evidence path", async (_label, prepare, message) => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-evidence-invalid-"));
    await mkdir(join(root, "directory"));
    const path = await prepare(root);

    await expect(readFreshEvidence(path, "Report", 0)).rejects.toThrow(message);
  });

  it("rejects stale evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-evidence-stale-"));
    const path = await write(root, "old", "current");
    const old = new Date(0);
    await utimes(path, old, old);

    await expect(readFreshEvidence(path, "Report", 1)).rejects.toThrow(/stale/u);
  });

  it("accepts evidence exactly at the freshness boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-evidence-boundary-"));
    const path = await write(root, "boundary", "current");
    const { mtimeMs } = await stat(path);

    await expect(readFreshEvidence(path, "Report", mtimeMs)).resolves.toMatchObject({
      content: "current",
    });
  });

  it("labels missing evidence and preserves the evidence error identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "tsqh-evidence-missing-"));
    let error: unknown;

    try {
      await readFreshEvidence(join(root, "missing"), "Report", 0);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ name: "EvidenceError" });
    expect((error as Error).message).toMatch(/Report is missing/u);
  });

  it("rejects malformed JSON with its evidence label", () => {
    expect(() => parseJsonObject("{", "Report")).toThrow(/Report is malformed JSON/u);
  });

  it("normalizes a nested report path with repository separators", () => {
    expect(normalizeReportPath("/workspace", "/workspace/nested/report.json", "Report path"))
      .toBe("nested/report.json");
  });

  it.each(["[]", "null", "true"])("rejects non-object JSON %s", (content) => {
    expect(() => parseJsonObject(content, "Report")).toThrow(/JSON object/u);
  });

  it.each([null, "", "has\0null"])("rejects invalid report path %j", (path) => {
    expect(() => normalizeReportPath("/workspace", path, "Report path")).toThrow(/path string/u);
  });

  it.each([".", "..", "../outside", "/outside"])("rejects out-of-workspace report path %s", (path) => {
    expect(() => normalizeReportPath("/workspace", path, "Report path")).toThrow(/outside/u);
  });
});

async function write(root: string, name: string, content: string): Promise<string> {
  const path = join(root, name);
  await writeFile(path, content, "utf8");
  return path;
}
