# TSQH MVP

TSQH MVP is a deliberately small, configurable, sequential multi-step and multi-agent controller.
It proves one claim: project configuration, not an agent, selects every next step, required quality
gate, repair transition, and terminal result.

This repository is a clean implementation experiment. It does not copy the implementation or
current milestone state of `tsqh-orchestrator`.

## Read first

1. [`AGENTS.md`](AGENTS.md) — contribution and implementation contract.
2. [`STATUS.md`](STATUS.md) — current state and exact next action.
3. [`specs/TSQH-MVP-004-unified-typescript-configuration.md`](specs/TSQH-MVP-004-unified-typescript-configuration.md)
   — the completed unified TypeScript configuration specification.
4. [`specs/TSQH-MVP-003-discovered-project-configuration.md`](specs/TSQH-MVP-003-discovered-project-configuration.md)
   — the completed discovered partial configuration specification.
5. [`specs/TSQH-MVP-002-quality-hardening-and-role-catalog.md`](specs/TSQH-MVP-002-quality-hardening-and-role-catalog.md)
   — the completed quality and bounded Swarm Forge Lite specification.
6. [`specs/TSQH-MVP-001-configurable-sequential-controller.md`](specs/TSQH-MVP-001-configurable-sequential-controller.md)
   — the completed version 0 controller contract.
7. [`GOAL.md`](GOAL.md) — retained completion prompt and execution record.

## Product slice

```text
validated configuration
  -> logical agent step
  -> bounded handoff context for the next configured role
  -> additional specialist roles in the same candidate
  -> native quality gate
  -> next configured step
  -> configured repair agent on failure
  -> retry within a fixed visit budget
  -> passed or an exact blocker
```

The runtime is sequential in version 0. Multiple logical agents remain configurable: every agent
step references a role, every role references a provider and prompt, and several roles may use the
same provider. Concurrency is not required for multi-agent behavior.

## Current increments

The controller slice is complete. `TSQH-MVP-002` has locally implemented a fail-closed delivery
chain for fresh V8 coverage, `@azaru/tscrap`, Stryker, Knip, and a real server-computed Sonar quality
gate in this exact order:

```text
quick -> coverage -> crap -> knip -> mutation -> sonar
```

These remain mandatory native configured gates; they do not become role names or branches in
controller code. Every failure uses the ordinary configured repair edge and reruns the chain from
`quick` within finite visit budgets.

Hardening is complete: strict local wrappers and evidence validators, tool configuration, the
six-gate example graph, deterministic failure tests, the approved pinned development packages, and
the sequential fail-fast package scripts are present. The final non-incremental Stryker report has
2,890 killed runnable mutants and 1,061 separately reported checker `CompileError` mutations, with
no other status. The dedicated Sonar target reports computed gate `OK` with zero open issues after
all 19 initial findings were fixed. The exact `quality:full` chain exits zero; see
[`STATUS.md`](STATUS.md) for the complete evidence.

`TSQH-MVP-003` made `--config` optional and added repository-root `tsqh.config.ts` discovery.
`TSQH-MVP-004` is complete and unifies that TypeScript surface: its strict default export may be
either a partial overlay on the built-in sequential workflow or a complete version 1 workflow. An
absent file uses the unchanged default. A project can enable or disable native quality stages
without copying the complete workflow, while advanced projects can stay in TypeScript when they
replace the full graph. Explicit complete JSON configurations remain supported.

The completed specification includes the smallest useful Swarm Forge collaboration primitive:
bounded output from one successfully completed agent becomes untrusted context for the next
configured agent. Native gates are also candidate-stable: the controller compares Git snapshots
around each gate and blocks any Git-visible candidate-path mutation while permitting configured
gates to regenerate ignored quality reports. The separate
[`examples/swarm-forge-lite/`](examples/swarm-forge-lite/) pack now demonstrates five fresh,
sequential specialist roles followed by the complete six-gate chain and bounded repair. The planner
remains the only transition authority; there is no peer messaging, persistent leader, dynamic
spawning, daemon, or per-role worktree.

The repository already contains an original attributed role catalog at
[`prompts/swarm-forge-adapted/`](prompts/swarm-forge-adapted/README.md), informed by the `main`,
`two-pack`, `four-pack`, `six-pack`, `adversaries`, and `squad` branches of Swarm Forge. Its prompts
retain focused ownership, TDD, architecture, adversarial review, hardening, and independent QA while
removing upstream coordination commands and agent-selected transitions. The immutable source map
and missing-upstream-license notice are in
[`PROVENANCE.md`](prompts/swarm-forge-adapted/PROVENANCE.md).

## Upstream design references

The completed local specification is authoritative for this repository. The primary product
references are the immutable Swarm Forge `main`, `six-pack`, and `squad` commits recorded in
[`PROVENANCE.md`](prompts/swarm-forge-adapted/PROVENANCE.md). They contribute role separation,
bounded handoff, and controller/worker ideas without importing their tmux, daemon, worktree, or
dashboard runtime.

These sibling-project files provide additional design rationale without importing their active
milestone or implementation:

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

TSQH requires Node.js 22.12.0 or newer, pnpm, Git, and the configured local command executables.
Install and verify the controller with:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm quality:quick
pnpm quality:full
```

Ajv remains the only runtime dependency. The human-approved hardening tools are installed as exact
development dependency versions through the repository's single pnpm lockfile, and the declared
Node.js floor is 22.12.0.

## Local SonarQube

The checked-in [`infra/sonar/compose.yaml`](infra/sonar/compose.yaml) reproduces the localhost-only
SonarQube/PostgreSQL service and intentionally uses the shared Compose project name `tsqh-sonar`.
Its database values and scanner token are environment-only. Start or inspect it with values from a
private environment file:

```sh
docker compose --env-file /path/to/private-sonar.env --file infra/sonar/compose.yaml up --detach
curl --fail --silent http://127.0.0.1:9000/api/system/status
```

[`sonar-project.properties`](sonar-project.properties) selects project `azaru_tsqh_mvp`, while
[`sonar-policy.json`](sonar-policy.json) pins the approved host, dedicated strict gate, TypeScript
profile, and `PREVIOUS_VERSION` new-code identity. The existing local service is already
provisioned with those identities. For a scan, expose `SONAR_HOST_URL` and `SONAR_TOKEN` only to the
process, regenerate coverage, and run the real gate:

```sh
pnpm quality:coverage
pnpm quality:sonar
```

Do not commit an environment file or token. A fresh server must reproduce the exact identities in
the completed specification and must not modify the sibling `azaru_tsqh` project.

The fail-closed wrapper checks three distinct kinds of remote evidence: `project_status` proves the
computed result is `OK` with ignored conditions disabled; the assigned gate and its definition
prove the exact eight approved conditions; and the project `main` branch response proves its
explicit `PREVIOUS_VERSION` new-code assignment. Conditions without computed measures may be absent
from `project_status`; they remain mandatory in the gate definition.

## Configuration

For the normal project-local path, place `tsqh.config.ts` at the exact candidate worktree root. TSQH
does not search parent directories. Its default export accepts one of two strict forms.

The partial form overlays the built-in workflow. Every property is optional and all six built-in
quality stages default to enabled:

```ts
export default {
  quality: {
    sonar: false,
  },
};
```

The built-in order is:

```text
implement -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed
                  \-> repair --------------------------------------/
```

When a stage is `false`, TSQH omits that step and profile and reconnects the preceding pass edge to
the next enabled stage. Repair returns to the first enabled stage. Disabling every stage connects
`implement` directly to `passed` as an explicit project-policy choice.

The complete form is the same version 1 object accepted from `workflow.json`:

```ts
export default {
  schemaVersion: 1,
  workflow: { /* complete workflow graph */ },
  roles: { /* complete logical role map */ },
  providers: { /* complete command-provider map */ },
  profiles: { /* complete native-gate profile map */ },
};
```

`schemaVersion` is the discriminator: when present, the value must pass the complete workflow
schema and graph validation; TSQH never retries it as a partial overlay. To migrate an existing
workflow JSON, preserve its object and add `export default` before it. Raw JSON without a default
export is not a TypeScript module.

`tsqh.config.ts` is executable trusted project policy. TSQH evaluates it in a fresh bounded Node.js
process with built-in type stripping, a fixed argument array, `shell: false`, a short timeout,
bounded output, and no forwarded credentials. A dedicated pipe carries the evaluator envelope;
configuration writes to standard output or standard error are rejected and cannot impersonate that
envelope. The default export must be one plain JSON-compatible value; functions, class instances,
accessors, sparse or augmented arrays, cycles, symbols, and non-finite numbers are rejected. The
selected object must satisfy either the partial
[`schemas/project-config.schema.json`](schemas/project-config.schema.json) contract or the complete
[`schemas/workflow.schema.json`](schemas/workflow.schema.json) contract. Unknown properties and
malformed evaluator output fail before Git, agents, gates, or trace creation. The file is protected
from agent writes when it is inside the candidate.

For generated or legacy use, `--config /path/to/workflow.json` still loads one complete version 1
configuration. [`schemas/workflow.schema.json`](schemas/workflow.schema.json) is the strict full
workflow schema for both formats. An explicit path named `tsqh.config.ts` selects the unified
TypeScript contract; other formats are rejected. Complete configurations reject unknown properties
and validate all graph references,
transition edges, visit limits, command values, repository-relative paths, reachability, and
terminal behavior. Prompt files must be regular UTF-8 files beneath the selected complete
configuration's directory, including after symlink resolution.

Configuration keeps these concerns independent:

```text
workflow step -> logical role -> command provider
              -> quality profile
```

Agent and gate commands are always spawned as one executable plus an exact argument array with
`shell: false`. Agent prompts travel only over standard input. Provider and profile `timeoutMs`
values are optional and may be between 1 ms and 24 hours; both default to 15 minutes. Each output
stream is sanitized and limited to 64 KiB before it is persisted.

Quality profiles may also name explicit `environmentKeys`. Only those configured gate processes
receive the additional values; agent-provider processes retain the fixed minimal environment.

See [`examples/workflow.json`](examples/workflow.json) for two writing roles sharing one generic
Codex command provider, six native pnpm quality profiles, and explicit bounded repair edges. The
provider arguments match the locally inspected Codex CLI 0.149.1 interface; they remain ordinary
configuration and may need adjustment for another Codex release. Its two role references reuse the
concise prompt files from the Swarm Forge Lite pack; no duplicate prompt copies are kept under
`examples/prompts/`.

The separate [`examples/swarm-forge-lite/workflow.json`](examples/swarm-forge-lite/workflow.json)
runs `implementer -> cleaner -> reviewer -> hardener -> qa` before the same six profiles. Its
implementer, cleaner, hardener, and repairer are scoped to `src/` and `test/`; reviewer and QA have
empty write authority. Every gate failure selects repairer, which returns to `quick` within fixed
visit limits. Concise prompts and a task live beside that configuration.

Those concise workflow-specific prompts are intentionally distinct from the complete ten-role
catalog under [`prompts/swarm-forge-adapted/`](prompts/swarm-forge-adapted/README.md): the catalog
contains the reusable high-assurance contracts and provenance, while the Lite pack contains short
assignment overlays. A digest audit confirms there are no byte-identical prompt files across those
two directories.

The controller now supplies the latest successfully completed agent's bounded, sanitized stdout to
the next configured agent with source identity and truncation state. Gates preserve that handoff,
and its text cannot alter task, provider, write authority, transitions, visits, or gate outcomes.
The Lite pack remains separate from this verified hardening example. Native gates compare Git state
before and after execution and block tracked or untracked candidate changes; owned ignored quality
reports remain outside that candidate diff.

## Run and status

Build before invoking the package script:

```sh
pnpm tsqh run \
  --workspace /absolute/path/to/a/clean-git-worktree \
  --task /absolute/path/to/task.md

# Optional complete-workflow override:
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

`run` first resolves and validates the explicit, discovered, or built-in configuration and prompt
set, reads the task, and only then asks Git to prove that the explicit workspace is an existing
clean worktree root. It records
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

A discovered `tsqh.config.ts` is also trusted project-owned executable policy. Its evaluator is
bounded and receives no credential environment, but version 0 does not sandbox a hostile
configuration module from ordinary same-account filesystem or network access.
