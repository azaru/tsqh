# Development Status

## Current state

- Product: small configurable sequential guardrail controller with simple and adapted Swarm Forge
  workflow packs.
- Active specification: none. MVP-007 is the latest completed increment.
- Completed specifications:
  `specs/TSQH-MVP-007-compact-gate-failure-context-and-owned-rework.md` (`complete`),
  `specs/TSQH-MVP-006-provider-aware-agent-selection.md` (`complete`),
  `specs/TSQH-MVP-005-self-contained-workflow-packs.md` (`complete`),
  `specs/TSQH-MVP-004-unified-typescript-configuration.md` (`complete`),
  `specs/TSQH-MVP-003-discovered-project-configuration.md` (`complete`),
  `specs/TSQH-MVP-002-quality-hardening-and-role-catalog.md` (`complete`), and
  `specs/TSQH-MVP-001-configurable-sequential-controller.md` (`complete`).
- Version 0 remains complete: strict configuration loading, pure planning/reduction, sequential
  controller execution, command/Git/trace adapters, `run` and `status`, deterministic repair and
  exhaustion behavior, and the previously authenticated Codex smoke are preserved.
- The safe local hardening implementation is complete. `quality:quick`, `quality:coverage`,
  `quality:crap`, `quality:knip`, `quality:mutation`, `quality:sonar`, and the exact sequential
  fail-fast `quality:full` chain are wired. Historical MVP-005–007 evidence and the latest
  fail-fast verification are recorded below; no successful new full-chain run is claimed.
- The self-contained simple workflow exposes `quick -> coverage -> crap -> knip -> mutation ->
  sonar`. Every ordinary failure reuses its one configured implementation owner, returns to `quick`,
  and remains bounded by `maxVisits`.
- The adapted Swarm Forge workflow, its six referenced prompts, immutable provenance, and digest
  validation are colocated under `workflows/swarm-forge/`.
- Runtime scope remains version 0: one foreground run, one action at a time, one caller-supplied
  clean Git worktree, and generic command providers. There is no concurrency or remote executor.
- The approved Swarm Forge continuation is deliberately small: pass the prior completed
  agent's bounded, sanitized stdout to the next configured agent as untrusted context; block gates
  that mutate the candidate; and run a sequential `specifier -> implementer -> cleaner -> architect
  -> hardener -> qa` workflow followed by the unchanged six-gate quality chain.
- Bounded previous-role handoff is implemented without a trace migration: reduction derives the
  latest successful agent stdout, source step, visit, and truncation state from the existing bounded
  process artifact. Gates preserve it; blocked or nonzero agents do not create one; and prompt text
  labels it as untrusted context with no task, permission, provider, transition, visit, or gate
  authority.
- Candidate-stable native gates are implemented. The controller snapshots Git before each gate,
  compares candidate paths afterward, blocks tracked or untracked mutations even when the command
  exits zero, and permits regeneration of ignored owned quality reports. Inspection failures block
  with exact diagnostics, and a mutating nonzero gate cannot take its repair edge.
- `TSQH-MVP-007` is complete. An ordinary failed gate reduces to a pure
  `GateFailureContext` with an 8 KiB head/tail excerpt per stream and explicit capture/context
  truncation facts. Gate-driven assignments omit the previous successful-agent handoff. Passed and
  blocked gates retain their previous behavior.
- The two packs under `workflows/` are self-contained. The simple pack owns one concise writer
  prompt; the Swarm Forge pack owns only the six adapted prompts it dispatches. Both use one shared
  command provider and all six native gates. Simple reuses implementer for bounded rework; Swarm
  Forge routes quick to implementer, coverage/CRAP/Knip to cleaner, and mutation/Sonar to hardener,
  with three separate finite owner-rework steps that restart at `quick`.
- A dedicated local Sonar target is now provisioned on the existing localhost service: project
  `azaru_tsqh_mvp`, gate `azaru-tsqh-mvp-strict`, TypeScript profile
  `azaru-tsqh-mvp-typescript`, `PREVIOUS_VERSION` new code, and no small-change exemption.
  `infra/sonar/compose.yaml`, `sonar-project.properties`, and `sonar-policy.json` record its
  non-secret local infrastructure and identity.
- Project-local configuration discovery is complete. `run` accepts an optional `--config`, resolves
  only the candidate-root `tsqh.config.ts` when omitted, falls back to a built-in workflow only when
  that file is absent, and preserves explicit complete JSON workflows.
- The strict partial surface controls the six ordered quality stages. Disabled stages and profiles
  are omitted and surrounding edges are reconnected; the repository example disables only Sonar.
  The bounded evaluator uses a dedicated envelope pipe, rejects configuration output, forwards no
  credential environment, and cannot let standard output impersonate configuration.
- `TSQH-MVP-004` is complete. It makes `tsqh.config.ts` the unified primary surface by accepting
  either the existing partial quality overlay or a complete version 1 workflow default export,
  while retaining explicit JSON compatibility and every existing validation boundary.
- `TSQH-MVP-006` is complete. It adds provider, role, and agent-step model/effort selection with
  independent `step -> role -> provider` precedence and provider-owned argument templates. The
  Swarm Forge pack uses Sol/xhigh only for specifier and architect and Luna/max for every other
  agent dispatch.

## Latest Sonar/full-chain verification — 2026-09-03

- Sonar Compose startup — exit 0; `infra/sonar/compose.yaml` started the dedicated local service.
  Postgres was healthy, SonarQube was up on `127.0.0.1:9000`, and `/api/system/status` returned
  `UP` for SonarQube `26.7.0.124771`.
- `pnpm quality:full` — exit 1 in the exact fail-fast order. Quick passed 792 tests across 30
  files and the eight-entry architecture boundary; coverage passed with 100% statements,
  functions, and lines and 99.54% branches; CRAP and Knip passed with zero findings.
- Mutation blocked the chain: the fresh report covered 30 source files and 4,435 mutants, with
  3,214 `Killed`, 1,205 checker-rejected `CompileError`, 15 `Survived`, and 1 `Timeout`. Sonar
  was not reached because the chain is fail-fast.
- Standalone `pnpm quality:sonar` — exit 1; the running scanner reached SonarQube but bootstrap
  authentication returned HTTP 401. The ignored `SONAR_TOKEN` was not written to tracked files.
- Current release blockers are the 15 surviving and one timed-out runnable mutation, plus the
  rejected/expired Sonar token. No temporary harness changes remain in the tracked configuration.

## MVP-005–007 recovery verification — 2026-09-03

- Focused verification — exit 0; Vitest passed 253 tests across 10 files.
- Final task-isolated `pnpm quality:quick` — exit 0; 792 tests passed across 30 files, and the
  domain architecture boundary passed with 8 entries inspected.
- Local Sonar preflight — exit 7 (connection refused); `SONAR_TOKEN` was absent. Per the low-cost
  verification plan, `pnpm quality:full` was not run and remains the exact external
  release-verification blocker.
- No real Codex smoke was run or claimed.

## TSQH-MVP-007 completion evidence — 2026-08-26

- The trace schema remains unchanged. Reduction creates a pure `GateFailureContext` only for an
  ordinary failed gate; passed and blocked gates preserve their previous semantics. Each stream
  supplies an exact UTF-8-safe head/tail excerpt bounded to 8,192 bytes with captured, included,
  process-truncated, and context-truncated facts. A gate-driven prompt omits the prior successful
  agent handoff and labels native output as untrusted diagnostic context.
- The built-in and simple workflows reuse implementer at their bounded `repair` step and contain no
  repairer role or prompt. The Swarm Forge pack contains six dispatched roles and three explicit
  owner-rework steps: quick to implementer, coverage/CRAP/Knip to cleaner, and mutation/Sonar to
  hardener. Every rework edge returns to quick and remains independently visit-bounded.
- Immutable upstream comparison used Swarm Forge `main`
  `8e83a09a41a7970edf8107f074cc41c12b953a08`, `six-pack`
  `c8650d14becf6c33be537c75b6dacebccf965d4b`, and `squad`
  `b0d63d57a8f0c2e678c0449c16ee953132b9d306`. The squad Troubleshooter repairs persistent swarm
  state outside the product state machine; it is not evidence for a generic product repairer.
- Final affected typecheck and behavioral command — exit 0; 59 tests across the gate-context,
  prompt, and controller files passed. Focused `gate-failure-context.ts` mutation — exit 0; 36
  mutants: 24 runnable `Killed`, 12 checker-rejected `CompileError`, and no other status.
- Final `pnpm quality:quick` before the full chain — exit 0; strict test typecheck, build, 789 tests
  across 30 files, and the eight-entry domain architecture boundary passed.
- Coverage in the final full chain — exit 0; 789 tests passed. Coverage was 100% statements
  (1,865/1,865), 99.53% branches (1,074/1,079), 100% functions (422/422), and 100% lines
  (1,833/1,833).
- CRAP in the final full chain — exit 0; 32 source files, 443 units, zero violations, and maximum
  CRAP 6. Knip exited 0 with zero issues, configuration hints, or tag hints.
- Complete non-incremental mutation in the final full chain — exit 0; all 3,187 runnable mutants
  were `Killed`, 1,211 checker-rejected mutants were `CompileError`, and no other status occurred
  across 4,398 mutants and 30 source files.
- The first complete attempt correctly stopped at mutation because four loop mutations timed out;
  the UTF-8 boundary logic was rewritten as a bounded four-byte search and the focused report then
  proved zero timeouts. A later complete attempt passed mutation and correctly stopped at Sonar
  because the ignored private environment had not been loaded.
- Final `pnpm quality:full` with the existing ignored environment loaded — exit 0 in the exact
  `quick -> coverage -> crap -> knip -> mutation -> sonar` order. Sonar analysis
  `2dea0d8b-7f87-4ef8-b86c-ab93f6f814f5` returned computed gate `OK` and the approved remote policy
  on dedicated project `azaru_tsqh_mvp`.
- The private Sonar token was not added to tracked files. Its value was accidentally included in a
  local diagnostic tool output while locating the existing ignored environment, so it should be
  rotated; this does not change the recorded gate result.
- No real Codex agent smoke was run or claimed for this increment.

## TSQH-MVP-006 completion evidence — 2026-08-26

- Complete JSON and TypeScript configuration accept bounded provider-, role-, and agent-step-level
  `model` and `effort` values. Each field resolves independently as `step -> role -> provider` for
  the provider selected by the role.
- Provider arguments render exact `{model}` and `{effort}` placeholders without a shell and without
  splitting one selection into additional arguments. Missing values, missing placeholders,
  duplicate placeholders, unsupported placeholders, unsafe values, and selection properties on
  non-agent steps fail closed.
- The Swarm Forge provider defaults to `gpt-5.6-luna` at effort `max`; only specifier and architect
  override it with `gpt-5.6-sol` at `xhigh`. Implementer, cleaner, hardener, QA, and repairer all
  resolve to Luna/max. The local `codex-cli 0.149.1` help verified the configured argument surface.
- Targeted verification — exit 0; 232 tests across seven affected domain, configuration,
  controller, and prompt-pack test files passed.
- Final `pnpm quality:quick` — exit 0; strict test typecheck, build, 780 tests across 29 files, and
  the seven-entry domain architecture boundary passed.
- Coverage in the final full chain — exit 0; 780 tests passed. Coverage was 100% statements
  (1,833/1,833), 99.53% branches (1,064/1,069), 100% functions (411/411), and 100% lines
  (1,801/1,801).
- CRAP in the final full chain — exit 0; 31 source files, 431 units, zero violations, and maximum
  CRAP 6. Knip exited 0 with zero issues, configuration hints, or tag hints.
- Focused mutation for selection, validation, and dispatch — exit 0; 102 runnable mutants were
  `Killed`, 42 checker-rejected mutants were `CompileError`, and no other status occurred across
  144 mutants.
- Complete non-incremental mutation in the final full chain — exit 0; all 3,148 runnable mutants
  were `Killed`, 1,195 checker-rejected mutants were `CompileError`, and no other status occurred
  across 4,343 mutants.
- The first full attempt ran through complete mutation and correctly stopped at Sonar because the
  approved localhost service was not running (`ECONNREFUSED 127.0.0.1:9000`). Only the checked-in
  `infra/sonar/compose.yaml` service was started; a standalone Sonar run then passed as analysis
  `4299f347-7428-448b-9dec-98ba59b56ca5`.
- Final `pnpm quality:full` — exit 0 in the exact fail-fast
  `quick -> coverage -> crap -> knip -> mutation -> sonar` order. Sonar analysis
  `4eaeae6e-409a-4a1c-9ba0-08d98fd19bc1` returned computed gate `OK` with the approved dedicated
  project, gate, profile, and new-code policy. The ignored private environment was parsed without
  printing or persisting its credentials.
- No real Codex agent smoke was run or claimed for this increment. The local Sonar Compose service
  remains running after verification.

## TSQH-MVP-005 completion evidence — 2026-08-26

- `examples/` and the top-level `prompts/` content root were removed completely. Exactly two
  self-contained packs remain: `workflows/simple/` owns the complete minimal hardening graph and
  its two prompts; `workflows/swarm-forge/` owns its complete specialist graph, task, seven adapted
  prompts, manifest, provenance, and documentation.
- The Swarm Forge workflow now executes `specifier -> implementer -> cleaner -> architect ->
  hardener -> qa` before `quick -> coverage -> crap -> knip -> mutation -> sonar`. Specifier,
  architect, and QA are read-only; the four writer roles remain restricted to `src/` and `test/`.
- Manifest verification proves there are no unused Swarm Forge prompt files, every configured role
  is dispatched, every prompt path matches its role, every digest matches, and all source mappings
  use the immutable researched commits.
- Targeted migration verification — exit 0; 129 tests across the four configuration, controller,
  and prompt-pack test files passed.
- `pnpm quality:quick` — exit 0; strict test typecheck, build, 762 tests across 28 files, and the
  six-entry domain architecture boundary passed.
- Coverage within `pnpm quality:full` — exit 0; 762 tests passed. Coverage was 100% statements
  (1,785/1,785), 99.51% branches (1,034/1,039), 100% functions (400/400), and 100% lines
  (1,755/1,755).
- CRAP within the full chain — exit 0; 30 source files, 418 units, zero violations, and maximum CRAP
  6. Knip exited 0 with zero issues, configuration hints, or tag hints.
- Complete non-incremental mutation within the full chain — exit 0; 4,254 mutants across 30 source
  files: all 3,083 runnable mutants were `Killed`, 1,171 checker-rejected mutants were
  `CompileError`, and no other status occurred.
- `pnpm quality:sonar` within the full chain — exit 0; real analysis
  `0deb3bfb-d442-4f87-88cf-abb01fc15fc8` completed with computed gate `OK` and the approved remote
  policy on dedicated project `azaru_tsqh_mvp`. The token was neither printed nor persisted.
- `pnpm quality:full` — exit 0 in the exact fail-fast
  `quick -> coverage -> crap -> knip -> mutation -> sonar` order without skips.
- No new authenticated Codex smoke was run or claimed for this content-layout increment.

## Completed release evidence

- The final complete-project non-incremental mutation execution produced 3,951 mutants across 25
  files: 2,890 `Killed`, 1,061 `CompileError`, and zero survived, uncovered, ignored, timed-out,
  test-failed, or runtime-error mutants.
  Checker-produced `CompileError` mutations remain visible as type-invalid, non-runnable mutations;
  every runnable mutant was killed, for a 100% runnable mutation score. The report identifies the
  pinned framework as `StrykerJS` 10.0.0 and passed the fresh evidence validator.
- Sonar is reachable and authorized. All 19 initial findings are fixed, and the dedicated MVP
  project now reports zero open issues and computed gate `OK`; coverage is 99.8% and duplication is
  0.0%. Remote-policy validation is aligned with Sonar's actual API split:
  `project_status` proves computed `OK` and disabled ignored conditions, the assigned gate and
  gate-definition endpoints prove exactly eight configured conditions, and the project `main`
  branch response proves the explicit `PREVIOUS_VERSION` assignment. Missing, duplicate, stale,
  malformed, red, and computed-condition-omission cases have deterministic fake-API coverage.
- The exact sequential `pnpm quality:full` chain exited 0 after running
  `quick -> coverage -> crap -> knip -> mutation -> sonar` without skips.

## TSQH-MVP-004 completion evidence — 2026-08-26

- Unified TypeScript loading accepts both the existing strict partial quality overlay and a strict
  complete version 1 workflow. `schemaVersion` selects the complete contract fail-closed; complete
  prompt paths reuse the JSON loader's configuration-root containment and validation.
- The object from `workflows/swarm-forge/workflow.json`, when wrapped in `export default`,
  resolves to the same workflow and prompt contents as the JSON source. Normal JSON-compatible
  arrays are accepted by the bounded evaluator; sparse, augmented, accessor-bearing, subclassed,
  and cyclic arrays remain rejected.
- Prompt audit: each workflow now owns exactly the prompts it dispatches. The overlapping
  `examples/` and top-level `prompts/` roots were replaced by `workflows/simple/` and
  `workflows/swarm-forge/`; no compatibility copies remain.
- Latest `pnpm quality:quick` — exit 0; strict test typecheck, build, 761 tests across 28 files, and
  the six-entry domain architecture boundary passed.
- Coverage within the latest full attempt — exit 0; 761 tests passed. Coverage was 100% statements
  (1,785/1,785), 99.51% branches (1,034/1,039), 100% functions (400/400), and 100% lines
  (1,755/1,755).
- CRAP within the latest full attempt — exit 0; 30 source files, 418 units, zero violations, and
  maximum CRAP 6. Knip exited 0 with zero issues, configuration hints, or tag hints.
- Complete non-incremental mutation within the latest full attempt — exit 0; 4,254 mutants across
  30 source files: all 3,083 runnable mutants were `Killed`, 1,171 checker-rejected mutants were
  `CompileError`, and no other status occurred.
- Focused mutation for the unified loading ranges — exit 0; 43 runnable mutants were `Killed`, 14
  checker-rejected mutants were `CompileError`, and no other status occurred.
- First authenticated complete-TypeScript dogfood run
  `6a517e19-2708-466e-88f8-c6905b7023e5` discovered the configuration and produced the exact two
  authorized files, but Codex started a complete mutation run and exceeded its 15-minute provider
  limit. TSQH blocked it as `agent-timeout`; this run is not claimed as passed.
- Final authenticated complete-TypeScript dogfood run
  `15150672-58af-47e3-b91d-be6effc3a630` — exit 0 in a fresh disposable clean copy. It discovered
  `tsqh.config.ts` without `--config`, ran Codex CLI 0.149.1, produced only the requested `src/` and
  `test/` files, and recorded `implement(completed) -> quick(passed) -> passed`. Its quick gate
  passed 761 tests across 29 files including the dogfood test and the architecture boundary.
- An initial `pnpm quality:full` attempt correctly stopped after complete mutation because its
  process had not loaded the ignored `.env` and `SONAR_TOKEN` was absent. The final execution loaded
  that private environment without printing or persisting its values and exited 0 after the exact
  fail-fast `quick -> coverage -> crap -> knip -> mutation -> sonar` order.
- `pnpm quality:sonar` within the final full chain — exit 0; real analysis
  `c3b00f50-74d6-41cb-8f99-bf4d3adf2e70` completed with computed gate `OK` and the approved remote
  policy on dedicated project `azaru_tsqh_mvp`. The token was neither printed nor persisted.

## TSQH-MVP-003 completion evidence — 2026-08-25

- `pnpm quality:quick` — exit 0; strict test typecheck, build, 747 tests across 28 files, and the
  six-entry domain architecture boundary passed.
- `pnpm quality:coverage` — exit 0; 747 tests passed. Coverage was 100% statements
  (1,781/1,781), 99.51% branches (1,029/1,034), 100% functions (398/398), and 100% lines
  (1,751/1,751). Every domain metric remained 100%.
- `pnpm quality:crap` — exit 0; 30 source files, 416 units, zero violations, maximum CRAP 6.
- `pnpm quality:knip` — exit 0; zero issues and zero configuration or tag hints.
- `pnpm quality:mutation` within the final full chain — exit 0; 4,238 mutants across 30 source
  files: 3,077 runnable mutants were `Killed`, 1,161 checker-rejected mutants were `CompileError`,
  and no survived, uncovered, ignored, timed-out, test-failed, or runtime-error status occurred.
- `pnpm quality:sonar` within the final full chain — exit 0; real analysis
  `2eaebf1b-26df-4ad8-8bb0-ab1591cce778` completed with computed gate `OK` and the approved remote
  policy. The token was neither printed nor persisted.
- `pnpm quality:full` — exit 0; the exact fail-fast
  `quick -> coverage -> crap -> knip -> mutation -> sonar` order completed without skips.
- Focused mutation evidence for the new TypeScript evaluator reported 107 `Killed`, 41
  `CompileError`, and no other status. The new built-in prompts reported 2 `Killed`, 1
  `CompileError`, and no other status. Diagnostic runs used `coverageAnalysis: perTest`; the checked
  complete-project policy remained unchanged at `coverageAnalysis: "all"`.
- A real authenticated Codex dogfood run discovered `tsqh.config.ts` without `--config`, completed
  the requested two-file smoke change, passed `quick -> coverage -> crap -> knip`, failed mutation
  on two unrelated prompt mutants, selected the configured repairer, and restarted from `quick`.
  The repairer correctly refused to change files outside the exact smoke task. That diagnostic run
  was interrupted during its second mutation attempt after the same outcome was established; it is
  not claimed as a passed smoke.
- Final authenticated Codex dogfood run `f4489a57-df80-4ff3-a2ab-507172b8eba5` — exit 0 in a fresh
  disposable clean copy. It discovered the repository-root partial configuration without
  `--config`, produced exactly the requested `src/` and `test/` smoke files, and recorded
  `implement(completed) -> quick(passed) -> coverage(passed) -> crap(passed) -> knip(passed) ->
  mutation(passed) -> passed`. Its complete mutation gate reported 3,078 `Killed` runnable mutants,
  1,161 `CompileError`, and no other status across 4,239 mutants. The trace contained zero Sonar
  events, proving that `quality: { sonar: false }` connected mutation directly to `passed`.

## Verified local evidence — 2026-08-25

- `pnpm quality:quick` — exit 0; strict test typecheck, build, 693 tests across 25 files, and the
  five-entry domain architecture boundary passed.
- `pnpm quality:coverage` — exit 0; 693 tests passed. Coverage was 100% statements
  (1,649/1,649), 99.48% branches (967/972), 100% functions (363/363), and 100% lines
  (1,628/1,628). Every domain metric remained 100%.
- `pnpm quality:crap` — exit 0; 27 source files, 378 units, zero violations, maximum CRAP 6.
- `pnpm quality:knip` — exit 0; zero issues, including zero configuration and tag hints.
- `pnpm quality:mutation` within the final full chain — exit 0; 25 files, 2,890 killed runnable
  mutants, 1,061 checker-rejected compile errors, and no other status.
- `pnpm quality:sonar` within the final full chain — exit 0; real analysis
  `32bbda2f-8b39-48de-a572-e905813f81cb` completed with computed gate `OK` and the approved remote
  policy. Compute task `c99c3582-2006-457d-87a1-7b104b21185b` completed successfully. The dedicated
  project reports zero open issues, 99.8% coverage, and 0.0% duplicated-line density. The token was
  neither printed nor persisted.
- `pnpm quality:full` — exit 0; quick, coverage, CRAP, Knip, complete mutation, and real Sonar all
  passed in the required fail-fast order.
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
- The CRAP responsibility-extraction ranges reported 46 killed runnable mutants with zero
  survived/uncovered/timeout and 29 checker errors.
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
- Swarm Forge happy trace:
  `specifier -> implementer -> cleaner -> architect -> hardener -> qa -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed`.
  Architect output reaches hardener, QA output remains the latest evidence across native gates, and
  only the configured writer roles change the fake candidate.
- Swarm Forge owner-routing trace: one-time quick, coverage, and mutation failures select
  implementation-rework, cleanup-rework, and hardening-rework respectively, then restart at `quick`.
- Swarm Forge exhaustion trace: a persistent mutation failure selects hardening-rework twice,
  restarts at `quick` after each completed rework, reruns through mutation three times, then blocks
  at the hardening-rework visit limit without starting Sonar.
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

## Completed TSQH-MVP-003 scope

- `TSQH-MVP-003` adds automatic repository-root `tsqh.config.ts` discovery when `--config` is
  omitted, a strict partial configuration overlay, and a built-in default workflow.
- The first partial surface controls enablement of the existing ordered native quality stages. A
  disabled stage is omitted from the resolved graph and never recorded as a synthetic pass.
- Explicit JSON configuration remains supported. The planner, controller transition authority,
  trace schema, sequential runtime, role write enforcement, and native-gate semantics do not
  change.
- Exact next action: none within the completed specifications; approve a new local specification
  before broadening the product surface.

## Fixed scope and prior release state

- Quality targets remain: CRAP at or below 6, at least 90% global coverage, 100% domain coverage,
  zero Knip findings, every runnable mutant `Killed` with TypeScript-checker `CompileError`
  mutations reported separately, and a server-computed Sonar gate of `OK` with the approved remote
  policy.
- Native quality tools remain configured profiles and package scripts; the controller contains no
  tool-specific transition branches.
- Sonar and complete-project mutation remain required release gates; both passed in the final full
  chain, and no local handoff or candidate-stability result substituted for them.
- Deferred version 0 non-goals remain concurrency, daemon mode, remote execution, managed
  worktrees, merge, crash-safe resume, leases, cache, server/dashboard, provider SDKs, and
  same-account hostile-process protection.
- `TSQH-MVP-001` and `TSQH-MVP-002` remain complete with no release blockers in their delivered
  scope.
- No active specification is pending. No new full-chain run or real Codex smoke is claimed by this
  recovery; the completion evidence above remains historical evidence for MVP-005 through MVP-007.
