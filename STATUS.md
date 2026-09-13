# Development Status

Updated: 2026-09-14

This file is the concise current snapshot. Detailed verification, completed-increment evidence,
and superseded blockers live in [`STATUS-HISTORY.md`](STATUS-HISTORY.md).

## Current position

- Active specification: [`TSQH-MVP-008`](specs/TSQH-MVP-008-static-analysis-and-security-guardrails.md),
  planned and not implemented.
- Baseline: MVP-001 through MVP-007 are complete. The version 0 controller and the `simple` and
  `tdd-pipeline` workflow packs are present; the current executable quality chain remains
  `quick -> coverage -> crap -> knip -> mutation -> sonar`.
- MVP-009 is planned after MVP-008, followed by MVP-010. Neither is implemented.

## Current verification and blockers

- The restarted Task 01 run was stopped at the user's request before a completed tester result
  was observed. Its candidate worktree and recovered task inputs were removed. The user then
  removed temporary run evidence; no retained trace or real Codex smoke pass is claimed.
- Eight new task specifications and a campaign plan were authored from the current MVP-008
  specification and operational workflow under ignored `specs/tasks/`. No replacement run has
  started, no task has been integrated, and no candidate implementation remains from this restart.
- Dependency installation and the controller build exited zero during the cancelled preparation;
  their temporary logs are no longer available. These observations are not release evidence.
- No fresh test-suite, `quality:quick`, `quality:full`, package-install, mutation, or Sonar success
  is claimed. Earlier mutation and Sonar blockers need fresh verification before integration.

## Next action

Use the newly authored campaign plan in `specs/tasks/mvp008-campaign.md`. Before dispatching its
Task 01, inspect the current committed integration state and validate the necessary harness and
policy prerequisites. Run implementation only through the checked-in simple workflow in a fresh
worktree; require installed-consumer evidence and all required gates before integration.

## Maintenance rule

Keep this file limited to current position, verification, blockers, and next action. Move detailed
completed-increment evidence, workflow traces, and replaced status snapshots to
[`STATUS-HISTORY.md`](STATUS-HISTORY.md). Historical evidence must never be treated as current
release evidence.
