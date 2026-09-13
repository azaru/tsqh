# Development Status

Updated: 2026-09-13

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

- `CI=true pnpm test` — exit 1: 792 passed and 3 failed tests across 30 files. The known failures
  are the temporary Git-worktree and CommonJS fixture issues.
- `CI=true pnpm quality:quick` — exit 1 with the same test result. `pnpm quality:full` therefore
  stops in `quick`; no current complete full-chain pass is claimed.
- The latest recorded full-chain attempt remains blocked by 15 surviving and 1 timed-out runnable
  mutation, and the approved Sonar verification remains blocked by HTTP 401 authentication.
- No new real Codex smoke is claimed for the current preparation pass or MVP-008 specification
  delivery.

## Next action

Implement MVP-008 in its specified order: package distribution and package-root tool resolution,
consumer preflight and scope, dependency-cruiser, typed lint/security, redacted Gitleaks,
integration and demo, then the required fixture, package-install, demo, quality, mutation, and
Sonar verification.

## Maintenance rule

Keep this file limited to current position, verification, blockers, and next action. Move detailed
completed-increment evidence, workflow traces, and replaced status snapshots to
[`STATUS-HISTORY.md`](STATUS-HISTORY.md). Historical evidence must never be treated as current
release evidence.
