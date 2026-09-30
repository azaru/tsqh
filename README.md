# TSQH — TypeScript Quality Harness

TSQH is a small command-line controller that runs AI coding agents inside a fixed, configurable
workflow of quality gates. Its one idea:

> **Agents do the work, but configuration decides what happens next.**
> An agent cannot skip a gate, declare its own success, or edit files outside its role.

This is a personal side project for learning and experimenting with AI-assisted development. It is
a work in progress, not a released product.

## Why

Coding agents are good at writing code and bad at being their own referee. Left alone, an agent may
claim tests pass when they do not, "fix" a failure by weakening the check, or touch files it was
never asked to change. TSQH moves those decisions out of the model:

- A **workflow graph** in configuration selects every next step, repair loop, and final result.
- **Native gates** (tests, coverage, mutation testing, static analysis) decide pass or fail by exit
  status. Agent output that claims success is ignored.
- Each **role** may only write under its allowed path prefixes. TSQH checks the Git diff after every
  agent step and blocks on any other change.
- Every step has a **visit budget**, so repair loops always terminate with `passed` or an exact
  blocker.
- Every run leaves an append-only **JSONL trace** you can inspect afterwards.

## How it works

```text
tester ──> implementer ──> quick gate ──passed──> passed
               ^               │
               └────failed─────┘   (with a bounded summary of the failure)
```

A real run of that graph, using stand-in agents that just edit a file and a gate that fails on its
first visit (output trimmed):

```text
$ tsqh run --config workflow.json --workspace ./candidate --task task.md
Run: a5a6ffbd-ecc0-475d-b0ed-f5a461cc23a7
State: passed
Visits: {"tester":1,"implementer":2,"quick":2,"passed":1}
Blocker: none
```

The trace behind it, condensed from `events.jsonl`:

```text
run-created
step-started tester 1       -> completed
step-started implementer 1  -> completed
step-started quick 1        -> failed      # gate exit 1: follow the configured onFailed edge
step-started implementer 2  -> completed   # implementer receives the failure context
step-started quick 2        -> passed
run-finished                   passed
```

And the same workflow when the tester writes into `src/`, which its role does not allow:

```text
State: blocked
Blocker: unauthorized-changes: Step 'tester' changed unauthorized paths: src/work.txt.
```

## Built with AI

TSQH was built mostly by AI coding agents, and later by **dogfooding itself**: Codex agents ran under
the TSQH controller and had to get through its own quality gates.

- **Spec-driven increments.** Each feature starts as a numbered specification in [`specs/`](specs/)
  (MVP-001 to MVP-010). Agents implement against the active spec, not open-ended prompts.
- **An explicit agent contract.** [`AGENTS.md`](AGENTS.md) holds the rules every agent follows:
  no shell interpolation, fail-closed validation, path-restricted writes, required behavioral tests.
- **Honest status tracking.** [`STATUS.md`](STATUS.md) records the current position.
  [`STATUS-HISTORY.md`](STATUS-HISTORY.md) is the raw log, including failed dogfooding attempts:
  agents that timed out, wrote invalid tests, or drifted out of scope, and the harness fixes that
  followed.
- **A strict quality bar for AI-written code.** The full chain runs tests, V8 coverage, CRAP score,
  Knip dead-code detection, Stryker mutation testing, and a SonarQube quality gate, in that order.

## Project status

| Area | State |
| --- | --- |
| Controller, planner, trace, `run` / `status` CLI | Implemented (MVP-001 to MVP-007) |
| Quality chain: `quick -> coverage -> crap -> knip -> mutation -> sonar` | Implemented as configurable gates |
| `tsqh.config.ts` discovery and workflow packs (`simple`, `tdd-pipeline`) | Implemented |
| Self-contained package distribution ([MVP-008](specs/TSQH-MVP-008-static-analysis-and-security-guardrails.md)) | In progress: public package boundary done |
| Secret scanning, typed lint, architecture gate, `tsqh demo` (MVP-008) | Planned |
| Approved work orders and OpenSpec adapter ([MVP-009](specs/TSQH-MVP-009-approved-work-orders-and-openspec-adapter.md)) | Planned |
| Execution profiles and deterministic escalation ([MVP-010](specs/TSQH-MVP-010-execution-profiles-and-deterministic-escalation.md)) | Planned |
| npm release | Not published; run from a local checkout |

## Quick start

Requires Node.js 22.12.0 or newer, pnpm, and Git. The bundled workflow packs also need the
[Codex CLI](https://github.com/openai/codex) as their agent provider.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm quality:quick        # build, typecheck, tests, architecture check

pnpm tsqh run \
  --config workflows/simple/workflow.json \
  --workspace /absolute/path/to/a/clean-git-worktree \
  --task /absolute/path/to/task.md

pnpm tsqh status --run /absolute/path/reported/by/run
```

Only point `--workspace` at a disposable clean Git worktree: the agents edit it.

## Workflow packs

Two ready-made workflows live under [`workflows/`](workflows/):

- [`simple`](workflows/simple/README.md): a tester-first TDD flow. The tester writes a suite and an
  acceptance manifest, the implementer makes it pass, then `quick` and a system-owned acceptance
  gate check the result. Failures go back to the tester for a bounded review.
- [`tdd-pipeline`](workflows/tdd-pipeline/README.md): a six-role spine,
  `specifier -> tester -> implementer -> cleaner -> architect -> hardener`, with `quick` after each
  phase and the full quality chain at the end. The tester writes only `test/`, the specifier is
  read-only, and the other roles write only `src/`.

Both packs use one Codex command provider. Its arguments match a locally inspected Codex CLI
release and may need adjusting for another version.

## Configuration

Without a config file, TSQH uses a built-in workflow:

```text
implement -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed
                  \-> repair --------------------------------------/
```

A `tsqh.config.ts` at the workspace root can switch stages off:

```ts
export default {
  quality: {
    sonar: false,
  },
};
```

A disabled stage is removed and the previous pass edge reconnects to the next enabled stage.

It can also replace the whole graph by exporting a complete version 1 workflow, the same object a
`workflow.json` accepts:

```ts
export default {
  schemaVersion: 1,
  workflow: { /* steps: agent, gate, and terminal nodes with their edges */ },
  roles: { /* role -> provider, prompt file, allowed write paths */ },
  providers: { /* command, argument array, prompt over stdin */ },
  profiles: { /* native gate commands */ },
};
```

Configuration keeps four concerns separate:

```text
workflow step -> logical role -> command provider
              -> quality profile
```

Key rules:

- **Strict validation.** Unknown properties, broken references, unreachable terminals, and invalid
  visit limits are rejected before any agent runs. The schemas are
  [`project-config.schema.json`](schemas/project-config.schema.json) (partial form) and
  [`workflow.schema.json`](schemas/workflow.schema.json) (complete form).
- **No shell.** Agents and gates always run as an executable plus an argument array with
  `shell: false`. Prompts travel over stdin.
- **Model selection.** A workflow can set agent `model` and `effort` on a step, a role, or a
  provider, resolved in that order and substituted into exact `{model}` / `{effort}` placeholders.
- **Bounded output.** Stored process output is limited to 64 KiB. A failed gate is reduced to a
  failure context of at most 8 KiB per stream before the next agent sees it. Successful gate output
  never reaches a prompt.
- **Credentials stay with gates.** Extra environment values reach only the gates that list them in
  `environmentKeys`. Agent processes get a fixed minimal environment.
- **Protected policy.** The config file, task, prompts, and run data cannot be edited by agents.

`tsqh.config.ts` is trusted, executable project code. TSQH evaluates it in a separate bounded Node.js
process without credentials, but does not sandbox it.

## CLI reference

- `run` validates configuration, prompts, and task, checks that the workspace is a clean Git
  worktree root, then executes the workflow one step at a time. Options: `--config`, `--workspace`,
  `--task`, `--runs-root` (defaults to `<system-temp>/tsqh-runs`), `--json`.
- `status --run <dir>` reads a trace without writing to it and reports the current step, visit
  counts, latest outcome, and blocker.

Outcomes are derived only from process facts. An agent step completes on exit 0 and blocks on
anything else. A gate passes on exit 0, follows `onFailed` on a nonzero exit, and blocks on a launch
error, timeout, signal, or any change to Git-visible candidate files.

Exit codes: `0` passed, `1` blocked, `2` usage, configuration, pre-run Git, or trace error.

## Architecture

```text
src/domain        pure types, graph validation, trace reduction, next-action planner
src/application   controller, prompt composition, ports
src/adapters      config loading, process execution, Git inspection, JSONL trace store
src/cli           argument parsing and human/JSON output
src/quality       wrappers and evidence validators for coverage, CRAP, Knip, Stryker, Sonar
```

An automated check keeps `src/domain` free of Node.js, package, and outer-layer imports, so planning
stays deterministic and testable without a filesystem, Git, or processes.

### Limitations

Version 0 is deliberately small. It has no parallelism, daemon, remote executor, managed worktrees,
merge authority, crash-safe resume, locking, provider SDK, or dashboard. It trusts the local
controller process and the configured executables. The JSONL trace is an audit log, not a recovery
protocol.

## Design provenance

The local specifications are authoritative for this repository, which is self-contained and does not
depend on any other checkout. The `tdd-pipeline` workflow pack and its role prompts are original,
paraphrased adaptations of ideas from the Swarm Forge multi-agent workflow branches (`main`,
`two-pack`, `four-pack`, `six-pack`, `squad`). No upstream code, runtime, or prompt text is
included. Rationale and the design comparison are recorded mainly in
[MVP-002](specs/TSQH-MVP-002-quality-hardening-and-role-catalog.md) and
[MVP-007](specs/TSQH-MVP-007-compact-gate-failure-context-and-owned-rework.md).

## Contributing and security

Read [`AGENTS.md`](AGENTS.md) for the development contract and maintainer operations (local
SonarQube, Codex smoke runs), and [`SECURITY.md`](SECURITY.md) for the trust boundary and reporting
guidance.

## License

[MIT](LICENSE)
