import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const catalogRoot = resolve("prompts/swarm-forge-adapted");
const litePromptRoot = resolve("examples/swarm-forge-lite/prompts");
const expectedCommits = {
  main: "0b69a51ca154025087569e6f880ca24b0bce6f54",
  "two-pack": "f2791781b9070fc43c33d460f396f297447e5833",
  "four-pack": "83f819307e6258296f6c1934b583ba888346cb2f",
  "six-pack": "c8650d14becf6c33be537c75b6dacebccf965d4b",
  adversaries: "7aa2f3a2691ed92e26a11be4481d7d5c8e2ff859",
  squad: "b0d63d57a8f0c2e678c0449c16ee953132b9d306",
} as const;
const expectedRoles = [
  "analyst",
  "specifier",
  "architect",
  "implementer",
  "cleaner",
  "code-reviewer",
  "hardener",
  "qa",
  "senior-implementer",
  "repairer",
] as const;

interface Manifest {
  readonly schemaVersion: number;
  readonly upstream: { readonly commits: Readonly<Record<string, string>> };
  readonly roles: readonly {
    readonly id: string;
    readonly file: string;
    readonly sha256: string;
    readonly dispatchable: boolean;
    readonly writePosture: string;
    readonly sources: readonly { readonly branch: string; readonly path: string }[];
  }[];
}

describe("adapted prompt catalog", () => {
  it("matches every versioned role digest and resolves only regular catalog files", async () => {
    const manifest = await readManifest();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.roles.map((role) => role.id)).toEqual(expectedRoles);

    for (const role of manifest.roles) {
      expect(role.file).toBe(`${role.id}.md`);
      expect(role.dispatchable).toBe(true);
      expect(role.writePosture.length).toBeGreaterThan(0);
      const path = join(catalogRoot, role.file);
      const [details, resolved, content] = await Promise.all([
        lstat(path),
        realpath(path),
        readFile(path, "utf8"),
      ]);
      expect(details.isFile()).toBe(true);
      expect(details.isSymbolicLink()).toBe(false);
      expect(relative(catalogRoot, resolved)).not.toMatch(/^\.\./u);
      expect(createHash("sha256").update(content).digest("hex")).toBe(role.sha256);
    }
  });

  it("pins every recorded source to the immutable researched commits", async () => {
    const manifest = await readManifest();
    expect(manifest.upstream.commits).toEqual(expectedCommits);

    for (const role of manifest.roles) {
      expect(role.sources.length).toBeGreaterThan(0);
      for (const source of role.sources) {
        expect(manifest.upstream.commits[source.branch]).toMatch(/^[a-f0-9]{40}$/u);
        expect(source.path).toMatch(/^swarmforge\//u);
        expect(source.path).not.toMatch(/(?:^|\/)\.\.(?:\/|$)/u);
      }
    }
  });

  it("keeps runtime choreography out of every role prompt", async () => {
    const manifest = await readManifest();
    const forbidden = /(?:babashka|clojure|\baps\b|gherkin|tmux|dashboard|worktree|squad-leader|git_handoff|swarm_handoff|ready_for_next|done_with_current)/iu;

    for (const role of manifest.roles) {
      const prompt = await readFile(join(catalogRoot, role.file), "utf8");
      expect(prompt).not.toMatch(forbidden);
      expect(prompt).toMatch(/controller|transition|next step/iu);
      expect(prompt).toMatch(/allowed|read-only|configured(?:\s+\w+){0,2}\s+paths/iu);
    }
  });

  it("keeps the concise Lite prompts distinct from the complete catalog", async () => {
    const manifest = await readManifest();
    const catalogDigests = new Set(manifest.roles.map((role) => role.sha256));
    const liteFiles = (await readdir(litePromptRoot))
      .filter((file) => file.endsWith(".md"))
      .sort((left, right) => left.localeCompare(right, "en"));

    expect(liteFiles).toEqual([
      "cleaner.md",
      "hardener.md",
      "implementer.md",
      "qa.md",
      "repairer.md",
      "reviewer.md",
    ]);
    for (const file of liteFiles) {
      const digest = createHash("sha256")
        .update(await readFile(join(litePromptRoot, file), "utf8"))
        .digest("hex");
      expect(catalogDigests.has(digest)).toBe(false);
    }
  });
});

async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(join(catalogRoot, "manifest.json"), "utf8")) as Manifest;
}
