# TSQH MVP

TSQH MVP is a deliberately small, configurable, sequential multi-step and multi-agent controller.
It proves one claim: project configuration, not an agent, selects every next step, required quality
gate, repair transition, and terminal result.

This repository is a clean implementation experiment. It does not copy implementation or
provisional APIs from external projects.

## Read first

Active planned increment: [`TSQH-MVP-008`](specs/TSQH-MVP-008-static-analysis-and-security-guardrails.md)
defines optional secret scanning, typed lint with lightweight security rules, and a dependency-graph
architecture check inside `quick`. It also plans a self-contained package distribution and a
no-credentials `tsqh demo` command. Dependency-vulnerability scanning remains out of scope.
Read it after `STATUS.md` before implementing new work. The runtime described below still reflects
the completed MVP-001 through MVP-007 implementation.

Next planned increment: [`TSQH-MVP-009`](specs/TSQH-MVP-009-approved-work-orders-and-openspec-adapter.md)
defines approved immutable work orders, a preparation-only OpenSpec adapter, and candidate-bound
requirement evidence. It depends on MVP-008 and does not change the active specification or runtime.

Following MVP-009, [`TSQH-MVP-010`](specs/TSQH-MVP-010-execution-profiles-and-deterministic-escalation.md)
plans explicit compact/reviewed/specialized profiles, classified native-failure routing, and fresh
final QA with identical required quality policy. It is not implemented.

1. [`AGENTS.md`](AGENTS.md) — contribution and implementation contract.
2. [`STATUS.md`](STATUS.md) — current state and exact next action.
3. The active specification named by `STATUS.md`.
4. The local design provenance referenced by this README.

`STATUS-HISTORY.md` and superseded specifications are archived reference material. Do not read them
for an ordinary task unless the active assignment explicitly requires historical evidence.

## Product slice

```text
validated configuration
  -> logical agent step
  -> bounded handoff context for the next configured role
  -> additional specialist roles in the same candidate
  -> native quality gate
  -> next configured step
  -> compact failure context for the configured writing owner
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
controller code. Every ordinary failure uses its configured rework edge and reruns the chain from
`quick` within finite visit budgets. Failed process output is reduced to at most 8 KiB from each
stream, preserving both ends and every truncation fact; successful gate output never enters a model
prompt.

Hardening is complete: strict local wrappers and evidence validators, tool configuration, the
six-gate example graph, deterministic failure tests, the approved pinned development packages, and
the sequential fail-fast package scripts are present. Historical MVP-005–007 evidence includes a
non-incremental Stryker report with 3,187 killed runnable mutants and 1,211 separately reported
checker `CompileError` mutations, with no other status. The dedicated Sonar target reported computed
gate `OK` with zero open issues after all 19 initial findings were fixed. The historical
`quality:full` chain exited zero; see
[`STATUS-HISTORY.md`](STATUS-HISTORY.md) for the complete historical evidence.

`TSQH-MVP-003` made `--config` optional and added repository-root `tsqh.config.ts` discovery.
`TSQH-MVP-004` is complete and unifies that TypeScript surface: its strict default export may be
either a partial overlay on the built-in sequential workflow or a complete version 1 workflow. An
absent file uses the unchanged default. A project can enable or disable native quality stages
without copying the complete workflow, while advanced projects can stay in TypeScript when they
replace the full graph. Explicit complete JSON configurations remain supported.

`TSQH-MVP-006` is complete. Complete workflows can set provider defaults and refine model and
effort independently at role or individual agent-step level. Resolution is
`step -> role -> provider`; the selected provider owns exact argument placeholders and invalid or
incomplete rendering contracts fail before execution. The TDD Pipeline pack uses the provider's
Luna/max defaults for its agent dispatches.

`TSQH-MVP-007` is complete. Failed native-gate output is reduced deterministically to a bounded
`GateFailureContext`, while passed-gate output is not sent to the next model prompt. The simple
policy reuses its implementation owner for rework; the TDD Pipeline policy routes quick failures to
the phase owner and full failures to hardener. It does not adapt the upstream Troubleshooter into a
universal product repairer.

`TSQH-MVP-007` is the latest completed specification. `TSQH-MVP-008` is the active planned
specification; it is not implemented. The current position is summarized in [`STATUS.md`](STATUS.md);
completed increments and historical evidence are archived in [`STATUS-HISTORY.md`](STATUS-HISTORY.md).

The completed controller includes the smallest useful specialist-pipeline collaboration primitive:
bounded output from one successfully completed agent becomes untrusted context for the next
configured agent. Native gates are also candidate-stable: the controller compares Git snapshots
around each gate and blocks any Git-visible candidate-path mutation while permitting configured
gates to regenerate ignored quality reports.

Two self-contained packs live under [`workflows/`](workflows/). The
[`simple`](workflows/simple/README.md) pack demonstrates a tester-first TDD flow: the tester creates
a suite and its acceptance manifest, the implementer makes it pass, `quick` validates repository
health, and the system-owned acceptance gate checks that the manifest has one or more tagged tests
per requirement without parsing the task document. A gate failure returns to the tester for a bounded
review before implementation rework. It intentionally excludes the `full` chain and its individual
release gates. The
[`tdd-pipeline`](workflows/tdd-pipeline/README.md) pack uses the sequential
`specifier -> tester -> implementer -> cleaner -> architect -> hardener` spine, quick after each
phase, and one final full gate. Its original paraphrased prompts are informed by the upstream
`main`, `two-pack`, `four-pack`, `six-pack`, and `squad` branches. The planner remains
the only transition authority; there is no peer messaging, persistent leader, dynamic spawning,
daemon, or per-role worktree.

## Design provenance

The local specifications are authoritative for this repository. The implementation keeps its own
workflow behavior and does not depend on a sibling checkout or import another project's runtime.

## Requirements and setup

TSQH requires Node.js 22.12.0 or newer, pnpm, Git, and the configured local command executables.
For local setup, install the repository dependencies with:

```sh
pnpm install --frozen-lockfile
```

For a TSQH dogfooding campaign, the selected workflow is the acceptance policy and owns its gate
order. The `simple` pack intentionally uses only its configured quick gate; the `tdd-pipeline` pack
includes the full release gate explicitly.

The current repository implementation has Ajv as its only runtime dependency. MVP-008 plans to ship
the consumer-facing quality toolchain as exact package runtime dependencies so a host project can
install TSQH as a `devDependency` and run its quality stages without installing a second toolchain.
The repository itself continues to use the single pnpm lockfile, and the declared Node.js floor is
22.12.0.

Once MVP-008 is implemented, the fastest package trial will be:

```sh
pnpm dlx tsqh-mvp demo
```

The equivalent npm forms will be `npx tsqh-mvp demo` and `npm exec tsqh-mvp -- demo`. Once the
package is available, the demo execution will create and remove its own tiny consumer fixture, use
no credentials or network requests, and report the package-owned tool versions and stage trace.

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
provisioned with those identities. Workflows that configure the Sonar gate provide its scanner
invocation.

Do not commit an environment file or token. A fresh server must reproduce the exact identities in
the completed specification and must not modify the sibling `azaru_tsqh` project.

## Public repository checklist

The repository includes an MIT license, a dependency-frozen GitHub Actions workflow, a safe
`.env.example`, and no required path outside this checkout. Quality reports and credentials remain
ignored. The CI workflow runs the fast static/build/test/architecture checks.

Read [`SECURITY.md`](SECURITY.md) for the trust boundary and reporting guidance.

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

Complete workflows may select an agent `model` and `effort` at three levels. Each field resolves
independently through `step -> role -> provider`; an absent value continues to the next level. The
selected provider owns the command syntax through exact `{model}` and `{effort}` placeholders in
its argument array. A resolved value and a matching placeholder must both exist, and substitution
never invokes a shell or creates additional arguments. Values are provider-defined bounded
identifiers rather than a controller-owned model catalog.

For example, a provider default can be refined by a role and one specific step:

```ts
export default {
  schemaVersion: 1,
  workflow: {
    id: "example",
    entryStepId: "specify",
    steps: {
      specify: {
        type: "agent",
        role: "specifier",
        model: "gpt-5.6-sol",
        effort: "xhigh",
        maxVisits: 1,
        onCompleted: "passed",
      },
      passed: { type: "terminal", outcome: "passed" },
    },
  },
  roles: {
    specifier: {
      provider: "codex",
      effort: "high",
      promptPath: "prompts/specifier.md",
      allowedPathPrefixes: [],
    },
  },
  providers: {
    codex: {
      type: "command",
      executable: "codex",
      args: ["exec", "--model", "{model}", "--config", "model_reasoning_effort=\"{effort}\"", "-"],
      model: "gpt-5.6-luna",
      effort: "max",
      promptTransport: "stdin",
    },
  },
  profiles: {},
};
```

Agent and gate commands are always spawned as one executable plus an exact argument array with
`shell: false`. Agent prompts travel only over standard input. Provider and profile `timeoutMs`
values are optional and may be between 1 ms and 24 hours; both default to 15 minutes. Native
command streams are sanitized and limited to 64 KiB before they are persisted. Provider events
keep a smaller diagnostic summary, including the stderr tail, while the complete provider
transcript is retained only in the run-owned provider log for post-run diagnosis.

An ordinary failed gate is additionally reduced to a `GateFailureContext` before another agent is
dispatched. Each stream excerpt is limited to 8 KiB and retains a UTF-8-safe beginning and end plus
capture and context-truncation facts. A gate-driven assignment omits the previous successful-agent
handoff, so a stale 64 KiB prose result is not duplicated beside the failure evidence. The bounded
raw process artifact stays in the trace and complete machine reports stay in the workspace for
selective inspection.

Quality profiles may also name explicit `environmentKeys`. Only those configured gate processes
receive the additional values; agent-provider processes retain the fixed minimal environment.

The repository ships exactly two self-contained complete workflow packs. The
[`simple`](workflows/simple/workflow.json) pack has tester and implementer roles, a native
pnpm `quick` profile, and explicit bounded rework edges. Quick failures return to the tester for a
bounded suite review before returning to the implementer. There is no generic repair step. The full
release chain is not part of this pack.

The [`tdd-pipeline`](workflows/tdd-pipeline/workflow.json) pack runs
`specifier -> tester -> implementer -> cleaner -> architect -> hardener`, with `quick` after
each phase and `full` as the final gate. Tester writes only `test/`; implementer, cleaner,
architect, and hardener write only `src/`; specifier is read-only. Architect owns structure and
justified design-pattern corrections. Only prompts referenced by this
workflow remain in its owned [`prompts/`](workflows/tdd-pipeline/prompts/) directory.

Both packs use one generic Codex command provider. The provider arguments match the locally
inspected Codex CLI interface; they remain ordinary configuration and may need adjustment for
another Codex release. The TDD Pipeline pack uses Luna/max defaults. The simple pack leaves model
and effort absent, so Codex retains its externally configured defaults.

The controller now supplies the latest successfully completed agent's bounded, sanitized stdout to
the next configured agent with source identity and truncation state. Gates preserve that handoff,
and its text cannot alter task, provider, write authority, transitions, visits, or gate outcomes.
Native gates compare Git state before and after execution and block tracked or untracked candidate
changes; owned ignored quality reports remain outside that candidate diff.

## Run and status

Build before invoking the package script:

```sh
pnpm tsqh run \
  --workspace /absolute/path/to/a/clean-git-worktree \
  --task /absolute/path/to/task.md

# Optional complete-workflow override:
pnpm tsqh run \
  --config workflows/simple/workflow.json \
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

The simple workflow task deliberately writes only under `src/` and `test/`. Run the smoke only when
`codex --version` succeeds and `codex login status` confirms authentication. Use a disposable,
clean Git copy of this repository so the example agents cannot touch the development checkout:

```sh
pnpm tsqh run \
  --config workflows/simple/workflow.json \
  --workspace /absolute/path/to/disposable-clean-tsqh-copy \
  --task workflows/simple/task.md \
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
