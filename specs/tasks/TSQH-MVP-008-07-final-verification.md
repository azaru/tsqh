# Task 07 — final acceptance verification

## Objective

Perform the fresh, requirement-by-requirement MVP-008 verification from the latest integrated
commit and record exact evidence and blockers. This is a verification task; it may update only
current status and campaign evidence, never implementation behavior.

## Scope

- Real failing/corrected Gitleaks, ESLint/security, and dependency-cruiser fixtures.
- Both package-manager packed installs, all three demo entrypoints, configured workflow trace,
  `pnpm quality:quick`, opted-in eight-stage full chain, complete non-incremental mutation, and
  approved dedicated Sonar target.
- Acceptance audit, package/temporary/report cleanup, and exact delivery report.

## Non-goals

No new feature work, gate weakening, evidence relabeling, mutation threshold changes, Sonar target
changes, remote publication, credential persistence, or unrelated cleanup.

## Dependencies

Task 06 integrated commit.

## Allowed paths

Verification may write only invocation-owned `tmp/codex-TSQH-MVP-008-07-final-verification/` and
sanitized durable evidence under the approved ignored reports directory. A current `STATUS.md`
update is allowed only to reconcile demonstrated state or an exact blocker. All source, tests,
package policy, workflows, prompts, schemas, and task authority are protected.

## Acceptance criteria

Every numbered requirement and acceptance scenario in MVP-008 has direct current evidence. All
required gates that are runnable pass; unavailable credentials/services, process signals, or other
red gates remain explicitly blocked with their exact exit/status facts. No historical result is
presented as current.

## Tests and gates

Run the full specified verification, preserving stage order and all thresholds. Run documentation
checks for evidence files and `git diff --check`; no required gate may be skipped or weakened.

## Failure and repair cases

A failed verification is recorded as failed or blocked with the precise requirement, command,
exit status, and next action. It is not inferred as a pass from partial evidence.

## Required evidence

Exact changed files, commands and exit statuses, runtime/client/package versions, test totals,
task-by-task and final workflow traces, repairs, package artifacts/install identities, cleanup
results, limitations, and blockers. A real Codex smoke is reported only if it ran.

## Cleanup and integration

Remove only task-07 invocation paths after all evidence is durable. No source integration is
permitted; completion requires the audit and delivery report to withstand scrutiny.
