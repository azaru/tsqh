# Development Status

Updated: 2026-09-14

## Current position

Active specification: [TSQH-MVP-008](specs/TSQH-MVP-008-static-analysis-and-security-guardrails.md).
MVP-001 through MVP-007 remain the completed baseline; MVP-008 is not integrated. The current
`dogfooding` branch contains the harness realignment that restores the simple pack to
`tester -> implementer -> quick -> acceptance -> passed`. MVP-008 is now decomposed into twelve
product-only task slices under `specs/tasks/`; Task 01's first reduced candidate has passed the
configured workflow and the external package-boundary review and is ready for integration review.
Task briefs stay opaque to acceptance verification. The tester owns a test acceptance manifest; the
system validates that manifest and its one-or-more test markers without parsing the task's authoring
format. The task-authoring guide now contains soft size/scope heuristics for the simple workflow.

No candidate implementation or Task 01 integration is retained on the branch. Attempt 15 completed
the simple dogfooding trace, but review found missing package-root tool resolution and Gitleaks
preflight evidence; its candidate remains isolated under the task-owned temporary path. Attempts 11
through 14 were stopped before acceptance. Attempt 12 was stopped during tester visit 1 after it
modified baseline quality tests instead of adding only task tests. Attempt 13 was stopped during
tester visit 1 after prolonged startup exploration; its candidate was clean at the stop. Attempt 14
timed out in implementer visit 1 at the 30-minute provider limit. The pre-existing
`CONTRIBUTING.md` deletion remains part of the harness-policy commit.

## Harness diagnosis

Attempt 07 reached `tester` completion, then the added `tester-validation` gate blocked a valid
Vitest expected-red report because it compared two nested failed suites with one top-level file
entry. Commit `8a9bf75` corrected that validator, but the extra gate was not part of the intended
simple TDD flow. Attempts 08–10 were interrupted before a complete tester transition; none
produced implementation or acceptance evidence.

The simple pack no longer has `tester-validation` or `validate-tester.mjs`; tester output remains
agent evidence. `quick` is followed by a system-owned `task-acceptance` gate that reads the tester's
changed `test/acceptance.json` manifest and checks one or more tagged tests per manifest requirement.
It does not parse the task document or impose its authoring format. A missing, malformed,
missing-marker, or unknown-marker manifest returns a normal gate failure to the tester; the gate
cannot prove semantic coverage of free-form product prose. The current policy sends a failed `quick`
result back to the tester for a bounded test-suite review before implementation rework. The prompt
composer identifies initial versus gate-failure re-entry invocations and omits empty diagnostic
sections. The tester prompt preserves baseline tests. No controller transition logic was required
beyond the configured acceptance gate execution.

## Verification

- Task 01 adversarial review: candidate build exit 0; npm pack exit 0; npm install exit 0; pnpm
  install exit 0; relocated npm/pnpm installed `tsqh run` exit 0; relocated public-export checks
  exit 0; tarball forbidden-path scan empty. The review used isolated fixtures under attempt 19 and
  did not modify candidate tracked paths.
- Harness realignment: workflow load exit 0 with the configured tester re-entry edge.
- Prompt re-entry behavior: targeted prompt/controller tests passed, 57 tests in 2 files.
- Simple provider timeout: configured at 3,600,000 ms for the next candidate.
- Attempt 15 simple workflow: exit 0; 798 tests in 30 files passed after one quick failure and
  tester re-entry.
- `CI=true pnpm build`: exit 0.
- `CI=true pnpm typecheck`: exit 0.
- Acceptance evidence targeted checks: 8 tests in 2 files passed, including arbitrary task-format,
  manifest validation, one-or-more marker coverage, missing/unknown markers, and controller
  re-entry cases.
- `CI=true pnpm quality:quick`: exit 0, 803 tests in 31 files; architecture inspected 7 entries.
- Candidate 15 review remains negative: no changes under `src/` or `scripts/`; its distribution
  suite did not exercise installed quality tools or the Gitleaks engine.
- No Task 01 implementation has been integrated; the real Codex workflow, package-boundary review,
  and acceptance evidence remain isolated. No real demo smoke, opted-in eight-stage chain, or final
  MVP-008 acceptance has passed.

## Blockers

Task 01 remains unaccepted. Attempt 11 quick reached 803 passed and 2 failed tests; both failures
were the same unsatisfiable relocated-root assertion in the tester-created suite. Attempt 12 was
stopped during tester visit 1 after changes to `test/quality/cli.test.ts`,
`test/quality/gates.test.ts`, and new `test/package/` files. Attempt 13 was stopped during tester
visit 1 with no candidate changes observed. Attempt 14 was stopped after the implementer exhausted
its 1,800,000 ms timeout before `quick`. Attempt 15 completed the configured simple trace with
tester re-entry and `quick` exit 0, but review found that the candidate does not satisfy Task 01
acceptance for package-root tool resolution, installed Gitleaks preflight, or genuine use of all
provisioned runtime tools. It is not integrated. Attempt 16 was stopped before tester changes while
the first task-authoring/verification separation was corrected. Attempt 17 was stopped during
implementer visit 1 after the remaining coupling was identified; its candidate remains isolated.
Attempt 18 was stopped during implementer visit 1 for a scope reset after the tester produced a
six-requirement distribution suite; no quick, acceptance, or integration evidence exists. Attempt
19 completed the reduced Task 01 workflow and passed the task-scoped external consumer review, but
its candidate is still not integrated. Do not resume attempts 16 through 18.
Detailed historical notes remain in
[STATUS-HISTORY.md](STATUS-HISTORY.md); old attempts 12 and 13 were cleaned before attempt 14.
