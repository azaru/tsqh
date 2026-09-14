# Simple workflow pack

This self-contained pack demonstrates a small TDD workflow. A `tester` first writes the complete
behavioral test suite, including relevant edge cases. The `tester-validation` gate checks the
fixtures and expected-red evidence before an `implementer` is dispatched. One native `quick`
quality gate then validates the candidate. A failed tester-validation gate blocks without
dispatching a writer; a failed quick gate returns directly to `implementer`. There is no generic
repair step and the tester is not re-dispatched.

```text
tester -> tester-validation -> implementer -> quick -> passed
                                  ^             |
                                  └─────────────┘
```

The tester may write only under `test/`; the implementer may write only within the path prefixes
supplied by the current assignment. The normal example task grants `src/`; a campaign may grant
additional package, schema, script, pack, or documentation paths while keeping workflow policy,
task authority, prompts, credentials, reports, and temporary paths protected. The tester's
behavioral suite is the implementer's acceptance contract and is not rewritten during
implementation or rework. The controller validates Git-visible changes after every agent step.
Gates must not mutate the candidate. Gate-driven assignments omit the prior agent handoff and
include at most 8 KiB from each failed native output stream. The JSON workflow is the controller's
execution policy; task and README prose does not add steps or gates. Tester validation is a
configured native gate, not a controller-selected special case.

Run this pack from a built TSQH checkout with a separate clean candidate worktree:

```sh
pnpm tsqh run \
  --config workflows/simple/workflow.json \
  --workspace /absolute/path/to/a/clean-git-worktree \
  --task workflows/simple/task.md
```

The provider command and quick quality profile are ordinary configuration. This pack deliberately
does not run `quality:full`, coverage, CRAP, Knip, mutation, or Sonar. Those checks remain optional
standalone release checks outside this short TDD loop; a campaign coordinator must not append them
as acceptance gates to a run governed by this pack.
