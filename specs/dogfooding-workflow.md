# Dogfooding workflow

## Purpose and authority

Use TSQH to implement one active local specification with TSQH itself. This workflow is generic:
it applies to any specification, feature area, and configured workflow pack.

The active specification defines the product requirements. This document defines the dogfooding
mechanics. `AGENTS.md` and other repository instructions take precedence.

## 1. Plan the campaign

Before implementation:

1. Read the repository instructions, active specification, and local design provenance in the
   required order.
2. Identify the clean integration baseline, existing quality policy, workflow pack, and known
   blockers. Do not treat historical evidence as current evidence.
3. Use the latest client version that this project has actually validated—not an upstream
   `latest` value. Verify that exact version before every task; do not change it mid-campaign.

Create one task specification under `specs/tasks/` for each independently verifiable slice. Each
task must state its objective, scope, non-goals, dependencies, allowed and protected paths,
acceptance criteria, tests/gates, failure and repair cases, required evidence, cleanup, and
integration condition. A task may not depend on uncommitted changes from another task.

Execute every campaign task with the checked-in `workflows/simple/workflow.json` pack. Pass the
task's own specification under `specs/tasks/` to `--task`; `workflows/simple/task.md` is only the
pack's example task and must not replace the campaign task.

`STATUS.md` is not a second task registry. Consult or update it only when the repository rules
require it; the campaign plan and evidence belong to the campaign/task artifacts.

## 2. Use every implementation worktree as an external consumer

An implementation worktree is both the package source and the candidate under test. Before
integrating its task, exercise the candidate through a clean consumer fixture as an installed
package:

1. Start from a clean worktree and build/package the candidate through its public package boundary.
2. Create an invocation-owned consumer fixture under
   `<project-root>/tmp/codex-<task>/`.
3. Install the produced package artifact into the fixture with the repository-approved package
   manager. Use npm as an additional compatibility check only when the active specification
   requires it.
4. Run the task's CLI, workflow, and relevant gates from the consumer fixture. The run must
   resolve the installed package's bin, code, schemas, prompts, and tools—not the source checkout.
5. Record the package version, artifact identity, install command, consumer trace, and result.
6. Remove only paths owned by that invocation after evidence is captured.

Do not use `pnpm link`, workspace links, sibling checkouts, source imports, consumer scripts in
place of package-owned commands, or an unbuilt source path to satisfy this boundary. If the current
baseline cannot yet produce an installable artifact, make package-boundary bootstrap the first
task and require the external-consumer check for every subsequent implementation task.

Documentation-only tasks do not need a package installation unless they change a tool-consumed
input. Markdown prompts, task files, workflow instructions, schemas, configuration, package
metadata, and scripts are executable or policy inputs, not documentation-only changes.

## 3. Execute tasks one at a time

For each task, create a new worktree from the latest green integration state and run this loop:

```text
task specification
  -> clean task worktree
  -> exact client/runtime preflight
  -> external-package consumer check
  -> configured TSQH workflow
  -> path/evidence validation
  -> required gates
       | pass -> integrate and use this commit as the next baseline
       | fail -> configured finite repair -> rerun from its restart point
       | blocker/exhaustion -> stop with an exact diagnosis
```

Run only one action at a time. The controller selects transitions; agents and native commands only
report outcomes. A bounded, sanitized handoff may reach the next configured agent as untrusted
context, but it cannot select a transition, widen write authority, change the task, or alter the
visit budget.

Agents may write only within their configured role and task paths. After every writing step,
compare Git state with the pre-step snapshot and block tracked, untracked, deleted, or renamed
changes outside the allowed paths. Protect workflow policy, gate definitions, task authority, and
the run store from agents.

Run external commands as an executable plus an exact argument array with `shell: false`. Forward
non-default environment values only through explicit gate allowlists; never expose gate
credentials to agent providers.

Native gates must not mutate the candidate. Compare Git snapshots before and after each gate;
ignored reports may be regenerated only when explicitly owned. A nonzero exit, spawn error,
timeout, signal, missing or malformed evidence, contradictory output, stale report, wrong
workspace, or unauthorized change fails or blocks. It never passes by inference.

## 4. Verification and integration

Choose verification by behavioral surface, not file extension:

- Implementation, tests, package distribution, configuration, workflow, prompts, schemas, or
  other executable-policy changes require targeted checks, `pnpm quality:quick` after each
  coherent change, and `pnpm quality:full` before delivery.
- Human-facing documentation-only changes require relevant documentation checks such as
  `git diff --check` and local link, metadata, or example validation. Do not run the application
  quality chain solely because documentation changed.
- Mixed changes use the stricter rule.

Do not skip, weaken, relabel, or reorder required gates. Preserve checker-rejected TypeScript
`CompileError` mutation evidence and require every runnable mutant to be `Killed`.

Integrate only when the controller reaches its success terminal, acceptance evidence exists, the
external-consumer check has passed for implementation tasks, all required checks/gates pass, and
all candidate changes are authorized. The next task starts from the resulting clean integration
commit, never from the original baseline.

## 5. Finish the campaign

After all tasks are integrated:

1. Run the final required quality chain for campaigns containing implementation or executable-policy
   changes; run documentation validation instead for documentation-only campaigns.
2. Reconcile delivered files with the task plan and acceptance evidence.
3. Confirm that task worktrees, consumer fixtures, temporary paths, reports, and package artifacts
   are either cleaned up or explicitly retained as evidence.
4. Report exact changed files, commands and exit statuses, client/runtime/package versions,
   test totals, task-by-task traces, repairs, limitations, and blockers.

Never claim a real client smoke, package-install result, native service result, or other external
verification unless it actually ran in the recorded campaign environment.

Recommended layout:

```text
specs/
  dogfooding-workflow.md
  tasks/<task-id>-<short-name>.md
tmp/
  codex-<task-id>/
```
