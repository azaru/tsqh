import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { LocalGitInspector } from "../../src/adapters/git-inspector.js";

const execFileAsync = promisify(execFile);

describe.sequential("local Git inspection", () => {
  it("opens only a clean repository root and normalizes protected paths", async () => {
    const root = await repository();
    const inspector = new LocalGitInspector();

    await expect(inspector.openCleanWorkspace(root, [
      join(root, "z.txt"),
      join(root, "a.txt"),
      join(root, "z.txt"),
      root,
      join(root, "..", "outside.txt"),
    ])).resolves.toEqual({
      path: root,
      protectedPaths: ["a.txt", "z.txt"],
    });

    const child = join(root, "child");
    await mkdir(child);
    await expect(inspector.openCleanWorkspace(child, [])).rejects.toThrow(
      `Workspace must name the Git worktree root: ${root}`,
    );

    const file = join(root, "seed.txt");
    await expect(inspector.openCleanWorkspace(file, [])).rejects.toThrow(
      `Workspace is not a directory: ${file}`,
    );
  });

  it("rejects non-repositories and dirty repositories", async () => {
    const plain = await mkdtemp(join(tmpdir(), "tsqh-git-plain-"));
    const inspector = new LocalGitInspector();
    await expect(inspector.openCleanWorkspace(plain, [])).rejects.toThrow(
      /Workspace is not a Git worktree:/u,
    );

    const root = await repository();
    await writeFile(join(root, "dirty.txt"), "dirty\n", "utf8");
    await expect(inspector.openCleanWorkspace(root, [])).rejects.toThrow(
      "Workspace Git worktree is not clean.",
    );
  });

  it("fingerprints files, deletions, and symbolic links", async () => {
    const root = await repository();
    const inspector = new LocalGitInspector();
    await writeFile(join(root, "added.txt"), "added\n", "utf8");
    await symlink("added.txt", join(root, "link.txt"));
    await unlink(join(root, "seed.txt"));

    const snapshot = await inspector.snapshot(root);

    expect(Object.keys(snapshot.fingerprints).sort()).toEqual(["added.txt", "link.txt", "seed.txt"]);
    expect(snapshot.fingerprints["added.txt"]).toMatch(/^\?\?:file:\d+:[a-f0-9]{64}$/u);
    expect(snapshot.fingerprints["link.txt"]).toMatch(/^\?\?:symlink:\d+:added\.txt$/u);
    expect(snapshot.fingerprints["seed.txt"]).toBe(" D:deleted");
  });

  it("returns only changed fingerprints in sorted order", async () => {
    const root = await repository();
    const inspector = new LocalGitInspector();
    const before = await inspector.snapshot(root);
    await writeFile(join(root, "z.txt"), "z\n", "utf8");
    await writeFile(join(root, "a.txt"), "a\n", "utf8");

    expect(await inspector.changedPathsSince(root, before)).toEqual(["a.txt", "z.txt"]);

    const withFiles = await inspector.snapshot(root);
    await writeFile(join(root, "a.txt"), "changed\n", "utf8");
    await unlink(join(root, "z.txt"));
    expect(await inspector.changedPathsSince(root, withFiles)).toEqual(["a.txt", "z.txt"]);

    await writeFile(join(root, "z.txt"), "z again\n", "utf8");
    await writeFile(join(root, "keep.txt"), "keep\n", "utf8");
    const current = await inspector.snapshot(root);
    const deliberatelyUnsorted = {
      fingerprints: {
        "z.txt": "old",
        "keep.txt": current.fingerprints["keep.txt"]!,
        "a.txt": "old",
      },
    };
    expect(await inspector.changedPathsSince(root, deliberatelyUnsorted)).toEqual(["a.txt", "z.txt"]);
  });

  it("rejects a changed symbolic link that resolves outside the workspace", async () => {
    const root = await repository();
    const outside = join(dirname(root), "outside.txt");
    await writeFile(outside, "outside\n", "utf8");
    await symlink(outside, join(root, "outside-link.txt"));

    await expect(new LocalGitInspector().snapshot(root)).rejects.toThrow(
      "Changed path resolves outside the workspace: outside-link.txt.",
    );
  });

  it("rejects a link to the workspace parent and a broken link", async () => {
    const parentLinkRoot = await repository();
    await symlink("..", join(parentLinkRoot, "parent-link"));
    await expect(new LocalGitInspector().snapshot(parentLinkRoot)).rejects.toThrow(
      "Changed path resolves outside the workspace: parent-link.",
    );

    const brokenLinkRoot = await repository();
    await symlink("missing.txt", join(brokenLinkRoot, "broken-link"));
    await expect(new LocalGitInspector().snapshot(brokenLinkRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a changed path that is not a file or symbolic link", async () => {
    await withFakeGit(statusScript(Buffer.from("?? directory\0")), async (root) => {
      await mkdir(join(root, "directory"));
      await expect(new LocalGitInspector().snapshot(root)).rejects.toThrow(
        "Changed path is not a regular file or symbolic link: directory.",
      );
    });
  });

  it.each([
    [Buffer.from("?? file.txt"), "Git status output was not NUL terminated."],
    [Buffer.from("bad\0"), "Git status returned a malformed path record."],
    [Buffer.from("?? \0"), "Git status returned a malformed path record."],
    [Buffer.from("??xfile.txt\0"), "Git status returned a malformed path record."],
    [Buffer.from("?? ../escape.txt\0"), "Git returned an invalid or ambiguous changed path"],
    [Buffer.from("?? trailing/\0"), "Git returned an invalid or ambiguous changed path"],
    [Buffer.from([0xff, 0]), "Git status output is not valid UTF-8."],
  ] as const)("rejects malformed status output", async (output, message) => {
    await withFakeGit(statusScript(output), async (root) => {
      await expect(new LocalGitInspector().snapshot(root)).rejects.toThrow(message);
    });
  });

  it("accepts the shortest valid status record", async () => {
    await withFakeGit(statusScript(Buffer.from("?? a\0")), async (root) => {
      await expect(new LocalGitInspector().snapshot(root)).resolves.toEqual({
        fingerprints: { a: "??:deleted" },
      });
    });
  });

  it("preserves exact Git exit, signal, and spawn diagnostics", async () => {
    await withFakeGit("process.stderr.write('bad status\\n'); process.exit(7);", async (root) => {
      await expect(new LocalGitInspector().snapshot(root)).rejects.toThrow(
        "Git status failed: bad status",
      );
    });
    await withFakeGit("process.kill(process.pid, 'SIGTERM');", async (root) => {
      await expect(new LocalGitInspector().snapshot(root)).rejects.toThrow(
        "Git ended from signal 'SIGTERM'.",
      );
    });

    const emptyPath = await mkdtemp(join(tmpdir(), "tsqh-no-git-"));
    await withPath(emptyPath, async () => {
      await expect(new LocalGitInspector().snapshot(emptyPath)).rejects.toThrow(/spawn git ENOENT/u);
    });
  });

  it("bounds both Git output streams", async () => {
    await withFakeGit(
      "process.stdout.write(Buffer.alloc(4194305));",
      async (root) => {
        await expect(new LocalGitInspector().snapshot(root)).rejects.toThrow(
          "Git output exceeded the bounded capture limit.",
        );
      },
    );
    await withFakeGit(
      "process.stderr.write(Buffer.alloc(4194305));",
      async (root) => {
        await expect(new LocalGitInspector().snapshot(root)).rejects.toThrow(
          "Git output exceeded the bounded capture limit.",
        );
      },
    );
  });

  it("accepts exactly the bounded capture limit on either stream", async () => {
    const invalidStatusAtLimit = Buffer.alloc(4_194_304, 97);
    invalidStatusAtLimit.set(Buffer.from("?? ../"));
    invalidStatusAtLimit[invalidStatusAtLimit.length - 1] = 0;
    await withFakeGit(statusScript(invalidStatusAtLimit), async (root) => {
      await expect(new LocalGitInspector().snapshot(root)).rejects.toThrow(
        "Git returned an invalid or ambiguous changed path",
      );
    });

    const script = [
      "process.stdout.write(Buffer.from('YmFkAA==', 'base64'));",
      "process.stderr.write(Buffer.alloc(4194304));",
    ].join("\n");
    await withFakeGit(script, async (root) => {
      await expect(new LocalGitInspector().snapshot(root)).rejects.toThrow(
        "Git status returned a malformed path record.",
      );
    });
  });

  it("passes Git only its fixed environment and inherited runtime paths", async () => {
    const secretKey = "TSQH_GIT_INSPECTOR_SECRET";
    process.env[secretKey] = "must-not-leak";
    try {
      const script = [
        `if (process.env.${secretKey}) process.exit(8);`,
        "if (process.env.LC_ALL !== 'C') process.exit(9);",
        "if (process.env.GIT_OPTIONAL_LOCKS !== '0') process.exit(10);",
        "if (!process.env.PATH || !process.env.HOME) process.exit(11);",
        "process.stdout.write('');",
      ].join("\n");
      await withFakeGit(script, async (root) => {
        await expect(new LocalGitInspector().snapshot(root)).resolves.toEqual({ fingerprints: {} });
      });
    } finally {
      delete process.env[secretKey];
    }
  });

  it("reports invalid UTF-8 while resolving the repository root", async () => {
    const script = [
      "if (process.argv.includes('rev-parse')) { process.stdout.write(Buffer.from([255])); process.exit(0); }",
      "process.stdout.write(Buffer.from([0]));",
    ].join("\n");
    await withFakeGit(script, async (root) => {
      await expect(new LocalGitInspector().openCleanWorkspace(root, [])).rejects.toThrow(
        "Git output is not valid UTF-8.",
      );
    });
  });
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-git-inspector-"));
  await writeFile(join(root, "seed.txt"), "seed\n", "utf8");
  await git(root, ["init", "--quiet"]);
  await git(root, ["config", "user.email", "tests@tsqh.local"]);
  await git(root, ["config", "user.name", "TSQH Tests"]);
  await git(root, ["add", "seed.txt"]);
  await git(root, ["commit", "--quiet", "-m", "fixture"]);
  return realpath(resolve(root));
}

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync("git", [...args], { cwd });
}

function statusScript(output: Buffer): string {
  return `process.stdout.write(Buffer.from('${output.toString("base64")}', 'base64'));`;
}

async function withFakeGit(
  body: string,
  action: (workspace: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "tsqh-fake-git-"));
  const bin = join(root, "bin");
  const workspace = join(root, "workspace");
  await mkdir(bin);
  await mkdir(workspace);
  const executable = join(bin, "git");
  await writeFile(executable, `#!${process.execPath}\n${body}\n`, "utf8");
  await chmod(executable, 0o755);
  await withPath(bin, async () => action(await realpath(workspace)));
}

async function withPath(path: string, action: () => Promise<void>): Promise<void> {
  const previous = process.env.PATH;
  process.env.PATH = path;
  try {
    await action();
  } finally {
    if (previous === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previous;
    }
  }
}
