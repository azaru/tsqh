# Development Status

Updated: 2026-09-30

## Current position

Active specification: [TSQH-MVP-008](specs/TSQH-MVP-008-static-analysis-and-security-guardrails.md).
MVP-001 through MVP-007 are the completed baseline; MVP-008 is in progress.

MVP-008 is decomposed into twelve product-only task briefs. The briefs are local working files under
`specs/tasks/` and are intentionally not versioned (see [dogfooding workflow](specs/dogfooding-workflow.md)
and [task authoring](specs/task-authoring.md)); a public checkout will not contain them.

- Task 01 (public package boundary) is integrated: `6520b9d`, with a deterministic-build fix at
  `8a655d4`.
- Task 02 (package installation) is next, from a fresh candidate on the current integration state.
- The `simple` pack runs `tester -> implementer -> quick -> acceptance -> passed`. The system-owned
  acceptance gate checks the tester's `test/acceptance.json` manifest without parsing the task
  document.

## Verification

- `CI=true pnpm build`, `CI=true pnpm typecheck`: exit 0.
- `CI=true pnpm quality:quick`: exit 0, 807 tests in 32 files; architecture inspected 7 entries.
- Task 01 adversarial review: build, `npm pack`, npm and pnpm installs, and relocated
  `tsqh run` / public-export checks all exit 0; tarball forbidden-path scan empty.
- No Task 02 implementation, real `tsqh demo` smoke, opted-in eight-stage chain, real Codex smoke, or
  final MVP-008 acceptance has run.

## Blockers

None for Task 02. MVP-008 as a whole remains unaccepted until its remaining task slices and the
final acceptance chain pass. Attempts 16 through 18 of the Task 01 dogfooding campaign were
stopped and must not be resumed; details are in [STATUS-HISTORY.md](STATUS-HISTORY.md).

## Next action

Start a fresh Task 02 candidate from the current integration state.
