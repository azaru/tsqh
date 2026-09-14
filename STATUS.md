# Development Status

Updated: 2026-09-14

## Current position

Active specification: [TSQH-MVP-008](specs/TSQH-MVP-008-static-analysis-and-security-guardrails.md).
MVP-001 through MVP-007 remain the completed baseline; MVP-008 is not integrated. The current
`dogfooding` branch contains the harness realignment that restores the simple pack to
`tester -> implementer -> quick -> passed`. Task 01 remains the current unintegrated
package-distribution slice, and its ignored task file is now an implementation brief only.

No candidate implementation, successful TSQH campaign task, installed-consumer acceptance result,
or Task 01 integration is retained. Attempts 11 through 13 were stopped before acceptance and their
task-owned temporary artifacts have been cleaned. Attempt 12 was stopped during tester visit 1
after it modified baseline quality tests instead of adding only task tests. Attempt 13 was stopped
during tester visit 1 after prolonged startup exploration; its candidate was clean at the stop. The
pre-existing `CONTRIBUTING.md` deletion remains part of the harness-policy commit.

## Harness diagnosis

Attempt 07 reached `tester` completion, then the added `tester-validation` gate blocked a valid
Vitest expected-red report because it compared two nested failed suites with one top-level file
entry. Commit `8a9bf75` corrected that validator, but the extra gate was not part of the intended
simple TDD flow. Attempts 08–10 were interrupted before a complete tester transition; none
produced implementation or acceptance evidence.

The simple pack no longer has `tester-validation` or `validate-tester.mjs`; tester output is agent
evidence and `quick` is the first native candidate gate. The current policy sends a failed `quick`
result back to the tester for a bounded test-suite review before implementation rework. The prompt
composer identifies initial versus gate-failure re-entry invocations and omits empty diagnostic
sections. The tester prompt preserves baseline tests. No controller transition logic change was
required.

## Verification

- Harness realignment: workflow load exit 0 with the configured tester re-entry edge.
- Prompt re-entry behavior: targeted prompt/controller tests passed, 57 tests in 2 files.
- `CI=true pnpm build`: exit 0.
- `CI=true pnpm typecheck`: exit 0.
- `CI=true pnpm quality:quick`: exit 0, 793 tests in 29 files; architecture inspected 7 entries.
- No fresh Task 01 implementation, package installation, real Codex smoke, opted-in eight-stage
  chain, or final MVP-008 acceptance has passed.

## Blockers

Task 01 remains unaccepted. Attempt 11 quick reached 803 passed and 2 failed tests; both failures
were the same unsatisfiable relocated-root assertion in the tester-created suite. Attempt 12 was
stopped during tester visit 1 after changes to `test/quality/cli.test.ts`,
`test/quality/gates.test.ts`, and new `test/package/` files. Attempt 13 was stopped during tester
visit 1 with no candidate changes observed. The next action is a fresh candidate from the committed
context-reduction and baseline-test-protection changes, with the simple pack returning quick
failures to the tester. Detailed historical notes remain in [STATUS-HISTORY.md](STATUS-HISTORY.md);
the old task-owned attempt artifacts have been removed.
