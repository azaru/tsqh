# Simple workflow pack

This self-contained pack demonstrates a small TDD workflow. A `tester` first writes the complete
behavioral test suite, including relevant edge cases, an `implementer` makes it pass, and the
configured `quick` quality gate validates and executes the candidate. The task-acceptance gate then
verifies that every `AC-*` criterion in the task has a tagged test. A failed gate returns to the
tester for a bounded review of the existing suite before implementation rework; there is no generic
repair step.

```text
tester -> implementer -> quick -> acceptance -> passed
      ^                    |         |
      |                    └─────────┘
      └──────────────────────────────
```

The tester may write only under `test/`; the implementer may write only within the path prefixes
supplied by the current assignment. The normal example task grants `src/`; a campaign may grant
additional package, schema, script, pack, or documentation paths while keeping workflow policy,
task authority, prompts, credentials, reports, and temporary paths protected. On re-entry, the
tester preserves valid tests and changes only tests proven invalid, contradictory, or outside the
assignment. The controller validates Git-visible changes after every agent step. The
task-acceptance gate is system-owned; it does not validate this workflow's example configuration or
trust a tester summary to select a transition.
Gates must not mutate the candidate. Gate-driven assignments omit the prior agent handoff and
include at most 8 KiB from each failed native output stream. The JSON workflow is the controller's
execution policy; task and README prose does not add steps or gates.

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
