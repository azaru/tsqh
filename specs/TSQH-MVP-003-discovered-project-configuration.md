---
id: TSQH-MVP-003
status: complete
risk: high
---

# Discovered partial project configuration

> Completed on 2026-08-25. The final `quality:full` execution passed 747 tests, killed all 3,077
> runnable mutants while retaining 1,161 checker-rejected `CompileError` results, and completed real
> Sonar analysis `2eaebf1b-26df-4ad8-8bb0-ab1591cce778` with the approved computed gate `OK`.

## Value

A project can run TSQH without repeating the complete controller graph. TSQH discovers one
repository-root `tsqh.config.ts`, treats its default export as a strict partial override of a safe
built-in workflow, and uses the unchanged built-in workflow when that file is absent.

The first useful override is selective native-gate enablement. For example, a project can disable
Sonar without copying roles, providers, prompts, profiles, transitions, or visit limits:

```ts
export default {
  quality: {
    sonar: false,
  },
};
```

## Relationship to completed increments

`TSQH-MVP-001` and `TSQH-MVP-002` remain normative for controller authority, sequential execution,
bounded repair, candidate-stable gates, path enforcement, and fail-closed evidence. This increment
changes configuration discovery and expansion only. It does not add a planner branch for a quality
tool, let configuration output select a runtime transition, or weaken a gate that remains enabled.

## CLI contract

The `run` command keeps `--workspace` and `--task` required. `--config` becomes optional:

```text
tsqh run --workspace <clean-git-worktree> --task <file>
tsqh run --config <file> --workspace <clean-git-worktree> --task <file>
```

Resolution is exact and does not search parent directories:

1. When `--config` is present, load only that explicit path.
2. Otherwise, look for `<workspace>/tsqh.config.ts`.
3. When the discovered file does not exist, expand the built-in default.
4. A discovered path that exists but is not a regular file, cannot be resolved, cannot be evaluated,
   or exports invalid data is an error; it never falls back to the default.

An explicit `.json` path retains the complete version 1 workflow contract. An explicit
`tsqh.config.ts` path uses the partial project configuration contract below. Other file extensions
are rejected. A legacy `workflow.json` is never discovered implicitly.

The selected or discovered project configuration is protected from agent writes when it resides
inside the candidate workspace. Built-in configuration and prompt content have no candidate path
to protect.

## Partial TypeScript configuration

`tsqh.config.ts` must have one default export whose runtime value is a plain JSON-compatible object.
The initial strict shape is:

```ts
interface TsqhProjectConfiguration {
  readonly quality?: {
    readonly quick?: boolean;
    readonly coverage?: boolean;
    readonly crap?: boolean;
    readonly knip?: boolean;
    readonly mutation?: boolean;
    readonly sonar?: boolean;
  };
}
```

Every property is optional and defaults to the built-in value. Unknown properties at either level
are rejected. Missing default exports, arrays, functions, symbols, non-finite numbers, class
instances, accessors, cycles, and values that are not JSON-compatible are rejected before workflow
execution.

All six quality stages default to enabled. An empty object therefore produces exactly the same
resolved configuration as an absent file.

## TypeScript evaluation boundary

The TypeScript configuration is trusted project policy, not agent output. It is evaluated in a
fresh Node.js process using the declared Node.js 22 floor and built-in type stripping. The adapter
uses the current Node executable with a fixed argument array, `shell: false`, the candidate root as
the working directory, a minimal non-secret environment, bounded stdout and stderr, and a short
timeout. No environment credential is forwarded.

The evaluator imports only the exact resolved configuration path requested by the loader and emits
one machine-readable envelope over a dedicated inherited pipe that is separate from standard output
and standard error. Configuration console output, process failure, timeout, signal, oversized
output, missing envelope, duplicate envelope, malformed JSON, or an unserializable export is an
exact configuration error. Configuration output and evaluator prose cannot become configuration.

Because a TypeScript module is executable project policy, it may have ordinary code side effects
within the operating-system account. TSQH does not claim to sandbox a hostile configuration module.
Keeping agent write authority away from the configuration path remains the primary v0 boundary.

## Built-in default expansion

The built-in default uses the completed hardening workflow as declarative data:

```text
implement -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed
                  \-> repair --------------------------------------/
```

- `implementer` and `repairer` use one generic `codex` command provider.
- Both roles may write only beneath `src/` and `test/`.
- Built-in English implementer and repairer prompts are immutable application content.
- Every enabled native gate uses its existing `pnpm quality:<gate>` command, environment allowlist,
  and timeout.
- Every enabled gate failure selects `repair`; a completed repair returns to the first enabled gate.
- The repair role has two visits. Enabled gate visit budgets remain finite.

Expansion walks the fixed quality order and includes only enabled stages. Each enabled gate's pass
edge targets the next enabled gate or `passed`. `implement.onCompleted` and
`repair.onCompleted` target the first enabled gate. Disabled gates and profiles do not exist in the
resolved configuration and therefore do not create fake pass events.

When all quality stages are disabled, expansion omits `repair`, connects `implement` directly to
`passed`, and still produces a valid finite workflow. This is an explicit project-policy choice,
not an inferred pass for any disabled gate.

The fully expanded result is deep-frozen and passes the strict version 1 schema and semantic graph
validation before task loading, Git inspection, trace creation, agents, or native commands. The
schema is amended only to permit an empty `profiles` map for a graph containing no gate steps; all
other complete-configuration rules remain unchanged.

## Architecture

- Project-option types and deterministic default expansion contain no filesystem, process, Git,
  network, provider, or clock access.
- The configuration adapter owns path discovery, bounded TypeScript evaluation, JSON loading,
  schema validation, prompt resolution, and protected-path identity.
- The CLI chooses the explicit/discovered/default loading mode and passes one ordinary resolved
  `Configuration` to the controller.
- The planner and trace formats do not change.

## Verification

Automated tests must prove:

- `run` discovers `<workspace>/tsqh.config.ts` when `--config` is absent;
- absence produces the exact default graph and profiles;
- an empty partial object equals the absent-file default;
- `quality: { sonar: false }` omits the Sonar step and profile and connects mutation to `passed`;
- disabling intermediate, leading, trailing, multiple, and all stages produces exact deterministic
  transitions and repair return points;
- disabled gate commands never spawn and never appear as passed events;
- unknown, malformed, non-object, missing-export, unserializable, noisy, oversized, timed-out,
  signalled, and nonzero TypeScript configurations fail before Git or trace side effects;
- a discovered directory or broken path does not fall back;
- the discovered candidate configuration path is protected from writing roles;
- `--config` wins over discovery, accepts the legacy complete JSON contract, and rejects unsupported
  extensions;
- malformed CLI arguments and all existing explicit JSON configuration behavior retain their intent;
- happy, gate-failure, repair-success, repair-exhaustion, unauthorized-change, and spawn-error
  behavior remains controlled by the expanded workflow.

Tests use temporary configuration modules and controlled executables. They must not require Codex,
Sonar, network access, or a live external service.

## Required deliverable

- strict partial project-configuration types and schema;
- pure built-in default expansion and immutable built-in prompts;
- bounded TypeScript configuration evaluator and exact discovery rules;
- optional `--config` CLI behavior with legacy JSON compatibility;
- behavioral configuration, CLI, transition, failure, and protection tests;
- a repository-root `tsqh.config.ts` example disabling Sonar;
- README usage and `STATUS.md` aligned with the implemented behavior;
- targeted, quick, and full quality evidence.

## Non-goals

- ancestor-directory search or multiple discovered configuration files;
- JavaScript, CommonJS, YAML, or implicit JSON discovery;
- arbitrary partial replacement of workflow steps, roles, providers, profiles, prompts, or commands;
- user-defined TypeScript functions, hooks, plugins, computed runtime transitions, or async config
  factories;
- sandboxing a hostile project-owned configuration module;
- dynamic provider installation or provider SDKs;
- changes to trace schemas, planner actions, concurrency, daemons, remote execution, managed
  worktrees, merge, or crash-safe resume.

## Completion condition

The increment is complete when discovery, absence fallback, strict partial overrides, deterministic
gate omission, protected configuration paths, evaluator failures, explicit JSON compatibility, and
all existing workflow behaviors pass; documentation describes the actual public command surface;
`pnpm quality:full` exits zero; and `STATUS.md` records exact evidence or an exact blocker.
