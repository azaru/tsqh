# Development Status

Updated: 2026-09-14

## Current position

Active specification: [TSQH-MVP-008](specs/TSQH-MVP-008-static-analysis-and-security-guardrails.md),
not implemented. MVP-001 through MVP-007 remain the completed baseline. No campaign task is
integrated. Fresh task inputs are ignored under `specs/tasks/`; previous candidates remain evidence.

Task 01 attempt 05 exhausted all three implementer/quick visits (TSQH exit 1). Each quick exited 1:
864/865 tests completed, with worker heap exhaustion in a tester-owned native-buffer comparison.
Separate Knip verification exited 1 for a test-helper type exported without external use. Tester
files remained unchanged; every gate reported no candidate mutation. No candidate full, mutation
or Sonar ran. Exact trace and outcomes: `tmp/codex-mvp008-01/attempt-05/outcome-evidence.json`.

Attempt 06 then blocked in the tester with `agent-exit-nonzero` before implementer or gates. Its
Codex stderr was truncated after the echoed assignment, so the provider failure cause is not
recoverable from the retained event. The run is evidence only; no Task 01 candidate is integrated.

## Current verification

The necessary simple-provider timeout correction from 900000 to 1800000 ms is verified.
Model, sandbox, transitions, visits, native gate timeouts and quality policy are unchanged.

- Configuration tests: exit 0, 30 tests in 1 file.
- `pnpm quality:quick`: exit 0, 786 tests in 29 files.
- `pnpm quality:full`: exit 0, `quick -> coverage -> crap -> knip -> mutation -> sonar`.
- Mutation: 3249 Killed, 1239 CompileError, no other status.
- Approved Sonar analysis `255c63e4-ab3a-4d21-a2e5-db36b85d1cff`: computed gate OK.
- Tracked integration diff remained unchanged throughout full.
- Provider-output observability changes have targeted coverage. The current run-path checks use
  only targeted Vitest/type checks; no `quality:*` command is part of this verification.
- `CI=true pnpm exec vitest run test/application/controller.test.ts test/workflow/tester-validation.test.ts
  test/adapters/command-runner.test.ts test/adapters/trace-store.test.ts`: exit 0, 156 tests in 4
  files. `CI=true pnpm typecheck`, `CI=true pnpm build`, `node --check
  workflows/simple/validate-tester.mjs`, and `git diff --check` also exited 0.
- Verification-policy reconciliation is recorded across `AGENTS.md`, `README.md`,
  `specs/dogfooding-workflow.md`, and the simple pack. The selected workflow is authoritative for
  campaign acceptance; `quality:full` is not an implicit gate when absent from that workflow.
- The simple pack now has a `tester-validation` gate before implementation. Targeted validation
  covers expected-red assertion failures, malformed reports, OOM and missing fixtures; it does not
  invoke Knip. The workflow/controller checks pass, including the provider-log path in blockers.

Exact commands, logs and copied reports: `tmp/codex-mvp008-provider-timeout/`, including
`verified-harness-summary.json`. This verifies the harness, not MVP-008 candidate acceptance.
Earlier evidence belongs in [STATUS-HISTORY.md](STATUS-HISTORY.md).

## Next action

Task 01 is paused at the user's request. The current focus is the run path: configured workflow
steps are authoritative, provider failures retain a run-owned log path, and tester validation does
not launch unconfigured quality commands. No real Codex smoke, fresh candidate, or hardener run is
claimed. Next action: finish targeted run-path verification before creating a fresh candidate.
