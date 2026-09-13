# Development Status

Updated: 2026-09-14

## Current position

- Active specification: [TSQH-MVP-008](specs/TSQH-MVP-008-static-analysis-and-security-guardrails.md),
  not implemented. MVP-001 through MVP-007 remain the completed baseline.
- No MVP-008 campaign task is integrated. Task 01 attempt 01 ended with TSQH exit 1:
  `tester:completed -> implementer:agent-timeout`; no controller quick visit occurred.
- The blocked candidate remains unchanged by the coordinator and is retained as evidence.
  New task inputs are local ignored files under `specs/tasks/`.

## Current verification

- Necessary harness fixture isolation and Stryker sandbox fixes are verified. No production code,
  assertions, mutation scope, checker, gate threshold or gate order changed.
- Targeted tests: exit 0, 23/23 tests in 2 files. `pnpm quality:quick`: exit 0, 786/786 in 29 files.
- Fresh `pnpm quality:full`: exit 0, exact six-stage order. Mutation: 3249 Killed and 1239
  CompileError, no other states. Approved Sonar analysis `ad05050e-1188-48ec-8b0f-dd2159463698`
  computed gate OK. The tracked integration diff stayed unchanged during full.
- Evidence: `tmp/codex-mvp008-harness-isolation/verified-harness-summary.json` and retained logs
  and reports. Detailed attempts and evidence are in [STATUS-HISTORY.md](STATUS-HISTORY.md).
- This is harness verification, not an MVP-008 package acceptance or real Codex smoke pass.

## Current blocker and next action

Task 01 attempt 02 from `1f3048f` ended with TSQH exit 1, `visit-limit-exceeded` after three
implementer and three quick visits. Each quick failed with 829 passed/2 failed tests and no
candidate-path changes. Repairs 2 and 3 made no changes. No campaign task is integrated.

The two tests called the raw dependency CLI, so TSQH resolver changes could not affect their
ancestor-engine fallback result. Task 01 now explicitly tests TSQH's own guarded installed-engine
resolution/launch, preserving real identity, missing-engine, no-fallback and no-download checks.
Create a fresh tester-first attempt from the verified harness commit; never edit or reuse the
exhausted candidate's implementation. Evidence is retained under `tmp/codex-mvp008-01/attempt-02/`.
