# Simple workflow pack

This self-contained pack demonstrates a small TDD workflow. A `tester` first writes the complete
behavioral test suite, including relevant edge cases, an `implementer` makes it pass, and one native
`quick` quality gate validates the candidate. A failed gate returns directly to `implementer`; there
is no generic repair step and the tester is not re-dispatched.

```text
tester -> implementer -> quick -> passed
                           ^        |
                           └────────┘
```

The tester may write only under `test/`; the implementer may write only under `src/`. The tester's
behavioral suite is the implementer's acceptance contract and is not rewritten during
implementation or rework. The controller validates Git-visible changes after every agent step.
Gates must not mutate the candidate. Gate-driven assignments omit the prior agent handoff and
include at most 8 KiB from each failed native output stream.

Run this pack from a built TSQH checkout with a separate clean candidate worktree:

```sh
pnpm tsqh run \
  --config workflows/simple/workflow.json \
  --workspace /absolute/path/to/a/clean-git-worktree \
  --task workflows/simple/task.md
```

The provider command and quick quality profile are ordinary configuration. This pack deliberately
does not run `quality:full`, coverage, CRAP, Knip, mutation, or Sonar. Those checks remain outside
this short TDD loop.
