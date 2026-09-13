# Task 06 — strict integration, packs, demo, and documentation

## Objective

Integrate the optional stages and scope into strict partial configuration, update both bundled
workflow packs and repair routing, add the no-credentials installation demo, and document the
consumer contract.

## Scope

- Strict partial schema/types/defaults for `secrets`, `lint`, and `scope` with legacy compatibility.
- Enabled-stage graph expansion, disabled-stage reconnection, explicit all-disabled behavior, and
  pack repair edges/visit budgets without changing complete custom workflows.
- Both bundled complete packs, prompts/assets, package files/exports, demo command and cleanup.
- README, STATUS, and relevant tests/docs for package installation, demo entry points, warnings,
  cleanup, and the final installed-consumer trace.

## Non-goals

No new runtime action, generic tool-plugin framework, SCA/advisory service, remote executor,
concurrency, managed worktree, credential use, or weakening of required evidence/gates.

## Dependencies and authority

Start from integrated tasks 03, 04, and 05. Tester writes only `test/`. Implementer may write only
`src/`, `scripts/`, `schemas/`, `package.json`, `pnpm-lock.yaml`, `workflows/tdd-pipeline/`, and
human-facing package documentation. The checked-in simple workflow is the campaign controller and
remains protected during its own run; its final stage update is applied on the integration branch
between task runs and verified before task 07. Protect specs/tasks, credentials, reports, and tmp.

## Acceptance criteria

- Absent and legacy partial configurations preserve the six-stage chain; explicit booleans and scope
  arrays validate strictly, with safe defaults and all-disabled direct `implement -> passed`.
- Opted-in stages execute exactly `secrets -> lint -> quick -> coverage -> crap -> knip -> mutation -> sonar`.
- Complete workflows remain unchanged unless they explicitly add stages; disabled stages remove
  unused profiles; pack failure routing matches the specification and remains finite.
- `tsqh demo` runs from an installed package with deterministic built-in provider, no credentials or
  consumer writes, bounded output, and cleanup on success/failure/cancellation/setup error.
- README shows `npx`, `npm exec`, and `pnpm dlx` forms and accurately separates demo evidence from
  real agent, mutation, and Sonar evidence.

## Tests, failures, and evidence

Run strict schema/graph/controller tests, all demo entry points where available, packed npm/pnpm
consumer traces, real fixture checks, `pnpm build`, and `pnpm quality:quick`. Block unknown options,
unsafe scope, wrong transitions/visits, missing assets, credentials, consumer writes, cleanup leaks,
malformed output, and unauthorized changes. Record every trace, package identity, test total, and
cleanup result.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-06-integration-demo/`; remove invocation-owned demo and consumer
paths after evidence capture. Integrate only when the configured controller passes and all package,
fixture, and quick checks are green.
