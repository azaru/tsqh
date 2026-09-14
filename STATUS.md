# Development Status

Updated: 2026-09-14

## Current position

Active specification: [TSQH-MVP-008](specs/TSQH-MVP-008-static-analysis-and-security-guardrails.md),
not implemented. MVP-001 through MVP-007 remain the completed baseline. No campaign task is
integrated. Fresh task inputs are ignored under `specs/tasks/`; previous candidates remain evidence.

Task 01 attempt 03 passed the real Codex-backed TSQH trace `tester -> implementer -> quick -> passed`
(exit 0; 857 tests), but release full failed at CRAP (exit 2); separate Knip diagnosis failed
(exit 1). Attempt 04 timed out in tester at 900000 ms (TSQH exit 1), before implementer/gates.
Neither candidate is approved for integration. Detailed evidence is in the ignored campaign plan.

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

Commit the verified harness correction and create Task 01 attempt 05 from that clean integration
commit. Execute the exact freshly authored task through the checked-in simple workflow. Do not
copy or manually repair previous candidates; require installed-consumer acceptance and full before
integration. Task 01 must address meaningful source coverage, bounded complexity and genuine tool
usage while preserving its installed-package acceptance requirements.
