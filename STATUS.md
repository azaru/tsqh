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

## Current verification

The necessary simple-provider timeout correction from 900000 to 1800000 ms is verified.
Model, sandbox, transitions, visits, native gate timeouts and quality policy are unchanged.

- Configuration tests: exit 0, 30 tests in 1 file.
- `pnpm quality:quick`: exit 0, 786 tests in 29 files.
- `pnpm quality:full`: exit 0, `quick -> coverage -> crap -> knip -> mutation -> sonar`.
- Mutation: 3249 Killed, 1239 CompileError, no other status.
- Approved Sonar analysis `255c63e4-ab3a-4d21-a2e5-db36b85d1cff`: computed gate OK.
- Tracked integration diff remained unchanged throughout full.

Exact commands, logs and copied reports: `tmp/codex-mvp008-provider-timeout/`, including
`verified-harness-summary.json`. This verifies the harness, not MVP-008 candidate acceptance.
Earlier evidence belongs in [STATUS-HISTORY.md](STATUS-HISTORY.md).

## Next action

Task 01 instructions now require efficient exact native-byte comparison, private unused helper
types, and tester Knip verification. Create attempt 06 from the clean integration commit and use
the checked-in simple workflow with that exact ignored task. Do not copy or manually repair prior
candidates. Require controller success, installed-consumer acceptance and full before integration.
