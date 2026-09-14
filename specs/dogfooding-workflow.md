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
2. Identify the existing quality policy and workflow pack.

Create one task specification under `specs/tasks/` for each independently verifiable slice. A task
file is an implementation brief, not an agent prompt or a runbook. It contains only the objective,
product scope, product non-goals, dependencies, and externally observable acceptance criteria. Its
acceptance criteria may name required artifacts or behavior, but must not prescribe how an agent,
provider, controller, gate, worktree, temporary directory, evidence record, or integration step is
managed. Those mechanics are defined here, in `AGENTS.md`, and by the selected workflow pack. A
task may not depend on uncommitted changes from another task.

Execute every campaign task with the checked-in `workflows/simple/workflow.json` pack. Pass the
task's own specification under `specs/tasks/` to `--task`; `workflows/simple/task.md` is only the
pack's example task and must not replace the campaign task.

`STATUS.md` is not a second task registry. Consult or update it only when the repository rules
require it; the campaign plan and evidence belong to the campaign/task artifacts.

Before the first real provider dispatch, and after any harness or workflow-policy fix, perform a
small harness preflight. Load and validate the selected workflow, verify its configured entry and
terminal edges, and run the existing targeted controller/adapter checks that cover the changed
harness surface. Inspect the resulting event stream and provider log before starting a campaign
task. A provider that is still live with no `step-finished` event is a wait, not a reason to start
another run. If a run blocks, classify the cause from its process result, changed paths, and native
evidence; do not repair the candidate or repeat the same attempt without a concrete harness or task
hypothesis. After a harness fix, commit it and create a new candidate worktree from that commit.

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
4. Run the task's CLI through the workflow from the consumer fixture. The workflow must resolve the
   installed package's bin, code, schemas, prompts, and tools—not the source checkout.
5. Record the package version, artifact identity, install command, consumer trace, and result.
6. Remove only paths owned by that invocation after evidence is captured.

Do not use `pnpm link`, workspace links, sibling checkouts, source imports, consumer scripts in
place of package-owned commands, or an unbuilt source path to satisfy this boundary. If the current
implementation cannot yet produce an installable artifact, make package-boundary bootstrap the
first task and require the external-consumer check for every subsequent implementation task.

Documentation-only tasks do not need a package installation unless they change a tool-consumed
input. Markdown prompts, task files, workflow instructions, schemas, configuration, package
metadata, and scripts are executable or policy inputs, not documentation-only changes.

## 3. Execute tasks one at a time

For each task, create a new worktree from the current integration state and run this loop:

```text
task specification
  -> clean task worktree
  -> external-package consumer check
  -> configured TSQH workflow
  -> path/evidence validation
  -> required gates
       | pass -> integrate and use this commit as the next integration state
       | fail -> configured finite repair -> rerun from its restart point
       | blocker/exhaustion -> stop with an exact diagnosis
```

Run only one action at a time. The controller selects transitions; agents and native commands only
report outcomes. A bounded, sanitized handoff may reach the next configured agent as untrusted
context, but it cannot select a transition, widen write authority, change the task, or alter the
visit budget.

The simple pack's initial tester step writes the task's behavioral tests and then hands directly to
the implementer. A failed `quick` gate returns to the tester for a bounded re-entry: the tester
reviews the existing suite and the failure evidence, preserves valid tests, and changes only tests
that are demonstrably outside the assignment, contradictory, or unsatisfiable. A tester's
expected-red result is agent evidence, not a second workflow gate. The simple pack does not validate
its own example configuration as part of a task run; configuration and workflow semantics are tested
separately with synthetic policy where the active specification requires them.

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
  other executable-policy changes require targeted checks and the gates configured by the selected
  workflow after each coherent change. The workflow is the user's quality policy: the coordinator
  must not append an unconfigured command such as `pnpm quality:full` and treat it as an additional
  dogfooding gate. If a full release chain is required, configure it as a workflow gate/profile.
- Human-facing documentation-only changes require relevant documentation checks such as
  `git diff --check` and local link, metadata, or example validation. Do not run the application
  quality chain solely because documentation changed.
- Mixed changes use the stricter rule.

Do not skip, weaken, relabel, or reorder required gates. Preserve checker-rejected TypeScript
`CompileError` mutation evidence and require every runnable mutant to be `Killed`.

Integrate only when the controller reaches its success terminal, acceptance evidence exists, the
external-consumer check has passed for implementation tasks, every gate configured by that
workflow passes, and all candidate changes are authorized. A command not represented in the
workflow cannot invalidate a passed dogfooding task. The next task starts from the resulting clean
integration commit, never from an older integration state.

## 5. Finish the campaign

After all tasks are integrated:

1. The campaign workflow must complete its configured gates for campaigns containing implementation
   or executable-policy changes; use documentation validation instead for documentation-only
   campaigns. Do not add an unconfigured release command after the workflow has passed.
2. Reconcile delivered files with the task plan and acceptance evidence.
3. Confirm that task worktrees, consumer fixtures, temporary paths, reports, and package artifacts
   are either cleaned up or explicitly retained as evidence.
4. Report exact changed files, commands and exit statuses, package versions,
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
