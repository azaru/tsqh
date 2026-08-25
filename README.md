# TSQH MVP

TSQH MVP is a deliberately small, configurable, sequential multi-step and multi-agent controller.
It proves one claim: project configuration, not an agent, selects every next step, required quality
gate, repair transition, and terminal result.

This repository is a clean implementation experiment. It does not copy the implementation or
current milestone state of `tsqh-orchestrator`.

## Read first

1. [`AGENTS.md`](AGENTS.md) — contribution and implementation contract.
2. [`STATUS.md`](STATUS.md) — current state and exact next action.
3. [`specs/TSQH-MVP-002-quality-hardening-and-role-catalog.md`](specs/TSQH-MVP-002-quality-hardening-and-role-catalog.md)
   — the active normative hardening specification.
4. [`specs/TSQH-MVP-001-configurable-sequential-controller.md`](specs/TSQH-MVP-001-configurable-sequential-controller.md)
   — the completed version 0 controller contract.
5. [`GOAL.md`](GOAL.md) — ready-to-run Codex hardening goal prompt.

## Product slice

```text
validated configuration
  -> logical agent step
  -> native quality gate
  -> next configured step
  -> configured repair agent on failure
  -> retry within a fixed visit budget
  -> passed or an exact blocker
```

The runtime is sequential in version 0. Multiple logical agents remain configurable: every agent
step references a role, every role references a provider and prompt, and several roles may use the
same provider. Concurrency is not required for multi-agent behavior.

## Active hardening increment

The controller slice is complete. The active `TSQH-MVP-002` increment adds a fail-closed delivery
chain for fresh V8 coverage, `@azaru/tscrap`, Stryker, Knip, and a real server-computed Sonar quality
gate. The target order is:

```text
quick -> coverage -> crap -> knip -> mutation -> sonar
```

These are native configured gates; they do not become role names or branches in controller code.
Every failure will use the ordinary configured repair edge and rerun the chain from `quick` within
finite visit budgets.

Gate implementation has not started because the expanded pinned development dependency set and
Sonar target require human approval. Until that work is verified, the existing `quality:full`
remains the version 0 baseline rather than evidence that the new stack passed. See
[`STATUS.md`](STATUS.md) for the exact blockers.

The repository already contains an original attributed role catalog at
[`prompts/swarm-forge-adapted/`](prompts/swarm-forge-adapted/README.md), informed by the `main`,
`two-pack`, `four-pack`, `six-pack`, `adversaries`, and `squad` branches of Swarm Forge. Its prompts
retain focused ownership, TDD, architecture, adversarial review, hardening, and independent QA while
removing upstream coordination commands and agent-selected transitions. The immutable source map
and missing-upstream-license notice are in
[`PROVENANCE.md`](prompts/swarm-forge-adapted/PROVENANCE.md).

## Upstream design references

The local active specification is authoritative for this repository. These sibling-project files
provide design rationale without importing their active milestone or implementation:

- [`../tsqh-orchestrator/VISION.md`](../tsqh-orchestrator/VISION.md) — deterministic transition
  authority and fail-closed principles.
- [`../tsqh-orchestrator/docs/04-deterministic-control-plane.md`](../tsqh-orchestrator/docs/04-deterministic-control-plane.md)
  — pure planning and typed actions.
- [`../tsqh-orchestrator/docs/06-agents-roles-and-assignments.md`](../tsqh-orchestrator/docs/06-agents-roles-and-assignments.md)
  — separation of workflow steps, logical roles, and providers.
- [`../tsqh-orchestrator/docs/05-evidence-and-reviews.md`](../tsqh-orchestrator/docs/05-evidence-and-reviews.md)
  — subject-bound evidence direction.
- [`../tsqh-orchestrator/docs/12-security-and-threat-model.md`](../tsqh-orchestrator/docs/12-security-and-threat-model.md)
  — command, path, secret, and agent trust boundaries.

Do not modify `../tsqh-orchestrator` while implementing this repository.

## Requirements and setup

TSQH requires Node.js 22 or newer, pnpm, Git, and the configured local command executables. Install
and verify the controller with:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm quality:quick
pnpm quality:full
```

The package currently stays within the initial dependency budget: Ajv is the only runtime
dependency, while TypeScript, Vitest, and Node.js types are development dependencies. The active
hardening specification proposes an exact additional development-only tool set and requires human
approval before `package.json` or `pnpm-lock.yaml` changes. Its target Node.js floor is 22.12.0; the
implemented package still declares the version 0 floor until that dependency change is approved.

## Configuration

[`schemas/workflow.schema.json`](schemas/workflow.schema.json) is the strict version 1 JSON schema.
The controller rejects unknown properties and then validates all graph references, transition
edges, visit limits, command values, repository-relative paths, reachability, and terminal
behavior. Prompt files must be regular UTF-8 files beneath the configuration directory, including
after symlink resolution.

Configuration keeps these concerns independent:

```text
workflow step -> logical role -> command provider
              -> quality profile
```

Agent and gate commands are always spawned as one executable plus an exact argument array with
`shell: false`. Agent prompts travel only over standard input. Provider and profile `timeoutMs`
values are optional and may be between 1 ms and 24 hours; both default to 15 minutes. Each output
stream is sanitized and limited to 64 KiB before it is persisted.

See [`examples/workflow.json`](examples/workflow.json) for four logical roles sharing one generic
Codex command provider, two native pnpm quality profiles, and explicit bounded repair edges. The
provider arguments match the locally inspected Codex CLI 0.149.1 interface; they remain ordinary
configuration and may need adjustment for another Codex release.

## Run and status

Build before invoking the package script:

```sh
pnpm tsqh run \
  --config examples/workflow.json \
  --workspace /absolute/path/to/a/clean-git-worktree \
  --task /absolute/path/to/task.md

pnpm tsqh status --run /absolute/path/reported/by/run
```

Add `--json` to either command for one machine-readable JSON result. Add
`--runs-root /absolute/path` to `run` to select the trace parent; otherwise TSQH uses
`<system-temporary-directory>/tsqh-runs`. The runs root cannot equal the candidate workspace, and
controller configuration, task, prompts, and in-workspace run data are protected from agent edits.

`run` first validates the complete configuration and prompt set, reads the task, and only then asks
Git to prove that the explicit workspace is an existing clean worktree root. It records
`run-created`, paired `step-started`/`step-finished` events, and `run-finished` as bounded append-only
JSONL. Agents may write only within their logical role's configured prefixes. Git-derived path
fingerprints identify changes made during each individual agent visit, including further edits to
an already-modified candidate file.

The controller maps native process facts to outcomes. A successful agent exit completes an agent
step; any other agent exit blocks. A gate exits zero to pass, exits nonzero to follow `onFailed`,
and blocks on launch error, timeout, or signal. Process prose is retained as evidence but never
selects a transition. Before starting a configured target, the planner checks and increments its
visit count. Reaching a `passed` terminal returns exit 0; a blocker returns exit 1; usage,
configuration, pre-run Git, or trace errors return exit 2.

`status` validates and reduces `events.jsonl` without writing it. It reports the current step,
visit counts, latest outcome, terminal state, and exact blocker. A status query for a blocked run
returns exit 1.

## Manual local Codex smoke

The example task deliberately writes only under `src/` and `test/`. Run the smoke only when
`codex --version` succeeds and `codex login status` confirms authentication. Use a disposable,
clean Git copy of this repository so the example agents cannot touch the development checkout:

```sh
pnpm build
pnpm tsqh run \
  --config examples/workflow.json \
  --workspace /absolute/path/to/disposable-clean-tsqh-copy \
  --task examples/task.md \
  --runs-root /absolute/path/to/disposable-run-store \
  --json
```

The disposable copy needs its dependencies installed, and its initial `git status --porcelain`
must be empty. The real result of the latest local smoke, including whether it ran, belongs in
[`STATUS.md`](STATUS.md).

## Architecture and limitations

- `src/domain` contains only immutable workflow/run types, semantic graph validation, trace
  reduction, and pure next-action planning. An automated architecture check rejects Node.js,
  package, or outer-layer imports there.
- `src/application` contains the foreground controller, assignment prompt composition, and ports.
- `src/adapters` contains strict loading, bounded process execution, Git inspection, and JSONL
  storage.
- `src/cli` contains strict argument parsing plus human and JSON rendering.

Version 0 intentionally has no parallelism, daemon, remote executor, managed worktree, merge
authority, crash-safe resume, locking, cache, snapshots, provider SDK, server, or dashboard. It
trusts the one local controller process and configured executables. JSONL is an audit/status trace,
not a power-loss recovery protocol.
