---
id: TSQH-MVP-008
status: planned
risk: high
---

# Static analysis and security guardrails

## Value

Catch unsafe TypeScript constructs, architectural dependency violations, exposed secrets, and
known vulnerable dependencies before expensive mutation testing. Each check must prove its scope
and outcome with fresh machine evidence. Missing tools, incomplete scans, or unavailable advisory
data cannot produce a delivery pass.

This document specifies the next implementation increment. Creating it does not install tools,
change the running workflow, or establish passing implementation evidence.

## Relationship to completed increments

MVP-001 through MVP-007 remain normative except for the explicit changes below. Preserve pure
planning, sequential execution, provider isolation, candidate-stable gates, strict configuration,
bounded sanitized failure context, and finite configured rework. Tool-specific logic belongs in
native quality adapters, never in planner transitions.

This increment adds three native stages, `secrets`, `lint`, and `sca`, and replaces the architecture
implementation already invoked by `quick`. It changes the repository delivery chain and bundled
packs, while retaining the existing six-stage behavior for absent or legacy partial configuration.
Complete version 1 JSON and TypeScript workflows remain valid without migration.

The sibling design references linked from README supply rationale for dependency boundaries,
subject-bound evidence, and controller-owned transitions. They do not import APIs, milestone
state, concurrency, an evidence DAG, or a new execution protocol. MVP-007 and the existing Swarm
Forge provenance remain authoritative for role ownership; no new upstream role adaptation is needed.

## Scope and decisions

| Concern | Decision | Required outcome |
| --- | --- | --- |
| Typed lint | ESLint flat configuration with typescript-eslint | Zero warnings, errors, or parsing failures |
| Architecture | dependency-cruiser inside `quality:quick` | Zero forbidden edges, cycles, unresolved imports, or unclassified production modules |
| Secrets | Gitleaks over candidate files and reachable local Git history | Zero unapproved findings and complete declared scope |
| Dependency vulnerabilities | OSV-Scanner over the exact pnpm lockfile | Zero reported known vulnerabilities, including development and transitive dependencies |
| Independent SAST | A bounded CodeQL feasibility decision | Document compatibility, licensing prerequisites, and concrete next-step recommendation |
| Package publishing | Deferred | This package is currently private; no publication gate is introduced |

ESLint is selected to fit the current TypeScript 5.9.3 toolchain. Retain `tsc` as the compiler and
typecheck authority. Do not couple this increment to a TypeScript major upgrade or replace the
checker with Oxlint's type-check mode. Pin mutually compatible versions during implementation;
do not interpret current online tool documentation as an immutable compatibility guarantee.

SCA deliberately uses zero findings rather than an ambiguous severity cutoff. Missing severity is
not grounds to accept a vulnerability. This scans known advisories; it does not claim to detect
every malicious dependency, compromised publisher, or new supply-chain attack.

## Delivery order and command behavior

The required repository `pnpm quality:full` order becomes:

```text
secrets -> lint -> quick -> sca -> coverage -> crap -> knip -> mutation -> sonar
```

Every name maps to `pnpm quality:<name>`. All stages execute sequentially and stop on the first
nonzero result. The six existing stages retain their relative order and all existing thresholds:
90% global and 100% domain coverage across all four measures, CRAP at most 6, zero Knip findings
and hints, every runnable mutant `Killed`, and the approved server-computed Sonar gate `OK`.
Checker `CompileError` mutations remain separately reported non-runnable mutants.

`quality:quick` remains usable offline and runs typecheck, build, architecture, then the complete
deterministic test suite. `quality:architecture` remains independently callable. Full must not
also invoke architecture as a duplicate top-level stage. Secrets and lint precede quick; SCA
precedes coverage and mutation so remote dependency failures avoid those costs.

Individual commands must work from a clean build state with installed prerequisites. If a wrapper
requires compiled quality adapters, it builds them explicitly. Gitleaks must never execute an
untrusted repository command to discover files. No gate enables autofix, updates dependencies,
fetches Git history, installs its own tools, or mutates tracked candidate files.

Quality wrappers retain native failure statuses. Their own evidence-validation failures return
nonzero even when the scanner returns zero. Finding and operational failure are distinguished in
the quality summary, but both reject a pass. A completed wrapper's nonzero exit follows the
configured `onFailed` edge; a summary field does not create a new controller transition protocol.
Controller-observed spawn errors, timeouts, signals, and candidate mutation keep existing blocker
semantics.

## Tool provisioning and policy protection

- Pin ESLint, typescript-eslint, and dependency-cruiser as exact development dependencies using
  pnpm and the single lockfile. Verify compatibility with the declared Node floor and TypeScript
  compiler before selecting versions. No additional runtime dependency is required.
- Record exact Gitleaks and OSV-Scanner releases, supported host artifacts, checksums, and report
  format assumptions in a checked-in non-secret tool manifest. Document explicit installation;
  gates verify tool identity and fail if a required binary is missing or mismatched.
- Keep tool configuration, manifest, lockfile, suppression policy, and report validators outside
  all bundled writing-role path allowances. No provider receives scanner credentials.
- Use executable-plus-argument arrays with `shell: false`, fixed candidate working directories,
  finite timeouts, and explicit environment allowlists. Do not invoke download-on-demand runners.
- Record each gate's timeout in its profile and test its enforcement. Local scans default to
  15 minutes; network operations also require bounded request timeouts without indefinite retries.

## Typed lint contract

Use the pinned `recommendedTypeChecked` configuration plus explicit correctness rules. At minimum
enforce `no-floating-promises`, `no-misused-promises`, `await-thenable`, `no-unsafe-assignment`,
`no-unsafe-argument`, `no-unsafe-call`, `no-unsafe-member-access`, and `no-unsafe-return`.
Rule options must prevent a bare `void` expression from silently satisfying promise handling.
Do not turn on every stylistic or pedantic rule by default.

Scan all production and test TypeScript recursively with resolved type information. Scan tracked
JavaScript tooling and root configuration modules with applicable non-type-aware correctness
rules. Include new untracked files in those same candidate scopes. The policy must list the exact
extensions and source roots; generated build, dependency, scanner, and report directories are
excluded explicitly. Test fixtures that intentionally contain invalid snippets must be represented
as data or narrowly documented fixtures, not broad test-directory exclusions.

Require a JSON report covering every expected file, including files with zero findings. A parser
failure, ignored expected file, missing type project, empty scan, warning, or error fails. Disable
inline lint configuration so agent-written suppression comments cannot weaken enforcement.
The checked-in rule inventory and config digest identify the effective policy.

## Architecture contract

Replace the current non-recursive regex with dependency-cruiser's resolved module graph. Recursively
cover production TypeScript, resolve `.js` specifiers to their TypeScript sources using the project
configuration, and account for type-only imports, re-exports, and literal dynamic imports.

The initial allowed production dependency directions are:

| Source | Allowed internal targets | Allowed external targets |
| --- | --- | --- |
| `src/domain/**` | Domain only | None, including Node built-ins |
| `src/application/**` | Application and domain | None, including Node built-ins |
| `src/adapters/**` | Adapters, application, domain | Node built-ins and declared runtime dependencies |
| `src/cli/**`, `src/cli.ts` | CLI, application, adapters, domain | Node built-ins and declared runtime dependencies |
| `src/quality/**` | Quality, application ports, domain | Node built-ins and declared runtime dependencies |

`src/quality/cli.ts` alone may additionally import concrete adapters as the quality composition
root. The application-ports allowance for quality means `src/application/ports.ts`, not arbitrary
application implementation. Same-layer edges are permitted only when acyclic. Production code must
not import tests, generated output, development dependencies, or an unclassified source directory.
Reject unresolved imports and both runtime and type-only cycles. Ban `require` calls and computed
dynamic imports in production so unsupported dynamic edges cannot bypass this ESM graph policy.
Recognize Node built-ins with and without the `node:` prefix.

Resolve aliases before applying layer rules. Reject path escapes and symlink escapes. Expected
production file inventory must match the analyzed graph; a graph with zero violations but missing
modules fails. No blanket exception may preserve a forbidden current edge: fix it or record the
specific implementation blocker. Maintain meaningful rule IDs in diagnostics.

## Secrets contract

Run two sequential scans under one `quality:secrets` result:

1. Candidate files: all tracked files plus non-ignored untracked files, including modifications
   not staged in Git. Do not rely only on a committed diff. Explicitly included tracked files must
   not disappear because an ignore pattern also matches them.
2. History: commits reachable from `HEAD` and all locally available refs, including tags. Record
   the ref-to-object inventory and commit scope. Reject shallow history, unavailable required
   objects, or failed enumeration. Do not claim to inspect unfetched remote refs, reflogs, or
   unreachable deleted objects, and do not fetch or rewrite history automatically.

Both scopes must pass. Use pinned rules and fully redacted scanner output. Persist only approved
finding metadata such as rule ID, repository-relative path, line, commit, and opaque finding ID;
never persist matched source lines, secret values, or snippets. Wrapper errors, tool stderr, raw
reports, process traces, and compact agent context must also satisfy this rule. Sanitize before
capture or persistence, not merely before displaying a final summary.

Private ignored environment files and generated reports are outside candidate-file scope; document
this limitation rather than claiming to inspect the whole workstation. Reject escapes from the
declared workspace. Detect inline Gitleaks allow directives as prohibited suppression, and do not
load a user/global ignore file that changes the checked-in policy.

An actual leaked credential requires owner-led revocation or rotation. Deleting the source line
does not resolve a finding in reachable history. No agent automatically rotates credentials,
rewrites history, or adds a baseline. Narrow demonstrably synthetic test fixtures may have a
protected rule-and-location exception with reason and regression coverage; real secrets may not
be baselined merely to produce green.

## SCA contract

Scan the candidate-root `pnpm-lock.yaml` explicitly, including all importers and resolved production,
development, optional, and transitive package versions. Record lockfile and manifest digests,
scanner version, actual package inventory, advisory response identity, and scan time. Validate that
the pinned scanner handles the installed pnpm lockfile format before adopting it.

Use online advisory lookup for release verification. An unavailable service, partial response,
unrecognized lockfile, unsupported registry package, malformed advisory, missing package identity,
or empty package inventory blocks. Workspace/link references must resolve to declared local
importers and their dependencies; report them separately rather than pretending they are registry
packages. Do not silently drop unsupported Git, URL, or other dependency forms.

Require zero known vulnerabilities across the complete registry-package inventory. Deduplicate
advisory aliases for reporting without losing affected package/version relationships. Do not
automatically suppress a finding based on reachability analysis, missing severity, development-only
usage, or absence of an available fix. Do not add a vulnerability baseline in this increment.

The SCA gate never updates package.json or the lockfile. Dependency remediation belongs to an
explicit owner task because those files are outside bundled agent write authority. A later scan
may change outcome when the advisory database changes even if code has not changed; deterministic
planning does not make external advisory data immutable. Disclose registry package names/versions
sent to the advisory service; never forward registry credentials or source files.

## Evidence, output, and cleanup

Extend existing quality adapters and summaries rather than introducing a generic plugin framework.
For each new check, validate versioned machine evidence against the expected invocation, tool and
configuration identities, analyzed scope, input digests, native exit status, and output digests.
Record subscan commands and results in a versioned gate-specific report where a single summary
command cannot represent both secret scans. Architecture receives a validated report even though
its parent workflow stage remains quick.

Missing, stale, partial, contradictory, truncated, malformed, or outside-workspace evidence blocks.
Freshness must use invocation identity and input digests in addition to timestamps. Zero findings
is valid only with proven nonempty scope and successful complete execution. Compare input scope
before and after analysis; a scanner must not validate an earlier or different candidate.

Full machine reports must not be parsed from truncated process stdout. Read bounded-size report
files or stream them safely, and reject oversize reports explicitly. Existing trace and compact
failure-context limits remain unchanged. Native scanner messages are untrusted data.

Create temporary paths only under `<project-root>/tmp/codex-<task>/`, with exclusive per-invocation
ownership, and clean them on success, failure, cancellation, and setup errors. Never delete
pre-existing task paths. Durable sanitized evidence may remain under the existing owned ignored
`reports/quality/` directory; use owner-only file permissions and atomic replacement for new
reports. No cache reuse may satisfy a required fresh release scan.

## Configuration compatibility and rework

Extend the strict partial quality schema with boolean `secrets`, `lint`, and `sca` properties.
They default to false for absent and legacy partial configuration. The original six properties
retain their existing defaults. This deliberate compatibility choice prevents existing consumers
from unexpectedly requiring new external binaries and services.

Opted-in stages follow the nine-stage delivery order. Both shipped complete packs enable all nine
stages; the repository's full command always requires all nine independently of a consumer's
partial configuration. Document the difference between repository delivery policy and consumer
workflow selection. `architecture` is not a new partial switch: it remains part of quick.
Reject unknown keys, non-boolean values, and malformed complete configurations as before.

Disabled stages and unused profiles are removed. Pass edges reconnect to the next enabled stage;
repair returns to the first enabled stage. With all stages disabled, implementation goes directly
to passed, preserving the explicit consumer-policy behavior. Only include reachable repair and
blocked-terminal nodes. Preserve complete version 1 custom graphs exactly as supplied.

| Failed stage | Built-in/simple `onFailed` | Swarm Forge `onFailed` |
| --- | --- | --- |
| lint | Implementer repair | Cleaner rework |
| quick, including architecture | Implementer repair | Implementer rework |
| coverage, crap, knip | Implementer repair | Cleaner rework |
| mutation, sonar | Implementer repair | Hardener rework |
| secrets, sca | Explicit blocked terminal | Explicit blocked terminal |

Secrets and SCA failures block conservatively because remediation can require credential rotation,
history decisions, or protected dependency changes. Preserve sanitized gate evidence in the trace;
the terminal transition must not erase the failed gate's identity. No agent is dispatched for those
failures, including scanner operational failures. Resumption after owner remediation is a new run.

Each writing rework step retains two visits. Configure stage visit limits to permit the initial
pass plus every allowed preceding owner-rework cycle: three for simple, seven for Swarm Forge.
This prevents a shared stage's old three-visit limit from accidentally preempting independent
owner budgets. A terminal blocker or exhausted owner budget still prevents downstream execution.

## Independent SAST decision

Produce `docs/quality/sast-decision.md` during implementation. Assess CodeQL JS/TS
`security-extended` against the current Sonar profile and this controller's process, path,
configuration-evaluation, and credential boundaries. Record licensing prerequisites, supported
local platforms, pinned query-pack strategy, estimated operational cost, and how SARIF findings
would become a fail-closed result. Public availability of queries does not imply unrestricted use
of the CLI on private code.

If existing entitlement permits a trial, use synthetic vulnerable and safe fixtures and record
actual outcomes. Otherwise record that no trial ran and the exact prerequisite. Do not procure a
license or upload project code as part of this increment. The decision must recommend adoption,
deferral, or an explicitly justified alternative such as Semgrep, with limitations. It is a
required decision artifact, not a silently skipped SAST gate or a claim of independent SAST coverage.

## Verification and acceptance scenarios

Deterministic tests use fake processes, synthetic secrets, local Git fixtures, and injected
advisory responses. They must not depend on live credentials, model calls, or network services.

| Scenario | Required evidence |
| --- | --- |
| Full happy path | All nine stages execute once in order and reach passed |
| Legacy configuration | Absent and old partial configurations still expand to the original six stages |
| Opt-in and disabling | New keys are strict booleans; mixed and all-disabled graphs have correct reachable edges |
| Typed lint | Unsafe promise and unsafe-value fixtures fail; corrected fixtures pass; parser/coverage failures block |
| Architecture | Nested imports, aliases, re-exports, type cycles, bare built-ins, computed imports, and unresolved edges are exercised |
| Secret scopes | Staged, unstaged, untracked, deleted historical secrets, tags, shallow history, and missing objects are exercised |
| Redaction | Synthetic secret bytes appear nowhere in persisted reports, traces, errors, or provider prompts |
| SCA scope | Direct/dev/transitive/optional dependencies, local importers, unsupported formats, absent severity, and advisory aliases are exercised |
| Advisory outage | No green fallback or stale-report reuse; explicit blocker before coverage |
| Evidence failures | Missing/old/wrong-workspace/partial/oversize reports and contradictory zero exits reject a pass |
| Tool failures | Missing/wrong-version binaries, spawn errors, timeouts, signals, and malformed output are exercised |
| Candidate stability | A zero-exit gate that changes candidate paths blocks; owned ignored reports remain allowed |
| Repair success | One-time lint failure selects the configured writer and restarts at the first enabled stage |
| Owner budgets | Multiple owner repairs can cross shared stages without premature stage exhaustion; persistent owner failure terminates |
| Owner intervention | Secrets/SCA failure selects blocked directly, without a writer or downstream gate |
| Authority | Policy edits after a writing step block; suppression comments cannot weaken scanning |
| Cleanup | Success, failure, and cancellation remove only invocation-owned temporary paths |

Run real pinned-tool fixture checks in addition to parser unit tests, demonstrating both a failing
fixture and its corrected form. These fixtures must remain task-isolated and must never contain real
credentials. Run the actual repository gates, complete non-incremental mutation, and approved real
Sonar before claiming implementation completion. A fake scan is never release evidence.

## Implementation sequence and deliverables

1. Verify compatible versions, native-tool installation, and existing release blockers. Record
   exact selections and commands without changing existing thresholds.
2. Implement typed lint and resolved architecture checks with fixture-based evidence validation.
3. Implement redacted two-scope secrets scanning and complete lockfile SCA with bounded I/O.
4. Integrate scripts, strict partial configuration, both workflow packs, repair budgets, and docs.
   Align prompt digests only if owned prompt contents actually change.
5. Deliver the SAST decision, real tool acceptance results, and the full delivery-chain evidence.

Expected changes include quality adapters and tests, protected tool configurations and manifest,
package.json and pnpm-lock.yaml, the architecture script, quality runner, partial schema and
expansion, both workflow packs, README, AGENTS.md's documented delivery order, and STATUS.md.
Do not introduce a new runtime action, trace protocol, role, or generic tool plugin abstraction.

The latest recorded baseline on 2026-09-03 failed mutation with 15 Survived and one Timeout; a
standalone Sonar scan failed authentication with HTTP 401. These remain historical unresolved
release blockers until fresh evidence supersedes them. New checks must not hide them or reduce
thresholds. Record any blocker requiring owner action exactly.

## Non-goals and completion

No mandatory CodeQL gate, package publication checks, additional duplication scanner, formatting
campaign, automatic dependency repair, vulnerability baselines, credential rotation, Git history
rewrites, remote CI provisioning, concurrency, daemon, or managed worktrees is included.

Implementation is complete only when the specified checks and compatibility behavior exist, all
acceptance scenarios pass, the SAST decision is delivered, and the real nine-stage full command
exits zero with current evidence. A missing credential, unresolved finding, incompatible tool, or
failed release gate leaves implementation incomplete with an exact blocker. Specification delivery
alone must remain labeled planned; it does not imply a new full-chain or real Codex smoke pass.

## Primary tool references

Consulted for design on 2026-09-08; exact implementation versions must be recorded separately.

- [typescript-eslint typed configurations](https://typescript-eslint.io/users/configs/)
- [typescript-eslint compatibility](https://typescript-eslint.io/users/dependency-versions/)
- [Oxlint type-aware requirements](https://oxc.rs/docs/guide/usage/linter/type-aware)
- [dependency-cruiser rules and dependency analysis](https://github.com/sverweij/dependency-cruiser)
- [Gitleaks file/history scans and redaction](https://github.com/gitleaks/gitleaks)
- [OSV-Scanner supported lockfiles](https://google.github.io/osv-scanner/supported-languages-and-lockfiles/)
- [OSV-Scanner usage](https://google.github.io/osv-scanner/usage/)
- [CodeQL CLI availability](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-cli)
- [CodeQL JavaScript/TypeScript queries](https://docs.github.com/en/code-security/reference/code-scanning/codeql/codeql-queries/javascript-typescript-built-in-queries)
