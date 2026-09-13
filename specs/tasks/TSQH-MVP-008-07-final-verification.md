# Task 07 — final acceptance and release evidence

## Objective

Run the complete current acceptance matrix against the integrated MVP-008 implementation, capture
fresh sanitized evidence, and leave exact blockers when an external required gate cannot pass.

## Scope

- Real failing/corrected Gitleaks, ESLint/security, and dependency-cruiser fixtures.
- npm and pnpm packed-install consumers with source-checkout isolation.
- `npx`/`npm exec`/`pnpm dlx` demo trials and cleanup checks.
- Full opted-in workflow trace and legacy compatibility trace.
- Repository `pnpm quality:quick`, opted-in `quality:full`, complete non-incremental mutation, and
  approved dedicated Sonar verification under current credentials only.
- STATUS current snapshot and STATUS-HISTORY evidence reconciliation.

## Non-goals

Do not weaken coverage, CRAP, Knip, mutation, Sonar, secret, lint, architecture, or evidence
validation to obtain green. Do not alter credentials, sibling Sonar targets, history, or unrelated
features. No claims are made for checks not actually run.

## Dependencies and authority

Start from task 06's clean integrated commit. Tester writes only `test/`; implementer may write only
the narrowly required `src/`, scripts, package/configuration, docs, or STATUS paths needed to repair
an evidence-backed failure. Workflow/task authority, credentials, reports, and tmp remain protected.

## Acceptance criteria

- Every active-spec acceptance scenario has authoritative current evidence or an exact blocker.
- All three package-manager demo entry points and both packed-install paths are exercised when the
  environment supports them, with invocation-owned cleanup verified.
- The opted-in eight-stage chain and required repository gates run in order without skips; runnable
  mutants are all `Killed`, checker `CompileError` results remain visible, and Sonar targets only
  `azaru_tsqh_mvp` with the approved local policy.
- Final report names exact changed files, commands/exits, versions, test totals, traces, repairs,
  limitations, blockers, and cleanup state.

## Tests, failures, and evidence

Run the final task's targeted checks, `pnpm quality:quick`, the opted-in full chain, complete
mutation, and approved Sonar. A native failure, missing credential/service, incomplete evidence,
consumer leak, candidate mutation, or unauthorized path remains a blocker; it is never inferred as
success. Preserve all sanitized evidence in the task artifact/history and update concise STATUS.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-07-final-verification/`; clean invocation-owned fixtures and
artifacts after evidence capture. Integrate no further implementation unless a verified repair is
required; finish only after the completion audit proves every requirement or records an exact
external blocker.
