---
id: TSQH-MVP-008
status: planned
risk: medium
---

# Small static-analysis and security guardrails

## Value

Add a short, useful front door before the existing quality chain: detect exposed secrets, unsafe
TypeScript and Node security patterns, and forbidden module dependencies. The implementation uses
one package-owned wrapper for secrets, one package-owned ESLint invocation for typed lint and
lightweight SAST rules, and one package-owned dependency-graph check inside `quick`.

This increment is intentionally narrow. It does not add dependency-vulnerability scanning, a
second security service, or a new controller protocol. It also makes the installed package usable
from an npm or pnpm consumer project and adds a no-credentials demo command. Creating this document
does not install tools, change the running workflow, or establish passing implementation evidence.

## Relationship to completed increments

MVP-001 through MVP-007 remain normative. Preserve pure planning, sequential execution, provider
isolation, candidate-stable gates, strict configuration, bounded sanitized failure context, and
finite configured rework. Tool-specific logic belongs in native quality adapters, never in planner
transitions.

This increment adds optional `secrets` and `lint` stages. It replaces the narrow regex architecture
check used by `quick` with dependency-cruiser, without adding a separate workflow stage. Quality
executables are shipped with TSQH and resolved from the installed package; the consumer supplies
the candidate workspace and its project configuration. Absent and legacy partial configurations
retain the existing six-stage chain. Complete version 1 JSON and TypeScript workflows remain valid
without migration.

The bundled workflow packs, prompts, and provenance manifest are examples and distribution assets,
not test-owned policy. Behavioral tests use synthetic configurations and native responses; they do
not assert the example packs' exact model selections, role lists, prompt wording, hashes, or
upstream commit identities.

## Scope and decisions

| Concern | Decision | Required outcome |
| --- | --- | --- |
| Secrets | Gitleaks candidate and reachable-history scans behind one wrapper | Zero unapproved findings and redacted complete evidence |
| Typed lint | ESLint flat configuration with typescript-eslint | Zero warnings, errors, or parser failures |
| Lightweight SAST | `eslint-plugin-security` in the same ESLint invocation | Selected security rules fail closed; no claim of complete vulnerability coverage |
| Architecture | dependency-cruiser inside `quick` | Zero forbidden edges, cycles, unresolved imports, or unclassified production modules |
| Analysis scope | Consumer-configured production, test, script, and exclusion globs | Defaults cover `src/`, `test/`, and `scripts/`; adapters use the resolved scope rather than repository paths |
| Dependency vulnerability scanning | Out of scope | No SCA or advisory service in this increment |
| Independent SAST service | Out of scope | No CodeQL, Semgrep service, or second security analyzer |
| Package distribution | Included | `npm pack`, npm install, pnpm install, the `tsqh` bin, and the demo work in a clean consumer fixture |

The selected npm Gitleaks wrapper, the complete quality toolchain, ESLint, typescript-eslint,
dependency-cruiser, and `eslint-plugin-security` are exact package runtime dependencies because
the installed CLI executes them against the consumer workspace. Type declarations and
repository-only fixtures remain development dependencies. The security plugin identifies potential
hotspots and can produce false positives, so this MVP uses a small selected rule set and documents
that limitation.

## Delivery order and command behavior

When the new stages are enabled, the required chain is:

```text
secrets -> lint -> quick -> coverage -> crap -> knip -> mutation -> sonar
```

Absent and legacy partial configurations retain:

```text
quick -> coverage -> crap -> knip -> mutation -> sonar
```

Every stage is executed by the installed TSQH package with fixed executable-plus-argument arrays;
the package must not call a consumer's `pnpm quality:*` or `npm run quality:*` script. Stages execute
sequentially and stop on the first nonzero result. The existing thresholds remain unchanged: 90% global and 100% domain coverage
across all four measures, CRAP at most 6, zero Knip findings and hints, every runnable mutant
`Killed`, and the approved server-computed Sonar gate `OK`. Checker `CompileError` mutations
remain separately reported non-runnable mutants.

TSQH resolves one strict consumer analysis scope before the first code-quality stage. Its default
patterns are production `src/**/*.ts`, tests `test/**/*.ts`, and scripts `scripts/**/*.mjs`, with
the standard generated/dependency/report exclusions. A consumer may replace those patterns in its
configuration for layouts such as `lib/`, `__tests__/`, or `tools/`; no adapter assumes that the
repository's directory names exist. Tests remain executable inputs for the runner. Production
patterns feed coverage, CRAP, mutation, Sonar, and the production architecture graph; test patterns
feed test execution and typed lint; script patterns feed typed/generic lint and Knip. Configuration,
workflow examples, prompts, reports, and dependencies are policy inputs or excluded artifacts, not
production code targets.

`quality:quick` remains usable offline and runs package-owned typecheck, build, dependency-cruiser
architecture, then the complete deterministic test suite against the consumer workspace.
`quality:architecture` remains independently callable. Full must not invoke architecture as a
duplicate top-level stage.

Individual commands must work from a clean consumer workspace after package installation. No gate
enables autofix, updates dependencies, downloads tools, or mutates tracked candidate files. Native
failure statuses and evidence-validation failures remain failures.

## Tool provisioning and policy protection

- Pin every tool executed by a consumer-facing quality stage, including TypeScript, Vitest,
  coverage, CRAP, Knip, mutation, Sonar, ESLint, the compatible typescript-eslint packages,
  dependency-cruiser, `eslint-plugin-security`, and the selected npm Gitleaks wrapper as exact
  package dependencies in `package.json` and the single lockfile.
- Verify that the selected Gitleaks wrapper resolves a platform binary during package installation.
  A scan must fail if the wrapper would download a binary at invocation time or cannot identify its
  installed engine version.
- Verify compatibility with Node.js 22.12.0 or newer and TypeScript 5.9.3 before implementation.
- Keep lint, dependency-cruiser, Gitleaks policy, manifests, and report validators outside bundled
  writing-role path allowances. No provider receives scanner credentials.
- Run every external command with executable-plus-argument arrays, `shell: false`, a fixed
  candidate directory, finite timeouts, and explicit environment allowlists.
- Resolve package-owned executables from the installed TSQH package root, never from the consumer's
  `node_modules/.bin` and never by invoking a consumer package script.
- Resolve production, test, script, and exclusion globs from the validated consumer scope. Reject
  absolute paths, parent escapes, empty patterns, unknown scope properties, and exclusions that
  cannot be normalized beneath the candidate workspace.
- Tool configuration is trusted local policy for this MVP. The evidence binds invocation, tool
  versions, analyzed scope, source inputs, reports, and process facts; it does not require tests or
  separate digests for configuration files.

## Distribution and consumer compatibility

Remove the package's private-only marker and publish the compiled CLI, required schemas, prompts,
workflow assets, and the demo fixture through an explicit `files`/exports manifest. `npm pack` is
the local distribution boundary; a clean fixture must install the tarball with both npm and pnpm
and execute the `tsqh` binary without the source checkout, repository scripts, or a sibling path.
The package must be usable as a host project's `devDependency`; its runtime dependency graph may be
larger than the current repository graph because it owns the quality toolchain.

The consumer workspace remains the candidate under analysis. Before a gate starts, TSQH inspects
its package manifest, Git root, TypeScript project, test configuration, supported module format, and
optional quality scope. If the scope is absent, it uses the defaults above; if it is present, its
include and exclusion patterns are applied consistently by the relevant adapters.
Missing or unsupported project configuration produces a bounded warning in `doctor` and the run
summary. If the required command or evidence cannot be constructed, the gate blocks; a warning
never converts missing or contradictory evidence into success.

A consumer with a different layout can provide the scope in its project configuration:

```ts
export default {
  quality: {
    lint: true,
    scope: {
      production: ["lib/**/*.ts"],
      tests: ["__tests__/**/*.ts"],
      scripts: ["tools/**/*.mjs"],
      exclude: ["generated/**", "fixtures/**"],
    },
  },
};
```

TSQH owns tool versions and command arguments. The consumer owns source files and project settings
that the adapters explicitly read. No peer quality tool is required, and no install hook modifies
the consumer project.

## Quick trial

Add a consumer-read-only `tsqh demo` command with an optional `--json` result. `pnpm dlx tsqh-mvp
demo` and `npx tsqh-mvp demo` must:

1. create an invocation-owned tiny TypeScript consumer fixture under
   `tmp/codex-tsqh-demo-<invocation>/`;
2. run the package-owned secrets, lint, and quick stages with a deterministic built-in provider;
3. print the discovered package version, tool versions, warnings, stage trace, and cleanup result;
4. use no Codex credentials, Sonar service, or consumer file writes. Once the package is available,
   the demo itself makes no network requests; `npx`/`pnpm dlx` may use their normal package-manager
   access to obtain the package; and
5. remove only its own fixture after success, failure, cancellation, or setup error.

The demo is an installation smoke and does not claim a real agent run, mutation evidence, or Sonar
release result. README must show the one-command trial and the equivalent `npm exec`/`pnpm dlx`
forms.

## Secrets contract

One `quality:secrets` wrapper runs two sequential Gitleaks scans:

1. Candidate files: all tracked files plus non-ignored untracked files, including unstaged
   modifications. Tracked files remain included even when an ignore rule also matches them.
2. Reachable local history: commits reachable from `HEAD` and all locally available refs, including
   tags. The wrapper records the inspected ref/object inventory and rejects shallow or incomplete
   history. It does not fetch remote history, inspect reflogs, or rewrite commits.

Both scans must complete successfully with zero unapproved findings. The configured code-analysis
scope does not narrow either scan: candidate files and reachable history remain the complete
declared secret-scanning scope. Reports, errors, traces and
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

The lint scope is the resolved union of the consumer's production, test, and script patterns.
Typed TypeScript rules apply to supported TypeScript files; generic JavaScript/security rules apply
to supported script files. Generated output, dependencies, scanner output, reports, workflow packs,
prompt assets, and task-owned `tmp/codex-*` paths are excluded explicitly unless a future policy
extension opts them in. Invalid fixture snippets are represented as data or narrowly scoped fixtures.

Require a JSON report with an entry for every expected file, including files with zero findings.
Disable inline configuration so a suppression comment cannot weaken enforcement. Validate the
command, tool versions, scope, input inventory, report digest, native exit status, and completeness
before returning success. The result is lightweight SAST evidence, not a claim of full application
vulnerability analysis.

## Architecture contract

Replace `scripts/check-architecture.mjs` with dependency-cruiser's resolved module graph. Keep the
check inside `quality:quick`; do not create a second top-level architecture stage. The graph starts
from the resolved production patterns; scripts are checked by lint and Knip, while test files and
workflow/configuration assets do not become production architecture modules.

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

Extend the strict partial quality schema with boolean `secrets` and `lint` properties plus an
optional `scope` object containing `production`, `tests`, `scripts`, and `exclude` string arrays.
The booleans default to `false` for absent and legacy partial configurations. Scope arrays default
to `src/**/*.ts`, `test/**/*.ts`, `scripts/**/*.mjs`, and the standard generated/dependency/report
exclusions. The two bundled complete packs enable both stages when implementation begins; complete
custom workflows remain unchanged unless they explicitly add the stages or scope.

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
| Strict options | `secrets` and `lint` accept only booleans; scope arrays accept only valid relative patterns and reject unknown keys |
| Consumer scope | Default production/test/script patterns work; a consumer override changes adapter scope consistently; malformed, escaping, or empty patterns block |
| Secret scopes | Tracked, unstaged, untracked, deleted historical secrets, tags, shallow history and missing objects are exercised |
| Secret redaction | Synthetic secret bytes appear nowhere in reports, traces, errors or provider prompts |
| Typed lint/SAST | Unsafe promise, unsafe-value, unsafe-regex, dynamic-process and bidi fixtures fail in configured production/test/script paths; corrected fixtures pass |
| Architecture | Nested imports, aliases, re-exports, type-only imports, cycles, unresolved edges and layer violations are exercised |
| Evidence failures | Missing, stale, wrong-workspace, partial, oversize and contradictory reports reject a pass |
| Tool failures | Missing/wrong-version binaries, spawn errors, timeouts, signals and malformed output block |
| Candidate stability | A zero-exit new gate that changes candidate paths blocks |
| Repair routing | One-time lint failure selects its owner; secrets failure blocks without a writer |
| Package distribution | npm and pnpm install the packed artifact in clean consumer fixtures; `tsqh` resolves package-owned tools without the source checkout |
| Quick trial | `npx tsqh-mvp demo`, `npm exec tsqh-mvp -- demo`, and `pnpm dlx tsqh-mvp demo` report the deterministic trace and clean only their own fixture |
| Consumer compatibility | Missing or unsupported consumer settings produce bounded warnings; an unconstructable command or invalid evidence blocks |
| Cleanup | Success, failure and cancellation remove only invocation-owned temporary paths |

Workflow evidence must cover real pinned-tool fixture checks for Gitleaks, ESLint/security rules,
and dependency-cruiser, demonstrating failing and corrected fixtures. It must also cover the
actual repository gates, complete non-incremental mutation, and approved real Sonar before claiming
implementation completion. A fake scan is never release evidence.

## Implementation sequence and deliverables

1. Make the package publishable: remove the private marker, define its `files`/exports boundary,
   move every consumer-facing quality tool to exact runtime dependencies, select the npm Gitleaks
   wrapper, and prove `npm pack` plus clean npm and pnpm installs.
2. Add package-root tool resolution and consumer preflight. Remove the repository-name and
   consumer-script assumptions, implement the default/overridden production-test-script scope,
   bounded compatibility warnings and blocking conditions, and prove the installed `tsqh` binary
   works without the source checkout.
3. Replace the regex architecture script with a dependency-cruiser adapter and its small JSON rule
   file. Validate the real repository graph before adding fixtures.
4. Implement typed ESLint plus the selected security rules as one lint invocation and one validated
   JSON report.
5. Implement the two-scope redacted Gitleaks wrapper and its bounded evidence validator. The
   wrapper must use its installed engine and must not download one during a scan.
6. Integrate the strict partial switches, both workflow packs, repair edges, reports, the `demo`
   command, and docs.
7. Validate real failing/corrected fixtures, the packed-install smoke, and the three demo entry
   points. Record exact workflow-generated stage evidence and blockers.

Expected changes include package.json and pnpm-lock.yaml with the package-owned quality toolchain,
its files/exports boundary, package-root resolution and consumer preflight, configurable analysis
scope, quality adapters and tests, protected lint/dependency-cruiser policy, the Gitleaks wrapper
integration, the demo command, partial schema and expansion, both workflow packs, README, and
STATUS.md. Do not introduce a new
runtime action, trace protocol, role, generic tool plugin framework, SCA, advisory service, or
independent SAST service.

## Non-goals and completion

This increment does not include SCA, CodeQL, Semgrep service, automatic credential rotation, Git
history rewriting, concurrency, daemon behavior, remote execution, or managed worktrees. The
lightweight security plugin does not provide complete vulnerability coverage; future work may
replace it with an independent SAST service if the project needs that assurance.

Implementation is complete only when the specified gates and compatibility rules exist, all
acceptance scenarios pass, real tools demonstrate failing and corrected fixtures, both package
manager install paths pass, all three demo entry points clean up correctly, and the opted-in
eight-stage full command exits zero with current evidence. Specification delivery alone remains
planned and does not imply a new full-chain, packed-install, or real Codex smoke result.

## Primary tool references

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
- [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- [ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint typed configurations](https://typescript-eslint.io/users/configs/)
- [eslint-plugin-security](https://github.com/eslint-community/eslint-plugin-security)
