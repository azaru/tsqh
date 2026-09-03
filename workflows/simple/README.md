# Simple workflow pack

This self-contained pack demonstrates the smallest complete TSQH hardening workflow. One
implementation agent is followed by the six configured native quality gates. Any ordinary gate
failure re-dispatches the same bounded implementation owner with compact failure context and
restarts the chain from `quick`.

```text
implement -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed
             \-> repair --------------------------------------------/
```

The writing role is limited to `src/` and `test/`. The controller validates its Git-visible changes
after every agent step. Gates must not mutate the candidate. Gate-driven assignments omit the prior
agent handoff and include at most 8 KiB from each failed native output stream.

Run this pack from a built TSQH checkout with a separate clean candidate worktree:

```sh
pnpm tsqh run \
  --config workflows/simple/workflow.json \
  --workspace /absolute/path/to/a/clean-git-worktree \
  --task workflows/simple/task.md
```

The provider command and quality profiles are ordinary configuration. They may require local
credentials or tool availability, especially the Sonar profile.
