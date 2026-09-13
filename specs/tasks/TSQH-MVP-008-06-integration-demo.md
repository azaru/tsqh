# Task 06 — workflow integration, demo, and documentation

## Objective

Integrate secrets and lint into strict partial configuration and both bundled packs, reconnect
enabled/disabled transitions and owner repairs, add the consumer-read-only `demo`, and document the
installed-package first-use path and trust boundaries.

## Scope

- Strict `secrets`, `lint`, and `scope` project schema/config expansion with legacy compatibility.
- Built-in/simple and TDD/Swarm Forge workflow pack stages, profiles, finite repair edges, and
  secrets terminal blocking.
- Versioned reports, summary/trace integration, demo command and cleanup, package assets/README,
  task evidence references, and current `STATUS.md` state.
- End-to-end acceptance tests for order, compatibility, repair routing, package install, demo
  entrypoints, cleanup, and no-credentials/no-consumer-write behavior.

## Non-goals

Do not alter complete custom workflows unless they explicitly add stages/scope. Do not add SCA,
remote service, concurrency, dynamic transitions, new roles, or change existing threshold policy.

## Dependencies

Tasks 03, 04, and 05 integrated commits.

## Allowed paths

Tester: `test/` only. Implementer: `src/`, `schemas/`, `workflows/`, package scripts/assets,
README, and concise current `STATUS.md`. Protected: active specification, campaign/task authority,
credentials, reports, and unrelated completed-increment history.

## Acceptance criteria

- New partial booleans default false; absent/legacy partial configurations preserve the six-stage
  chain; scope defaults and strict validation match the specification.
- Opted-in chain is exactly `secrets -> lint -> quick -> coverage -> crap -> knip -> mutation -> sonar`;
  disabled stages/profiles are removed, pass edges reconnect, and repair starts at the first
  enabled stage. Complete custom graphs remain unchanged.
- Simple has initial run plus two owner repairs; TDD/Swarm Forge has initial run plus six owner
  repairs; secrets blocks without a writer; lint/quick/other failures use specified owners.
- `tsqh demo` and `--json` report package/tool versions, warnings, trace, and cleanup, create no
  consumer writes, use no credentials/service, and clean on success/failure/cancellation/setup
  errors. README shows `npx`, `npm exec`, and `pnpm dlx` forms.
- Consumer package installation and the configured workflow use the installed package boundary.

## Tests and gates

Run all targeted integration/demo/schema/controller tests, all three demo entrypoints where
available, packed npm/pnpm fixtures, `pnpm quality:quick`, and the task workflow trace. Do not
claim a real Codex smoke unless the provider ran.

## Failure and repair cases

Reject unknown/incorrect scope properties, wrong defaults/order/edges/limits, missing terminal
behavior, duplicate architecture stage, demo fixture leakage, consumer writes, credentials,
unclean temporary paths, and unauthorized changes. Exercise finite repair exhaustion.

## Required evidence

Configuration expansion JSON, exact workflow traces, compatibility matrix, package install/demo
logs, cleanup assertions, test totals, quick/full prerequisites, changed-path audit, and current
status/blocker reconciliation.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-06-integration-demo/`; retain sanitized durable evidence only
under the approved reports directory. Integrate one clean commit after all acceptance gates pass.
