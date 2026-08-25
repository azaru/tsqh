# Development Status

## Current state

- Product: small configurable sequential Swarm Forge Lite guardrail controller.
- Active specification:
  `specs/TSQH-MVP-002-quality-hardening-and-role-catalog.md` (`active`; safe local hardening is
  implemented, Swarm Forge Lite is implemented, final release evidence is pending).
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
- The approved Swarm Forge Lite continuation is deliberately small: pass the prior completed
  agent's bounded, sanitized stdout to the next configured agent as untrusted context; block gates
  that mutate the candidate; and add a separate sequential
  `implementer -> cleaner -> reviewer -> hardener -> qa` example followed by the unchanged six-gate
  quality chain.
- Bounded previous-role handoff is implemented without a trace migration: reduction derives the
  latest successful agent stdout, source step, visit, and truncation state from the existing bounded
  process artifact. Gates preserve it; blocked or nonzero agents do not create one; and prompt text
  labels it as untrusted context with no task, permission, provider, transition, visit, or gate
  authority.
- Candidate-stable native gates are implemented. The controller snapshots Git before each gate,
  compares candidate paths afterward, blocks tracked or untracked mutations even when the command
  exits zero, and permits regeneration of ignored owned quality reports. Inspection failures block
  with exact diagnostics, and a mutating nonzero gate cannot take its repair edge.
- The separate `examples/swarm-forge-lite/` pack is implemented with one shared command provider,
  fresh sequential role processes, bounded writer/read-only permissions, concise local prompts,
  all six native gates, and two bounded repair visits that restart at `quick`.
- A dedicated local Sonar target is now provisioned on the existing localhost service: project
  `azaru_tsqh_mvp`, gate `azaru-tsqh-mvp-strict`, TypeScript profile
  `azaru-tsqh-mvp-typescript`, `PREVIOUS_VERSION` new code, and no small-change exemption.
  `infra/sonar/compose.yaml`, `sonar-project.properties`, and `sonar-policy.json` record its
  non-secret local infrastructure and identity.

## Current release work

- The latest complete-project non-incremental mutation execution produced 3,949 mutants:
  2,892 `Killed`, 1,057 `CompileError`, and zero survived, uncovered, timed-out, or runtime-error
  mutants.
  Checker-produced `CompileError` mutations remain visible as type-invalid, non-runnable mutations;
  every runnable mutant must be `Killed`, and every other runtime status fails. The gate still
  blocked because its header validator expected legacy framework name `Stryker` while the pinned
  Stryker 10 JSON schema reports `StrykerJS`. The validator and all controlled fixtures now pin the
  observed `StrykerJS` identity; 6 focused runnable mutants were killed with no other statuses. A
  fresh complete-project run remains required before claiming the mutation gate green.
- Sonar is reachable and authorized. All 19 initial findings are fixed, and the dedicated MVP
  project now reports zero open issues and computed gate `OK`; coverage is 99.8% and duplication is
  0.0%. Remote-policy validation is aligned with Sonar's actual API split:
  `project_status` proves computed `OK` and disabled ignored conditions, the assigned gate and
  gate-definition endpoints prove exactly eight configured conditions, and the project `main`
  branch response proves the explicit `PREVIOUS_VERSION` assignment. Missing, duplicate, stale,
  malformed, red, and computed-condition-omission cases have deterministic fake-API coverage.
- `pnpm quality:full` remains required and has not been claimed green for `TSQH-MVP-002`.

## Verified local evidence — 2026-08-25

- `pnpm quality:quick` — exit 0; strict test typecheck, build, 693 tests across 25 files, and the
  five-entry domain architecture boundary passed.
- `pnpm quality:coverage` — exit 0; 693 tests passed. Coverage was 100% statements
  (1,646/1,646), 99.48% branches (971/976), 100% functions (357/357), and 100% lines
  (1,626/1,626). Every domain metric remained 100%.
- `pnpm quality:crap` — exit 0; 26 source files, 362 units, zero violations, maximum CRAP 6.
- `pnpm quality:knip` — exit 0; zero issues, including zero configuration and tag hints.
- `pnpm quality:full` — exit 1 at mutation after quick, coverage, CRAP, and Knip passed. The fresh
  mutation report contained 3,817 mutants: 2,803 killed, 1,008 checker-rejected compile errors,
  4 survived, 1 had no coverage, and 1 produced a runtime error. The reported total mutation score
  was 99.82% (99.86% covered). The fail-fast chain did not start Sonar.
- `pnpm quality:mutation` — exit 1 only at evidence validation after all 3,949 mutants completed:
  2,892 killed and 1,057 checker-rejected compile errors, with zero survived, uncovered, timed-out,
  or runtime-error mutants. The exact blocker was the stale `framework.name` expectation; the
  pinned Stryker 10 report identifies itself as `StrykerJS`.
- `pnpm quality:sonar` — exit 0 after a real authorized scan; Sonar analysis
  `0b616e70-e87f-48dc-b4b0-313045e6074c` completed with computed gate `OK` and the approved remote
  policy. Compute task `1e521e9f-ef14-4bcd-9c42-06e52df7204e` completed successfully. The dedicated
  project reports zero open issues, 99.8% coverage, and 0.0% duplicated-line density. The token was
  neither printed nor persisted.
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
- The bounded-handoff controller and prompt ranges reported 60 killed runnable mutants with zero
  survived/uncovered/timeout; a follow-up reducer scan reported 13 killed runnable mutants with zero
  survived/uncovered/timeout and 21 checker errors.
- The candidate-stable gate controller range reported 10 killed runnable mutants with zero
  survived/uncovered/timeout and 2 checker errors after its focused regression tests passed.
- The reconciled Sonar policy and wrapper ranges reported 137 killed runnable mutants with zero
  survived/uncovered/timeout and 30 checker errors. The checked definition remains exact even when
  the computed status omits conditions without measures.
- The Sonar-finding cleanup ranges reported 179 killed runnable mutants with zero
  survived/uncovered/timeout and 52 checker errors. This includes locale-explicit ordering, absolute
  Git executable dispatch without inherited `PATH`, and the remaining clarity/type repairs.
- No new real Codex smoke was run or claimed for this hardening checkpoint.

## Demonstrated workflow behavior

- Happy hardening trace:
  `implement(completed) -> quick(passed) -> coverage(passed) -> crap(passed) -> knip(passed) -> mutation(passed) -> sonar(passed) -> passed`.
- Repair trace: a failed intermediate gate selects `repair`, then restarts the entire chain at
  `quick`; after the one-time failure, every gate is rerun in order and the workflow passes.
- Exhaustion trace: a persistent mutation-gate failure consumes the finite repair budget, blocks
  at `repair`, and never starts `sonar`.
- Handoff trace: `implement` output reaches `review` across `quick`; `review` output then replaces it
  and reaches `verify` across `full`. Empty and truncated output retain source identity, and embedded
  pass, skip, transition, task, and permission claims do not affect configured execution.
- Lite happy trace:
  `implementer -> cleaner -> reviewer -> hardener -> qa -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed`.
  Reviewer output reaches hardener, QA output remains the latest evidence across native gates, and
  only the configured writer roles change the fake candidate.
- Lite exhaustion trace: a persistent mutation failure selects repairer twice, restarts at `quick`
  after each completed repair, reruns through mutation three times, then blocks at the repairer
  visit limit without starting Sonar.
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
- Exact local next action: rerun the complete-project non-incremental mutation gate and repair every
  remaining runnable finding before executing the full release chain.
- Release next action: rerun complete-project mutation to confirm the focused repairs; fix every
  remaining runnable finding; and keep iterating through `pnpm quality:full` until it exits zero.
