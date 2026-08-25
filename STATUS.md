# Development Status

## Current state

- Product: configurable sequential multi-step and multi-agent guardrail controller.
- Active specification:
  `specs/TSQH-MVP-002-quality-hardening-and-role-catalog.md` (`active`).
- Completed specification:
  `specs/TSQH-MVP-001-configurable-sequential-controller.md` (`complete`).
- Implementation: the complete version 0 vertical slice is implemented in strict TypeScript, with
  schema/configuration loading, a pure planner/reducer, command/Git/trace adapters, a foreground
  controller, `run` and `status` CLI commands, an example workflow, and deterministic tests.
- Version 0 completion condition: satisfied. All required artifacts exist, deterministic happy/repair/
  exhaustion traces pass, the authenticated Codex smoke passed, documentation describes the
  implemented behavior, and the final full quality gate exits 0.
- Active hardening state: specification and adapted prompt catalog complete; implementation has not
  started. The current package scripts do not satisfy `TSQH-MVP-002`.
- Adapted prompt catalog: ten original TSQH role prompts plus a versioned digest manifest and
  immutable provenance record now exist under `prompts/swarm-forge-adapted/`. Research covered
  Swarm Forge `main`, `two-pack`, `four-pack`, `six-pack`, `adversaries`, and `squad`. No upstream
  license file was observed, so the catalog paraphrases and attributes ideas instead of copying
  substantial text verbatim.
- Runtime boundary: one foreground controller, one active run, one caller-supplied clean Git
  worktree, one action at a time, and one generic command provider.
- Deterministic proof: 36 tests currently pass across six files. They cover a three-role/two-gate
  ordered pass; failed-gate repair and later pass; repair/visit exhaustion; configuration failures
  before side effects; agent transition-output isolation; native gate exit authority; clean Git,
  unauthorized/protected paths, spawn/nonzero/timeout/signal blockers; bounded command output;
  contiguous traces; read-only status; and immutable deterministic planning.
- Active hardening blockers:
  - human approval is required before adding the seven proposed pinned development packages outside
    the initial dependency budget;
  - no authorized Sonar target, project identity, assigned gate/profile/new-code policy, or
    environment credentials are currently recorded;
  - this workspace copy contains no `.git` metadata, so a clean-worktree delivery check and a new
    real controller smoke cannot currently be demonstrated here.
- Verification completed during implementation:
  - `pnpm build` — exit 0.
  - `pnpm test:unit` — exit 0; 13 tests passed across two files at that checkpoint.
  - `pnpm quality:quick` — exit 0; 36 tests passed across six files.
- Hardening specification and catalog verification on 2026-08-25:
  - local SHA-256 manifest validation — exit 0; all 10 adapted role files matched;
  - immutable upstream path validation against the six recorded commits — exit 0; all 28 mapped
    role-source paths existed;
  - `xmllint --noout .tsqh/executive-summary.html` — exit 0;
  - `pnpm quality:quick` — exit 0; 36 tests passed across six files;
  - `pnpm quality:full` — exit 0; 36 tests passed and four domain entries passed the version 0
    architecture boundary. This is baseline evidence only, not a `TSQH-MVP-002` pass.
- Manual Codex smoke attempt 1 used Codex CLI 0.149.1 in an authenticated session and correctly
  blocked before any downstream step: configured flags `--sandbox workspace-write` and
  `--approve-for-me` conflict in this CLI, so the implementer exited 2. Run id
  `ec299e53-7eb5-4019-9693-6fc235d85ac0` records the real failed attempt. The example provider was
  corrected to use `--sandbox workspace-write` without the conflicting flag; a fresh smoke retry
  was then run.
- Manual Codex smoke attempt 2 — exit 0. Codex CLI 0.149.1, authenticated with ChatGPT, ran in a
  disposable clean Git copy. Run `454a9357-a181-40dc-acca-f950b4ec53d9` recorded 14 contiguous
  events with this trace:
  `implement(completed) -> quick(passed) -> review(completed) -> full(passed) -> verify(completed)
  -> passed`. Both gates and all three command-provider visits exited 0. The implementer changed
  only `src/smoke-marker.ts` and `test/smoke-marker.test.ts`; review and verification made no
  changes. `pnpm tsqh status --run <that-run> --json` also exited 0 and reported the same terminal
  state without mutation.
- Final standalone verification on 2026-08-25:
  - `pnpm build` — exit 0.
  - `pnpm test` — exit 0; 36 tests passed across six files.
  - `pnpm quality:quick` — exit 0; strict source/test typecheck passed and 36 tests passed.
  - `pnpm quality:full` — exit 0; quick quality passed and the domain dependency boundary passed
    with four entries inspected.
- Remaining limitations are the explicit version 0 non-goals: no concurrency, daemon, remote
  executor, managed worktrees, merge, crash-safe resume, locks, snapshots, cache, server,
  dashboard, provider SDK, or same-account hostile-process protection.
- Quality coverage limitation: `quality:quick` and `quality:full` currently enforce strict
  TypeScript, build, Vitest, and the domain dependency boundary. They do not yet integrate Stryker
  mutation testing, Sonar analysis, `@azaru/tscrap`, Knip, or fresh V8 coverage. An exit-zero result
  from the present `quality:full` is only historical version 0 evidence, not a hardening pass.
- Exact next action: obtain explicit approval for the pinned dependency set and an authorized Sonar
  target, then execute `GOAL.md` against `TSQH-MVP-002`. Do not change `package.json`, the lockfile,
  or remote Sonar state before that approval.

## Fixed scope decisions

- Multi-step and multi-agent configuration is core MVP behavior.
- Execution is sequential; multi-agent does not imply concurrency.
- Workflow steps, logical roles, providers, prompts, and quality profiles remain separate data.
- The controller never asks an agent to choose the next transition.
- Stryker, Sonar, `@azaru/tscrap`, Knip, and coverage remain native configured profiles or package
  scripts; the controller contains no branches for them.
- Hardening targets CRAP at or below 6, at least 90 percent global coverage, 100 percent domain
  coverage, zero non-killed mutation statuses, zero Knip findings, and a computed Sonar gate of
  `OK`.
- Advanced persistence, managed worktrees, merge, concurrency, approvals, cache, dashboards, and
  provider SDK integrations are deferred.
