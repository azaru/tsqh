---
id: TSQH-MVP-006
status: complete
risk: high
---

# Provider-aware agent model and effort selection

## Value

A workflow can select the model and reasoning effort for each agent dispatch while retaining useful
defaults. A provider supplies the most general selection, a role may refine it for every step that
uses that role, and an individual agent step may override it for one dispatch point.

## Relationship to completed increments

`TSQH-MVP-001` through `TSQH-MVP-005` remain normative for strict configuration, deterministic
transition authority, provider-neutral command execution, sequential behavior, bounded repair,
candidate write enforcement, handoff trust boundaries, and self-contained workflow packs. This
increment changes only agent-provider selection and provider argument rendering. It does not give
models, roles, providers, or agents transition authority.

## Configuration contract

The complete version 1 configuration accepts optional `model` and `effort` strings on command
providers, roles, and agent steps. Each field resolves independently for the provider selected by
the step's role:

```text
agent step value -> role value -> provider value -> absent
```

This permits a step to override only its model while inheriting effort, or the inverse. Gate and
terminal steps do not accept these properties. Values are provider-owned identifiers: TSQH checks
that they are bounded and safe configuration strings, but it does not embed a model catalog or a
reasoning-effort enum.

Provider `args` remain an explicit argument array and may contain the exact placeholders `{model}`
and `{effort}`. Before spawning an agent, TSQH replaces each placeholder with the corresponding
resolved value in that same argument. Rendering never invokes a shell and never treats a selected
value as more than one process argument.

Validation fails before Git, trace creation, agents, or gates when:

- a provider, role, or agent step contains an invalid model or effort value;
- a reachable agent step resolves a model or effort for which its provider has no matching
  placeholder;
- a provider argument contains a model or effort placeholder that the reachable step cannot
  resolve;
- a provider contains duplicate selection placeholders or an unsupported placeholder name.

Providers without placeholders and dispatches without any resolved selection retain the previous
exact argument behavior.

## Swarm Forge pack policy

The `workflows/swarm-forge/` provider defaults to `gpt-5.6-luna` with effort `max`. The `specifier`
and `architect` steps override those defaults with `gpt-5.6-sol` and effort `xhigh`. Implementer,
cleaner, hardener, QA, and repairer inherit the provider defaults. The provider renders these
values with the locally verified Codex CLI argument contract; they remain workflow configuration,
not controller policy.

## Security and architecture

- Resolution and validation are deterministic functions of validated configuration.
- Model and effort values cannot alter roles, providers, prompts, write authority, transitions,
  visit limits, gate outcomes, executable identity, working directory, environment, or timeout.
- Rendering produces an executable plus argument array with `shell: false`; values are never shell
  fragments and cannot add arguments.
- The command provider owns its argument syntax. The domain does not branch on provider ids,
  model names, effort names, or Codex-specific flags.
- The trace format and planner transition semantics remain unchanged.

## Verification

Automated tests must prove:

- complete JSON and TypeScript configurations accept provider, role, and step selections;
- step values override role values and role values override provider values independently;
- absent overrides inherit correctly, and a completely absent selection preserves exact existing
  provider arguments;
- the selected provider's templates render exact process arguments without shell interpolation;
- invalid values, missing values, missing placeholders, duplicate placeholders, unsupported
  placeholders, and selection properties on non-agent steps fail before runtime side effects;
- the Swarm Forge pack resolves Sol/xhigh only for specifier and architect and Luna/max for every
  other agent step, including repairer;
- planning order, repair behavior, provider environment isolation, path authority, and native gate
  execution do not regress.

Tests use deterministic fake command runners and do not require a live provider, network access,
or a real Codex invocation.

## Required deliverable

- strict types, JSON schema, semantic validation, and provider argument rendering;
- provider-, role-, and step-level precedence tests;
- the configured Swarm Forge model and effort policy;
- aligned pack and repository documentation;
- targeted, `quality:quick`, and `quality:full` evidence recorded in `STATUS.md`.

## Non-goals

- provider discovery, provider SDKs, model availability checks, pricing policy, token budgets, or
  runtime fallback to a different model;
- interpreting provider output to infer the effective model or effort;
- changing role selection, adding a provider override to agent steps, or allowing a step to select
  a provider other than the one referenced by its role;
- trace-schema migration, concurrency, daemon mode, remote execution, or dynamic transitions.

## Completion condition

The increment is complete when strict configuration and execution tests demonstrate the complete
precedence chain and exact argument rendering, the Swarm Forge pack implements the requested model
policy, `pnpm quality:full` exits zero, and `STATUS.md` records exact evidence or an exact blocker.

## Completion evidence — 2026-08-26

- Strict complete JSON and TypeScript loading accepts model and effort on providers, roles, and
  agent steps. Semantic validation rejects unsafe values, missing or unresolved templates,
  duplicate templates, and unsupported placeholders before runtime side effects.
- Controller tests prove independent `step -> role -> provider` resolution and exact argument-array
  rendering without mutating configured templates. Existing providers with no selection preserve
  their exact arguments.
- The Swarm Forge provider defaults to `gpt-5.6-luna`/`max`; only specifier and architect override
  it with `gpt-5.6-sol`/`xhigh`. The installed `codex-cli 0.149.1` help confirms the configured
  `--model` and `--config model_reasoning_effort=...` argument contract.
- Targeted verification passed 232 tests across seven affected configuration, domain, controller,
  and prompt-pack test files. Final `quality:quick` passed 780 tests across 29 files and the
  seven-entry domain architecture boundary.
- Coverage passed with 780 tests: 100% statements (1,833/1,833), 99.53% branches (1,064/1,069),
  100% functions (411/411), and 100% lines (1,801/1,801). CRAP covered 31 source files and 431
  units with zero violations and maximum 6; Knip reported zero issues or hints.
- Focused mutation over selection, validation, and dispatch produced 144 mutants: all 102 runnable
  mutants were `Killed`, 42 checker-rejected mutants were `CompileError`, and no other status
  occurred.
- The final complete non-incremental mutation run produced 4,343 mutants: all 3,148 runnable
  mutants were `Killed`, 1,195 checker-rejected mutants were `CompileError`, and no other status
  occurred.
- The first full attempt correctly stopped at Sonar after complete mutation because the approved
  localhost service was not running. After starting only `infra/sonar/compose.yaml`, a standalone
  scan passed and the complete chain was repeated from `quick`.
- Final `pnpm quality:full` exited 0 in the exact
  `quick -> coverage -> crap -> knip -> mutation -> sonar` order. Sonar analysis
  `4eaeae6e-409a-4a1c-9ba0-08d98fd19bc1` produced computed gate `OK` with the approved dedicated
  project policy. The private environment was parsed without printing or persisting credentials.
- No real Codex agent smoke was run or claimed for this increment.
