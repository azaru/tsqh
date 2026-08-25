# Development Status

## Current state

- Product: small configurable sequential Swarm Forge Lite guardrail controller.
- Active specification:
  `specs/TSQH-MVP-002-quality-hardening-and-role-catalog.md` (`active`; safe local hardening is
  implemented, Swarm Forge Lite continuation is approved, final release evidence is pending).
- Completed specification:
  `specs/TSQH-MVP-001-configurable-sequential-controller.md` (`complete`).
- Version 0 remains complete: strict configuration loading, pure planning/reduction, sequential
  controller execution, command/Git/trace adapters, `run` and `status`, deterministic repair and
  exhaustion behavior, and the previously authenticated Codex smoke are preserved.
- The safe local hardening implementation is complete. `quality:quick`, `quality:coverage`,
  `quality:crap`, `quality:knip`, `quality:mutation`, `quality:sonar`, and the exact sequential
  fail-fast `quality:full` chain are wired. Native evidence is freshly generated, validated, and
  summarized; missing or contradictory evidence blocks.
- The example workflow exposes `quick -> coverage -> crap -> knip -> mutation -> sonar`. Every
  failure uses the configured repair role, returns to `quick`, and remains bounded by `maxVisits`.
- The adapted ten-role catalog, immutable provenance, and digest validation remain present under
  `prompts/swarm-forge-adapted/`.
- Runtime scope remains version 0: one foreground run, one action at a time, one caller-supplied
  clean Git worktree, and generic command providers. There is no concurrency or remote executor.
- The approved Swarm Forge Lite continuation is deliberately small: pass the prior completed agent's bounded,
  sanitized stdout to the next configured agent as untrusted context; block gates that mutate the
  candidate; and add a separate sequential `implementer -> cleaner -> reviewer -> hardener -> qa`
  example followed by the unchanged six-gate quality chain.
- The continuation is not implemented yet. Existing CLI behavior does not yet provide previous-role
  handoff context or snapshot the candidate around native gates.
- A dedicated local Sonar target is now provisioned on the existing localhost service: project
  `azaru_tsqh_mvp`, gate `azaru-tsqh-mvp-strict`, TypeScript profile
  `azaru-tsqh-mvp-typescript`, `PREVIOUS_VERSION` new code, and no small-change exemption.
  `infra/sonar/compose.yaml`, `sonar-project.properties`, and `sonar-policy.json` record its
  non-secret local infrastructure and identity.

## Current release work

- Mutation baseline: the fresh complete-project non-incremental run produced 3,817 mutants:
  2,803 `Killed`, 1,008 `CompileError`, 4 `Survived`, 1 `NoCoverage`, and 1 `RuntimeError`.
  Checker-produced `CompileError` mutations remain visible as type-invalid, non-runnable mutations;
  every runnable mutant must be `Killed`, and every other runtime status fails. The validator,
  summaries, tests, and full run now implement and prove that fail-closed distinction. Remaining
  runtime findings from that report were in `src/quality/coverage.ts`, `src/quality/mutation.ts`,
  `src/quality/sonar-gate.ts` (two survivors), `src/quality/cli.ts` (no coverage), and
  `src/adapters/command-runner.ts` (runtime error). Focused repairs now give every affected range a
  100% runtime mutation score with checker rejections reported separately. A fresh complete-project
  run remains required before replacing the baseline or claiming the mutation gate green.
- Sonar is reachable and authorized. The first real MVP analysis completed on the server and the
  strict gate correctly reported `ERROR`: coverage was 99.8%, duplication 0.0%, and 19 open issues
  failed the zero-issue condition. These are actionable code findings, not an infrastructure or
  authority blocker. Remote-policy validation must also be aligned with Sonar's actual API split:
  configured conditions come from the gate-definition endpoint, while `project_status` may omit
  conditions that have no computed measure; explicit `PREVIOUS_VERSION` is currently visible on
  the main-branch new-code assignment.
- `pnpm quality:full` remains required and has not been claimed green for `TSQH-MVP-002`.

## Verified local evidence — 2026-08-25

- `pnpm quality:quick` — exit 0; strict test typecheck, build, 660 tests across 25 files, and the
  four-entry domain architecture boundary passed.
- `pnpm quality:coverage` — exit 0; 651 tests passed. Coverage was 99.93% statements
  (1,586/1,587), 99.46% branches (936/941), 100% functions (348/348), and 99.93% lines
  (1,567/1,568). Every domain metric remained 100%.
- `pnpm quality:crap` — exit 0; 26 source files, 362 units, zero violations, maximum CRAP 6.
- `pnpm quality:knip` — exit 0; zero issues, including zero configuration and tag hints.
- `pnpm quality:full` — exit 1 at mutation after quick, coverage, CRAP, and Knip passed. The fresh
  mutation report contained 3,817 mutants: 2,803 killed, 1,008 checker-rejected compile errors,
  4 survived, 1 had no coverage, and 1 produced a runtime error. The reported total mutation score
  was 99.82% (99.86% covered). The fail-fast chain did not start Sonar.
- `pnpm quality:sonar` — exit 1 after a real authorized scan; Sonar analysis completed and the
  server-computed gate reported `ERROR` for 19 open issues. Coverage was 99.8% and duplicated-line
  density was 0.0%. Compute task `720c76bd-698b-4275-b45a-7c62e6c4e686` completed `SUCCESS` as
  analysis `0549f292-8aef-40b6-9a97-2865a52966ea`. The token was neither printed nor persisted.
- `pnpm exec vitest run test/cli` — exit 0; 17 tests across two files.
- Focused mutation verification used temporary `coverageAnalysis: perTest` only for diagnostic
  speed; checked-in `stryker.config.mjs` remains `coverageAnalysis: "all"`. Final affected ranges
  for the command runner, configuration loader, controller, CLI, and local gate evidence each
  reported 100% runtime mutation score with zero survived, uncovered, or timed-out mutations.
  TypeScript checker `CompileError` counts remained present and are not reclassified.
- `pnpm exec stryker run --mutate 'src/quality/gates.ts:200-210' --coverageAnalysis perTest` —
  exit 0; 10 killed, 0 survived/uncovered/timeout, 3 checker errors.
- `pnpm exec stryker run --mutate 'src/cli/main.ts:35-180' --coverageAnalysis perTest` — exit 0;
  84 killed, 0 survived/uncovered/timeout, 49 checker errors.
- `pnpm exec stryker run --mutate src/cli.ts --coverageAnalysis all` — exit 0; 1 killed and no
  other status.
- `pnpm exec stryker run --mutate 'src/quality/mutation.ts' --coverageAnalysis perTest` — exit 0;
  171 killed, 0 survived/uncovered/timeout, and 46 checker errors.
- `pnpm exec stryker run --mutate 'src/quality/coverage.ts:95-145,src/quality/sonar-gate.ts:46-165'
  --coverageAnalysis perTest` — exit 0; 64 killed, 0 survived/uncovered/timeout, and 21 checker
  errors. The preceding combined diagnostic also proved the changed command-runner and quality CLI
  entrypoint ranges at 100% before it exposed and prompted repair of the coverage/Sonar findings.
- No new real Codex smoke was run or claimed for this hardening checkpoint.

## Demonstrated workflow behavior

- Happy hardening trace:
  `implement(completed) -> quick(passed) -> coverage(passed) -> crap(passed) -> knip(passed) -> mutation(passed) -> sonar(passed) -> passed`.
- Repair trace: a failed intermediate gate selects `repair`, then restarts the entire chain at
  `quick`; after the one-time failure, every gate is rerun in order and the workflow passes.
- Exhaustion trace: a persistent mutation-gate failure consumes the finite repair budget, blocks
  at `repair`, and never starts `sonar`.
- Existing version 0 authenticated smoke remains historical evidence only: Codex CLI 0.149.1 ran
  `implement(completed) -> quick(passed) -> review(completed) -> full(passed) -> verify(completed) -> passed`
  in disposable run `454a9357-a181-40dc-acca-f950b4ec53d9`.

## Approved dependencies

- Runtime: `ajv` 8.20.0.
- Approved hardening tools are pinned exactly: `@vitest/coverage-v8` 4.1.11,
  `@azaru/tscrap` 0.1.2, `@stryker-mutator/core` 10.0.0,
  `@stryker-mutator/vitest-runner` 10.0.0, `@stryker-mutator/typescript-checker` 10.0.0,
  `@sonar/scan` 5.0.0, and `knip` 6.32.2.
- The repository targets Node.js `>=22.12.0`, uses pnpm exclusively, and has one
  `pnpm-lock.yaml`.

## Fixed scope and next action

- Quality targets remain: CRAP at or below 6, at least 90% global coverage, 100% domain coverage,
  zero Knip findings, every runnable mutant `Killed` with TypeScript-checker `CompileError`
  mutations reported separately, and a server-computed Sonar gate of `OK` with the approved remote
  policy.
- Native quality tools remain configured profiles and package scripts; the controller contains no
  tool-specific transition branches.
- Sonar and complete-project mutation remain required release gates while the local continuation
  proceeds; no local handoff or candidate-stability result substitutes for them.
- Deferred version 0 non-goals remain concurrency, daemon mode, remote execution, managed
  worktrees, merge, crash-safe resume, leases, cache, server/dashboard, provider SDKs, and
  same-account hostile-process protection.
- Exact local next action: launch `GOAL.md` against active `TSQH-MVP-002`, preserve all concurrent
  hardening work, and implement only bounded role handoff, candidate-stable gates, and the separate
  Swarm Forge Lite example.
- Release next action: rerun complete-project mutation to confirm the focused repairs; fix every
  remaining runnable finding; fix every real Sonar issue; reconcile the validator with the actual
  Sonar policy endpoints; and keep iterating through `pnpm quality:full` until it exits zero.
