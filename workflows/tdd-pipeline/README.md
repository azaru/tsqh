# TDD pipeline workflow pack

This self-contained pack is a TSQH-owned sequential TDD pipeline. It uses the upstream workflow
ideas as provenance only; it does not reproduce Swarm Forge's tmux, worktree, dashboard, or durable
handoff runtime.

## Workflow

```text
specifier -> tester -> implementer -> quick -> cleaner -> quick
          -> architect -> quick -> hardener -> quick -> full -> passed

quick after implementer      --failed--> implementation-rework --completed--> quick
quick after cleaner          --failed--> cleanup-rework        --completed--> quick
quick after architect        --failed--> hardening-rework     --completed--> quick
quick after hardener         --failed--> hardening-rework     --completed--> quick
full                         --failed--> hardening-rework     --completed--> quick -> full
```

The `tester` writes the complete behavioral test suite, including relevant edge cases. The
`implementer` writes production only. The `cleaner` uses the `code-simplifier` skill to preserve
behavior while reducing complexity, the `architect` applies the smallest structural correction,
and the `hardener` applies production hardening. There is no QA role; `full` is the final native
quality gate.

The controller runs `quick` after every writing or review phase from `implementer` onward. The
`full` profile then runs the complete fail-fast quality chain. A failed `full` gate returns to
`hardener`, then re-verifies with `quick` before trying `full` again. Each rework path is finite.

| Role | Primary responsibility | Write authority |
| --- | --- | --- |
| `specifier` | Produce a deterministic behavior brief | Read-only |
| `tester` | Write the complete observable behavior suite | `test/` |
| `implementer` | Implement the accepted behavior | `src/` |
| `cleaner` | Simplify production without changing behavior | `src/` |
| `architect` | Own architecture and justified design-pattern corrections | `src/` |
| `hardener` | Resolve findings and harden production | `src/` |

Every agent uses a fresh provider process. Successful bounded output becomes untrusted context for
the next configured agent. Gate output is diagnostic evidence only and cannot select a transition.
Gates must not mutate the candidate. A missing, malformed, contradictory, or unauthorized result
blocks.

## Use

Run this pack from a built TSQH checkout with a separate clean candidate worktree:

```sh
pnpm tsqh run \
  --config workflows/tdd-pipeline/workflow.json \
  --workspace /absolute/path/to/a/clean-git-worktree \
  --task workflows/tdd-pipeline/task.md
```

The provider command and quality profiles are ordinary configuration. The `full` profile may
require local Sonar credentials and service availability.
