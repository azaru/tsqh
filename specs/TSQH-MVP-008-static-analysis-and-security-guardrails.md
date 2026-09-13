---
id: TSQH-MVP-008
status: planned
risk: medium
---

# Typed lint guardrail

## Value

Catch unsafe TypeScript usage before the existing quality chain reaches coverage and mutation.
This increment adds one small native gate with fresh machine evidence and deterministic failure
behavior. It does not attempt to solve every static-analysis or supply-chain concern in one MVP.

This document specifies the next implementation increment. Creating it does not install tools,
change the running workflow, or establish passing implementation evidence.

## Relationship to completed increments

MVP-001 through MVP-007 remain normative. Preserve pure planning, sequential execution, provider
isolation, candidate-stable gates, strict configuration, bounded sanitized failure context, and
finite configured rework. Tool-specific logic belongs in a native quality adapter, never in
planner transitions.

This increment adds the optional `lint` stage and leaves the existing six-stage chain unchanged
for absent or legacy partial configuration. Complete version 1 JSON and TypeScript workflows
remain valid without migration. The existing architecture check remains part of `quick`.

## Scope and decisions

| Concern | Decision | Required outcome |
| --- | --- | --- |
| Typed lint | ESLint flat configuration with typescript-eslint | Zero warnings, errors, or parser failures |
| Architecture replacement | Deferred | Preserve the existing `quick` architecture contract |
| Secret scanning | Deferred | No secrets gate in this increment |
| Dependency vulnerability scanning | Deferred | No advisory service or lockfile gate in this increment |
| Independent SAST | Deferred | No CodeQL or equivalent gate in this increment |
| Package publishing | Deferred | The package remains private |

ESLint is selected for the current TypeScript 5.9.3 toolchain. Retain `tsc` as the compiler and
typecheck authority. Do not couple this increment to a TypeScript major upgrade or replace the
checker with Oxlint's type-check mode.

## Delivery order and command behavior

When `lint` is enabled, the required chain is:

```text
lint -> quick -> coverage -> crap -> knip -> mutation -> sonar
```

Absent and legacy partial configurations retain the existing chain:

```text
quick -> coverage -> crap -> knip -> mutation -> sonar
```

Every name maps to `pnpm quality:<name>`. Stages execute sequentially and stop on the first
nonzero result. The existing thresholds remain unchanged: 90% global and 100% domain coverage
across all four measures, CRAP at most 6, zero Knip findings and hints, every runnable mutant
`Killed`, and the approved server-computed Sonar gate `OK`. Checker `CompileError` mutations
remain separately reported non-runnable mutants.

`quality:quick` remains usable offline and runs typecheck, build, architecture, then the complete
deterministic test suite. `quality:architecture` remains independently callable. Full must not
invoke architecture as a duplicate top-level stage.

Individual commands must work from a clean build state with installed prerequisites. No gate
enables autofix, updates dependencies, fetches external data, or mutates tracked candidate files.
Quality wrappers retain native failure statuses, and evidence-validation failures remain failures
even when the native tool exits zero.

## Tool provisioning and policy protection

- Pin ESLint and the compatible typescript-eslint packages as exact development dependencies with
  pnpm and the single lockfile.
- Verify compatibility with Node.js 22.12.0 or newer and TypeScript 5.9.3 before implementation.
- Keep the ESLint configuration and report validator outside all bundled writing-role path
  allowances.
- Run the tool with executable-plus-argument arrays, `shell: false`, a fixed candidate directory,
  finite timeouts, and no forwarded credentials.
- Do not download tools, install dependencies, or change configuration during a gate.
- Tool configuration is trusted local policy for this MVP. The lint evidence binds the invocation,
  tool versions, analyzed scope, source inputs, report output, and native process facts; it does
  not require separate tests or digests for configuration files.

## Typed lint contract

Use the pinned typed configuration based on `recommendedTypeChecked` plus these correctness rules:

- `no-floating-promises`;
- `no-misused-promises`;
- `await-thenable`;
- `no-unsafe-assignment`;
- `no-unsafe-argument`;
- `no-unsafe-call`;
- `no-unsafe-member-access`; and
- `no-unsafe-return`.

Rule options must prevent a bare `void` expression from silently satisfying promise handling. Do
not enable every stylistic or pedantic rule by default.

The initial lint scope is the complete recursive set of `src/**/*.ts` and `test/**/*.ts`. Generated
output, dependencies, scanner output, reports, and task-owned `tmp/codex-*` paths are excluded
explicitly. Invalid fixture snippets must be represented as data or narrowly scoped fixtures.

Require a JSON report with an entry for every expected file, including files with zero findings.
A parser failure, missing type project, ignored expected file, empty scan, warning, error, or
truncated report fails. Disable inline configuration so a suppression comment cannot weaken the
gate. The report must identify the exact command, tool versions, scope, and analyzed input set.

## Evidence, output, and cleanup

Write a versioned lint report beneath the owned ignored quality-report directory. Validate its
schema, invocation identity, tool versions, scope, input digests, report digest, native exit
status, and completeness before returning success.

Missing, stale, partial, contradictory, malformed, oversize, secret-bearing, or outside-workspace
evidence blocks. Full machine reports must not be parsed from truncated process stdout. Read a
bounded report file and reject oversize reports explicitly. Native scanner messages are untrusted
data.

Create temporary paths only under `<project-root>/tmp/codex-<task>/`, with exclusive per-invocation
ownership, and clean them on success, failure, cancellation, and setup errors. Durable sanitized
evidence may remain under the existing owned ignored `reports/quality/` directory. No cache reuse
may satisfy a required fresh lint scan.

## Configuration compatibility and rework

Extend the strict partial quality schema with a boolean `lint` property. It defaults to `false`
for absent and legacy partial configurations so existing consumers retain the six-stage behavior.
The repository's opted-in complete packs enable the new lint stage when implementation begins;
complete custom workflows remain unchanged unless they explicitly add it.

Disabled stages and unused profiles are removed. Pass edges reconnect to the next enabled stage;
repair returns to the first enabled stage. With all optional stages disabled, implementation still
connects directly to passed as the explicit consumer-policy behavior. Preserve complete version 1
custom graphs exactly as supplied.

| Failed stage | Built-in/simple `onFailed` | Swarm Forge `onFailed` |
| --- | --- | --- |
| lint | Implementer repair | Cleaner rework |
| quick, including architecture | Implementer repair | Implementer rework |
| coverage, crap, knip | Implementer repair | Cleaner rework |
| mutation, sonar | Implementer repair | Hardener rework |

Lint rework returns to the first enabled stage and remains finite. Configure the simple workflow
to allow its initial run plus two owner repairs and the Swarm Forge workflow to allow its initial
run plus six owner repairs, without changing the existing per-step visit semantics.

## Verification and acceptance scenarios

Deterministic tests use fake processes and recorded native responses. They must not depend on live
credentials, model calls, or network services.

| Scenario | Required evidence |
| --- | --- |
| Opted-in happy path | Lint and the six existing stages execute once in order and reach passed |
| Legacy compatibility | Absent and old partial configurations still expand to the original six stages |
| Strict option | `lint` accepts only booleans and rejects unknown keys |
| Typed failure | Unsafe promise and unsafe-value fixtures fail with validated lint evidence |
| Typed success | Corrected fixtures pass with a complete report including zero-finding files |
| Report failures | Missing, stale, malformed, truncated, oversize, or contradictory evidence blocks |
| Tool failures | Missing binary, spawn error, timeout, signal, parser failure, and nonzero exit block |
| Candidate stability | A zero-exit lint process that changes candidate paths blocks |
| Repair success | A one-time lint failure selects the configured owner and restarts at the first stage |
| Cleanup | Success, failure, and cancellation remove only invocation-owned temporary paths |

Run real pinned-tool fixture checks in addition to parser tests, demonstrating one failing fixture
and its corrected form. Run the actual repository gates and the complete non-incremental mutation
and approved Sonar checks before claiming implementation completion. A fake lint scan is never
release evidence.

## Implementation sequence and deliverables

1. Verify compatible ESLint and typescript-eslint versions without changing existing thresholds.
2. Implement the typed lint adapter, report format, bounded I/O, and evidence validator.
3. Integrate the strict partial switch, optional graph expansion, both workflow packs, rework
   routing, and documentation.
4. Add failing and corrected real-tool fixtures plus deterministic process and evidence tests.
5. Run the opted-in full chain and record exact evidence and any remaining blocker.

Expected changes include the lint adapter and tests, protected ESLint configuration, package.json
and pnpm-lock.yaml, partial schema and expansion, both workflow packs, README, and STATUS.md. Do
not introduce a new runtime action, trace protocol, role, generic tool plugin abstraction, secret
scanner, architecture replacement, advisory service, or SAST gate in this increment.

## Non-goals and completion

This increment does not include secret scanning, dependency vulnerability scanning, architecture
replacement, CodeQL, package publication checks, credential rotation, Git history rewriting,
concurrency, daemon behavior, remote execution, or managed worktrees.

Implementation is complete only when the specified lint behavior and compatibility rules exist,
all acceptance scenarios pass, the real lint fixtures pass and fail as expected, and the opted-in
full command exits zero with current evidence. Specification delivery alone remains planned and
does not imply a new full-chain or real Codex smoke result.

## Primary tool references

- [ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint typed configurations](https://typescript-eslint.io/users/configs/)
- [typescript-eslint compatibility](https://typescript-eslint.io/users/dependency-versions/)
