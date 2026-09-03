import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packRoot = resolve("workflows/swarm-forge");
const promptRoot = join(packRoot, "prompts");
const expectedCommits = {
  main: "8e83a09a41a7970edf8107f074cc41c12b953a08",
  "two-pack": "f2791781b9070fc43c33d460f396f297447e5833",
  "four-pack": "83f819307e6258296f6c1934b583ba888346cb2f",
  "six-pack": "c8650d14becf6c33be537c75b6dacebccf965d4b",
  squad: "b0d63d57a8f0c2e678c0449c16ee953132b9d306",
} as const;
const expectedRoles = [
  "specifier",
  "implementer",
  "cleaner",
  "architect",
  "hardener",
  "qa",
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

interface WorkflowFile {
  readonly workflow: { readonly steps: Readonly<Record<string, { readonly role?: string }>> };
  readonly roles: Readonly<Record<string, { readonly promptPath: string }>>;
}

describe("adapted Swarm Forge workflow pack", () => {
  it("matches every versioned role digest and contains no unused prompts", async () => {
    const manifest = await readManifest();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.roles.map((role) => role.id)).toEqual(expectedRoles);
    expect(await promptFiles()).toEqual(expectedRoles.map((role) => `${role}.md`).sort());

    for (const role of manifest.roles) {
      expect(role.file).toBe(`${role.id}.md`);
      expect(role.dispatchable).toBe(true);
      expect(role.writePosture.length).toBeGreaterThan(0);
      const path = join(promptRoot, role.file);
      const [details, resolved, content] = await Promise.all([
        lstat(path),
        realpath(path),
        readFile(path, "utf8"),
      ]);
      expect(details.isFile()).toBe(true);
      expect(details.isSymbolicLink()).toBe(false);
      expect(relative(promptRoot, resolved)).not.toMatch(/^\.\./u);
      expect(createHash("sha256").update(content).digest("hex")).toBe(role.sha256);
    }
  });

  it("aligns every manifest role and prompt with the workflow", async () => {
    const [manifest, workflow] = await Promise.all([
      readManifest(),
      readWorkflow(),
    ]);
    const configuredRoles = Object.keys(workflow.roles);
    const dispatchedRoles = Object.values(workflow.workflow.steps)
      .flatMap((step) => step.role === undefined ? [] : [step.role]);

    expect(configuredRoles).toEqual(expectedRoles);
    expect(new Set(dispatchedRoles)).toEqual(new Set(expectedRoles));
    expect(manifest.roles.map((role) => role.id)).toEqual(configuredRoles);
    for (const [roleId, role] of Object.entries(workflow.roles)) {
      expect(basename(role.promptPath)).toBe(`${roleId}.md`);
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
      const prompt = await readFile(join(promptRoot, role.file), "utf8");
      expect(prompt).not.toMatch(forbidden);
      expect(prompt).toMatch(/controller|transition|next step/iu);
      expect(prompt).toMatch(/allowed|read-only|configured(?:\s+\w+){0,2}\s+paths/iu);
    }
  });

  it("has no legacy examples or top-level prompt content roots", async () => {
    await expect(lstat(resolve("examples"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(resolve("prompts"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(join(packRoot, "manifest.json"), "utf8")) as Manifest;
}

async function readWorkflow(): Promise<WorkflowFile> {
  return JSON.parse(await readFile(join(packRoot, "workflow.json"), "utf8")) as WorkflowFile;
}

async function promptFiles(): Promise<string[]> {
  return (await readdir(promptRoot))
    .filter((file) => file.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right, "en"));
}
