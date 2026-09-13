---
id: TSQH-MVP-008
status: planned
risk: medium
---

# Small static-analysis and security guardrails

## Value

Add a short, useful front door before the existing quality chain: detect exposed secrets, unsafe
TypeScript and Node security patterns, and forbidden module dependencies. The implementation uses
one wrapper for secrets, one ESLint invocation for typed lint and lightweight SAST rules, and one
dependency-graph check inside `quick`.

This increment is intentionally narrow. It does not add dependency-vulnerability scanning, a
second security service, or a new controller protocol. Creating this document does not install
tools, change the running workflow, or establish passing implementation evidence.

## Relationship to completed increments

MVP-001 through MVP-007 remain normative. Preserve pure planning, sequential execution, provider
isolation, candidate-stable gates, strict configuration, bounded sanitized failure context, and
finite configured rework. Tool-specific logic belongs in native quality adapters, never in planner
transitions.

This increment adds optional `secrets` and `lint` stages. It replaces the narrow regex architecture
check used by `quick` with dependency-cruiser, without adding a separate workflow stage. Absent and
legacy partial configurations retain the existing six-stage chain. Complete version 1 JSON and
TypeScript workflows remain valid without migration.

## Scope and decisions

| Concern | Decision | Required outcome |
| --- | --- | --- |
| Secrets | Gitleaks candidate and reachable-history scans behind one wrapper | Zero unapproved findings and redacted complete evidence |
| Typed lint | ESLint flat configuration with typescript-eslint | Zero warnings, errors, or parser failures |
| Lightweight SAST | `eslint-plugin-security` in the same ESLint invocation | Selected security rules fail closed; no claim of complete vulnerability coverage |
| Architecture | dependency-cruiser inside `quick` | Zero forbidden edges, cycles, unresolved imports, or unclassified production modules |
| Dependency vulnerability scanning | Out of scope | No SCA or advisory service in this increment |
| Independent SAST service | Out of scope | No CodeQL, Semgrep service, or second security analyzer |
| Package publishing | Out of scope | The package remains private |

Gitleaks is an explicitly installed external executable recorded by a checked-in non-secret tool
manifest; it is not a runtime or pnpm dependency. ESLint, typescript-eslint, dependency-cruiser,
and `eslint-plugin-security` are exact development dependencies. The security plugin identifies
potential hotspots and can produce false positives, so this MVP uses a small selected rule set and
documents that limitation.

## Delivery order and command behavior

When the new stages are enabled, the required chain is:

```text
secrets -> lint -> quick -> coverage -> crap -> knip -> mutation -> sonar
```

Absent and legacy partial configurations retain:

```text
quick -> coverage -> crap -> knip -> mutation -> sonar
```

Every name maps to `pnpm quality:<name>`. Stages execute sequentially and stop on the first
nonzero result. The existing thresholds remain unchanged: 90% global and 100% domain coverage
across all four measures, CRAP at most 6, zero Knip findings and hints, every runnable mutant
`Killed`, and the approved server-computed Sonar gate `OK`. Checker `CompileError` mutations
remain separately reported non-runnable mutants.

`quality:quick` remains usable offline and runs typecheck, build, dependency-cruiser architecture,
then the complete deterministic test suite. `quality:architecture` remains independently callable.
Full must not invoke architecture as a duplicate top-level stage.

Individual commands must work from a clean build state with installed prerequisites. No gate enables
autofix, updates dependencies, fetches Git history, or mutates tracked candidate files. Native
failure statuses and evidence-validation failures remain failures.

## Tool provisioning and policy protection

- Pin ESLint, the compatible typescript-eslint packages, dependency-cruiser, and
  `eslint-plugin-security` as exact development dependencies with pnpm and the single lockfile.
- Record the exact Gitleaks release, supported host artifacts, checksums, and report assumptions in
  a checked-in non-secret manifest. The gate fails if the required executable is missing or does
  not match the manifest.
- Verify compatibility with Node.js 22.12.0 or newer and TypeScript 5.9.3 before implementation.
- Keep lint, dependency-cruiser, Gitleaks policy, manifests, and report validators outside bundled
  writing-role path allowances. No provider receives scanner credentials.
- Run every external command with executable-plus-argument arrays, `shell: false`, a fixed
  candidate directory, finite timeouts, and explicit environment allowlists.
- Tool configuration is trusted local policy for this MVP. The evidence binds invocation, tool
  versions, analyzed scope, source inputs, reports, and process facts; it does not require tests or
  separate digests for configuration files.

## Secrets contract

One `quality:secrets` wrapper runs two sequential Gitleaks scans:

1. Candidate files: all tracked files plus non-ignored untracked files, including unstaged
   modifications. Tracked files remain included even when an ignore rule also matches them.
2. Reachable local history: commits reachable from `HEAD` and all locally available refs, including
   tags. The wrapper records the inspected ref/object inventory and rejects shallow or incomplete
   history. It does not fetch remote history, inspect reflogs, or rewrite commits.

Both scans must complete successfully with zero unapproved findings. Reports, errors, traces and
provider prompts contain only redacted metadata. Inline allow directives and global ignore files
that weaken the checked-in policy are rejected. Synthetic fixtures may use a narrow documented
exception; real credentials may never be baselined.

Candidate and history scope are compared with the declared workspace before the result is accepted.
Missing binaries, unsupported repositories, incomplete enumeration, malformed reports, truncated
output, or scanner errors block directly. No writer is dispatched for a secrets failure because
remediation may require rotation or history decisions.

## Typed lint and lightweight SAST contract

Use ESLint flat configuration with typed `recommendedTypeChecked` rules and these correctness rules:

- `no-floating-promises`;
- `no-misused-promises`;
- `await-thenable`;
- `no-unsafe-assignment`;
- `no-unsafe-argument`;
- `no-unsafe-call`;
- `no-unsafe-member-access`; and
- `no-unsafe-return`.

Use a small explicit security rule set from `eslint-plugin-security`, rather than enabling every
rule. The initial candidates are unsafe regular expressions, dynamic filesystem paths, dynamic
`require`, dynamic child-process execution, `eval`, and bidi-control characters. The final set is
fixed only after synthetic safe and unsafe fixtures demonstrate that the selected rules work with
this TypeScript/ESM codebase. A finding or parser failure is an error; there is no autofix or
warning-only mode.

The lint scope is the complete recursive set of `src/**/*.ts` and `test/**/*.ts`. Generated output,
dependencies, scanner output, reports, and task-owned `tmp/codex-*` paths are excluded explicitly.
Invalid fixture snippets are represented as data or narrowly scoped fixtures.

Require a JSON report with an entry for every expected file, including files with zero findings.
Disable inline configuration so a suppression comment cannot weaken enforcement. Validate the
command, tool versions, scope, input inventory, report digest, native exit status, and completeness
before returning success. The result is lightweight SAST evidence, not a claim of full application
vulnerability analysis.

## Architecture contract

Replace `scripts/check-architecture.mjs` with dependency-cruiser's resolved module graph. Keep the
check inside `quality:quick`; do not create a second top-level architecture stage.

Start with one JSON rule file and these fail-closed rules:

- no circular dependencies;
- no unresolved imports;
- no production import into `test`, generated output, or scanner/report directories;
- no production use of undeclared or development-only packages;
- `src/domain/**` imports only domain modules and no external packages;
- `src/application/**` imports only application/domain modules and no external packages;
- `src/adapters/**` imports adapters/application/domain plus Node built-ins and declared runtime
  dependencies;
- `src/cli/**`, `src/cli.ts`, and `src/quality/**` follow their existing repository allowances;
- every production TypeScript module is included in the analyzed inventory; and
- `require()` and computed dynamic imports are rejected by the lint/security configuration where
  dependency-cruiser cannot resolve them.

The adapter reads a bounded JSON report, verifies the exact source inventory and configuration
identity, and rejects warnings, errors, unresolved modules, cycles, missing modules, malformed
output, or an empty graph. No custom dependency graph implementation is introduced.

## Evidence, output, and cleanup

Each new wrapper writes a versioned report beneath the owned ignored quality-report directory.
Missing, stale, partial, contradictory, malformed, oversize, secret-bearing, or outside-workspace
evidence blocks. Full reports must not be parsed from truncated stdout; read bounded report files
and reject oversize reports explicitly. Native tool messages are untrusted data.

Create temporary paths only under `<project-root>/tmp/codex-<task>/`, with exclusive per-invocation
ownership, and clean them on success, failure, cancellation, and setup errors. Nothing under `tmp/`
is a maintained test or production input. Durable sanitized evidence may remain under
`reports/quality/`. No cache reuse may satisfy a required fresh scan.

## Configuration compatibility and rework

Extend the strict partial quality schema with boolean `secrets` and `lint` properties. Both default
to `false` for absent and legacy partial configurations. The two bundled complete packs enable both
stages when implementation begins; complete custom workflows remain unchanged unless they explicitly
add them.

Disabled stages and unused profiles are removed. Pass edges reconnect to the next enabled stage;
repair returns to the first enabled stage. With all optional stages disabled, implementation still
connects directly to passed as the explicit consumer-policy behavior. Preserve complete version 1
custom graphs exactly as supplied.

| Failed stage | Built-in/simple `onFailed` | Swarm Forge `onFailed` |
| --- | --- | --- |
| secrets | Explicit blocked terminal | Explicit blocked terminal |
| lint | Implementer repair | Cleaner rework |
| quick, including architecture | Implementer repair | Implementer rework |
| coverage, crap, knip | Implementer repair | Cleaner rework |
| mutation, sonar | Implementer repair | Hardener rework |

Writing rework returns to the first enabled stage and remains finite. Configure the simple workflow
for its initial run plus two owner repairs and the Swarm Forge workflow for its initial run plus six
owner repairs, without changing existing per-step visit semantics.

## Verification and acceptance scenarios

Deterministic tests use fake processes, local Git fixtures, synthetic secrets, and recorded native
responses. They do not depend on live credentials, model calls, or network services.

| Scenario | Required evidence |
| --- | --- |
| Full opted-in path | Secrets, lint, quick, coverage, CRAP, Knip, mutation and Sonar execute once in order |
| Legacy compatibility | Absent and old partial configurations retain the six-stage chain |
| Strict options | `secrets` and `lint` accept only booleans and reject unknown keys |
| Secret scopes | Tracked, unstaged, untracked, deleted historical secrets, tags, shallow history and missing objects are exercised |
| Secret redaction | Synthetic secret bytes appear nowhere in reports, traces, errors or provider prompts |
| Typed lint/SAST | Unsafe promise, unsafe-value, unsafe-regex, dynamic-process and bidi fixtures fail; corrected fixtures pass |
| Architecture | Nested imports, aliases, re-exports, type-only imports, cycles, unresolved edges and layer violations are exercised |
| Evidence failures | Missing, stale, wrong-workspace, partial, oversize and contradictory reports reject a pass |
| Tool failures | Missing/wrong-version binaries, spawn errors, timeouts, signals and malformed output block |
| Candidate stability | A zero-exit new gate that changes candidate paths blocks |
| Repair routing | One-time lint failure selects its owner; secrets failure blocks without a writer |
| Cleanup | Success, failure and cancellation remove only invocation-owned temporary paths |

Run real pinned-tool fixture checks for Gitleaks, ESLint/security rules, and dependency-cruiser,
demonstrating failing and corrected fixtures. Run the actual repository gates, complete
non-incremental mutation, and approved real Sonar before claiming implementation completion. A fake
scan is never release evidence.

## Implementation sequence and deliverables

1. Verify compatible versions and install only ESLint/typescript-eslint, dependency-cruiser and the
   selected security plugin; record Gitleaks separately as an external executable.
2. Replace the regex architecture script with a dependency-cruiser adapter and its small JSON rule
   file. Validate the real repository graph before adding fixtures.
3. Implement typed ESLint plus the selected security rules as one lint invocation and one validated
   JSON report.
4. Implement the two-scope redacted Gitleaks wrapper and its bounded evidence validator.
5. Integrate the strict partial switches, both workflow packs, repair edges, reports and docs.
6. Run real failing/corrected fixtures, `pnpm quality:quick`, the opted-in full chain, complete
   mutation, and approved Sonar. Record exact evidence and blockers.

Expected changes include quality adapters and tests, protected lint/dependency-cruiser policy,
Gitleaks manifest, package.json and pnpm-lock.yaml, partial schema and expansion, both workflow
packs, README, and STATUS.md. Do not introduce a new runtime action, trace protocol, role, generic
tool plugin framework, SCA, advisory service, or independent SAST service.

## Non-goals and completion

This increment does not include SCA, CodeQL, Semgrep service, package publication checks, automatic
credential rotation, Git history rewriting, concurrency, daemon behavior, remote execution, or
managed worktrees. The lightweight security plugin does not provide complete vulnerability
coverage; future work may replace it with an independent SAST service if the project needs that
assurance.

Implementation is complete only when the specified gates and compatibility rules exist, all
acceptance scenarios pass, real tools demonstrate failing and corrected fixtures, and the opted-in
eight-stage full command exits zero with current evidence. Specification delivery alone remains
planned and does not imply a new full-chain or real Codex smoke result.

## Primary tool references

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
- [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- [ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint typed configurations](https://typescript-eslint.io/users/configs/)
- [eslint-plugin-security](https://github.com/eslint-community/eslint-plugin-security)
