---
id: TSQH-MVP-002
status: complete
risk: high
---

# Fail-closed quality hardening and adapted role catalog

> Completed on 2026-08-25. The final non-incremental report contains 3,951 mutants across 25 files:
> 2,890 runnable mutants were `Killed`, 1,061 checker-rejected mutants were `CompileError`, and no
> other status occurred. Real Sonar analysis `32bbda2f-8b39-48de-a572-e905813f81cb` reported the
> dedicated project's computed gate `OK` with zero open issues. The exact configured
> `quick -> coverage -> crap -> knip -> mutation -> sonar` chain exited zero.

## Value

TSQH must prove more than compilation and a green unit suite. Its delivery gate must reject weak,
missing, stale, malformed, or externally red quality evidence. Projects using TSQH should also have
a reusable set of focused agent roles without inheriting another orchestrator's transition protocol.

This increment adds explicit coverage, CRAP, mutation, unused-code, dependency, and Sonar gates. It
also adds original English prompt adaptations informed by several Swarm Forge branches. The TSQH
controller remains the only transition authority.

## Relationship to version 0

`TSQH-MVP-001` is complete and remains the normative contract for controller behavior. This
specification is a local hardening increment. It may add quality configuration, report validators,
tests, prompt content, and example workflow data, but it must not add role-specific branches to the
controller or import provisional APIs from `../tsqh-orchestrator`.

## Scope

The increment owns:

- fresh Vitest coverage for all production TypeScript;
- strict `@azaru/tscrap` analysis;
- Stryker mutation testing with machine-readable evidence;
- Knip unused-file, unused-export, and dependency analysis;
- Sonar analysis that waits for the server-computed quality gate;
- the existing TypeScript, build, test, and domain architecture checks;
- one fail-fast `quality:full` composition with no silent skips;
- separate native quality profiles in the example workflow;
- a versioned, provenance-documented catalog of Swarm Forge-inspired role prompts;
- deterministic tests of the local wrappers and evidence validators.

## Approval and runtime prerequisites

The approved dependency budget contains this exact, mutually compatible pinned set:

```text
@vitest/coverage-v8@4.1.11
@azaru/tscrap@0.1.2
@stryker-mutator/core@10.0.0
@stryker-mutator/vitest-runner@10.0.0
@stryker-mutator/typescript-checker@10.0.0
@sonar/scan@5.0.0
knip@6.32.2
```

All Stryker packages must use exactly the same version. The implementation must record the approved
versions and must not substitute floating ranges. Because the proposed tools require it, update the
declared runtime to Node.js `>=22.12.0` after dependency approval.

Sonar additionally requires an explicitly provisioned project, server URL, token, assigned quality
profile, assigned quality gate, and new-code definition. Repository work must not create a remote
project, change a remote quality gate, open a port, start a container, or persist credentials without
separate human authority.

## Required command surface

Package scripts must expose these stable commands:

```text
quality:quick       strict typecheck -> build -> Vitest -> architecture
quality:coverage    replace coverage output -> Vitest with coverage thresholds -> validate reports
quality:crap        validate fresh coverage -> @azaru/tscrap -> validate JSON report
quality:knip        Knip full project analysis
quality:mutation    clean mutation output -> Stryker -> validate JSON report
quality:sonar       validate environment -> scanner -> wait for computed quality gate
quality:full        quick -> coverage -> crap -> knip -> mutation -> sonar
```

Commands are sequential and fail fast. `quality:full` must contain every listed stage and must not
have a local mode that is reported as equivalent to the full gate. Individual scripts remain useful
for diagnosis, but only a real exit-zero `pnpm quality:full` is full delivery evidence.

No script may use `|| true`, `--no-exit-code`, warning-only fallbacks, cached/baseline evidence for a
delivery pass, or environment-dependent omission. A missing executable, report, credential, server
response, or required field is a failure.

Each report-producing wrapper must also write a versioned summary beneath `reports/quality/` with
the gate id, installed tool versions, sanitized executable and argument array, analyzed scope,
thresholds, input and output report SHA-256 digests, native
process facts, final `passed`/`failed`/`blocked` status, and an exact reason. The summary must agree
with the underlying report and process status. Missing, stale, malformed, contradictory, or
secret-bearing summaries fail. The controller may retain this output as evidence but does not parse
it to select a transition.

## Coverage contract

`quality:coverage` must remove or replace its owned `coverage/` output, run the complete deterministic
Vitest suite once with the V8 provider, and produce both:

- `coverage/coverage-final.json` for `@azaru/tscrap`;
- `coverage/lcov.info` for Sonar.

The initial global minimum is 90 percent for lines, statements, functions, and branches. The domain
layer minimum is 100 percent for the same four measures. Threshold reductions, source exclusions,
and coverage-provider changes require an explicit specification update; they must not be used to
make an otherwise red run green.

The validator must reject missing, empty, malformed, stale, partial, or path-ambiguous reports and
must prove that every executable production source file is represented. Declaration-only files may
be excluded only by documented deterministic discovery rules.

## CRAP contract

Run the pinned local binary with this policy:

```text
tscrap --src src \
  --coverage coverage/coverage-final.json \
  --threshold 6 \
  --format json \
  --output reports/quality/crap.json
```

The threshold of 6 is the adopted Swarm Forge hardening bar, stricter than the package default of 8.
The same `quality:full` invocation must have refreshed and validated coverage before CRAP runs.

Exit 0 is necessary but not sufficient. The generated report must be current, nonempty, parseable,
have `schemaVersion: 1`, `status: "passed"`, `passed: true`, threshold 6, zero violations, at least
one production file, and at least one executable unit. Exit 1 means invalid or incomplete evidence;
exit 2 means a threshold violation. Either fails the gate unchanged.

No baseline or broad source exclusion is permitted. A necessary generated-file exclusion must be
named narrowly, justified in this specification, and covered by an independent generation check.

## Mutation contract

Stryker must mutate production TypeScript under `src/**/*.ts`, exclude declaration files and test
artifacts, use the Vitest runner, use the TypeScript checker with the production `tsconfig.json`, and
run non-incrementally for delivery. The configuration must explicitly set:

- the three pinned Stryker plugins;
- `testRunner: "vitest"`;
- TypeScript checking;
- `vitest.related: false`, unless deterministic tests prove a narrower selection is complete;
- clear-text, progress, and JSON reporters;
- an owned JSON report path beneath `reports/mutation/`;
- explicit high, low, and break thresholds rather than Stryker's non-failing default break value;
- a bounded worker count and bounded timeouts suitable for this repository.

The delivery policy is zero survived and zero uncovered runnable mutants. The TypeScript checker
must remain enabled. Its `CompileError` result means that a generated mutation is type-invalid and
therefore never became a runnable mutant; it is not a killed mutant and is excluded from the
runnable mutation-score denominator, consistently with Stryker's own metric. The report validator
must inventory and report these checker rejections separately, require a nonempty `statusReason`
for each one, require at least one runnable mutant, and accept the report only when every runnable
mutant is `Killed`. It must reject `Survived`, `NoCoverage`, `Ignored`, `RuntimeError`, `Timeout`,
`TestFailure`, pending, unknown, or malformed statuses. Consequently, the accepted runnable
mutation score is 100 percent. No `CompileError` may be relabelled as `Killed`, and no source
exclusion may be added merely to hide one. An equivalent runnable mutant remains an explicit
blocker until a human approves one narrow, documented mutation exclusion.

`quality:mutation` must clear its owned report directory before execution, propagate the Stryker
process status, and then validate that the JSON report was generated by the current run. Missing,
empty, stale, malformed, contradictory, or zero-mutant evidence fails even if Stryker exits zero.

## Knip contract

Knip must analyze the real CLI entry point and the complete TypeScript project. Its checked-in
configuration must explain the source, test, configuration, and script entry points rather than
silencing findings with broad ignores.

The gate must detect unused files, exports, exported types, dependencies, development dependencies,
unlisted dependencies, unresolved imports, duplicate exports, and incomplete configuration hints.
It must not use `--no-exit-code`, cache a delivery result, or hide current debt behind a baseline.

Production-only analysis is insufficient for the sole Knip gate because it omits tests,
configuration, scripts, and development dependencies. If production mode is retained as an
additional signal, the complete-project invocation remains mandatory. Any reported issue or
configuration hint fails until fixed or until one narrow, reasoned exception is added to this
specification.

## Sonar contract

The approved target for this increment is the local SonarQube service at
`http://127.0.0.1:9000`. Its identity is fixed by checked-in non-secret configuration:

- project key `azaru_tsqh_mvp`;
- quality gate `azaru-tsqh-mvp-strict`;
- TypeScript profile `azaru-tsqh-mvp-typescript`, inheriting `Sonar way`;
- project new-code definition `PREVIOUS_VERSION`;
- small-change exemption disabled.

`infra/sonar/compose.yaml` owns the reproducible local SonarQube/PostgreSQL service definition. It
may reuse the already-running `tsqh-sonar` Compose project. Credentials remain environment-only
and must never be copied into Git. Provisioning must be idempotent and scoped to the identities
above; it must not alter `azaru_tsqh` or any profile or gate assigned to another project.

The repository must contain non-secret Sonar configuration for `src/` as production, `test/` as
tests, UTF-8 source, and the current `coverage/lcov.info`. Generated `dist/`, coverage, report,
scanner-work, and Stryker temporary directories must not be indexed as source.

`quality:sonar` must require `SONAR_HOST_URL` and `SONAR_TOKEN`; it may require
`SONAR_ORGANIZATION` when the selected service does. It must use the locally pinned scanner, never
print or persist a token, and set:

```text
sonar.qualitygate.wait=true
sonar.qualitygate.timeout=300
sonar.qualitygate.ignoreSmallChanges=false
```

The configured remote policy must cover both new code and total code with, at minimum, zero open
issues, 100 percent reviewed security hotspots, at least 90 percent coverage, and no more than 3
percent duplicated lines. The project must have an explicit new-code definition and an assigned
TypeScript quality profile.

An upload or scanner exit zero without a computed `OK` quality-gate result is not success. The
validator must verify the complete configured gate definition through the Sonar policy API; it
must not assume that `project_status` repeats configured conditions for metrics that have no
computed value. It must likewise verify the project's explicit effective new-code definition
through the API response that carries its project or main-branch assignment. Missing
credentials, unreachable service, unassigned or malformed policy, absent LCOV import, timeout, red
gate, or unverifiable response must fail with a sanitized exact blocker. Tests must use controlled
fakes; automated repository tests must not require live network access.

## Example workflow contract

The example must expose the quality stages as independent native profiles and explicit workflow
steps in this order:

```text
implement -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed
```

Every failed gate points to one configured repair agent. A completed repair returns to `quick`, so
all earlier evidence is regenerated and every gate is rerun. Each cycle remains finite through
ordinary `maxVisits` values. No controller branch may know any quality tool or role name.

The example must use an adapted `implementer` prompt and a `repairer` prompt. Additional catalog
roles may be demonstrated only when their completion has unambiguous version 0 semantics. In
particular, no agent-authored `accepted`, `changes-requested`, or next-step field may control the
graph.

The composed assignment must show the writing role's resolved `allowedPathPrefixes`. A missing
allowed-path section gives the agent no write authority. This is assignment context only; Git path
validation after the process remains authoritative.

## Adapted prompt catalog

Create `prompts/swarm-forge-adapted/` with role prompts for:

- analyst;
- specifier;
- architect;
- implementer;
- cleaner;
- code reviewer;
- hardener;
- QA verifier;
- senior implementer;
- repairer.

The catalog must preserve useful role ownership, TDD, clean architecture, adversarial review,
coverage-before-CRAP, zero-survivor mutation, and independent QA ideas. Every prompt must instead
obey TSQH's local contracts:

- operate only on the supplied assignment and configured allowed path prefixes;
- never install dependencies or edit root policy/build/lock files unless the assignment explicitly
  authorizes that exact change;
- never commit, merge, create worktrees, run daemons, message peers, or invoke handoff scripts;
- never choose the next workflow step or claim that prose overrides a native gate;
- run only relevant installed commands, one at a time, and report exact evidence;
- treat missing tools, invalid evidence, contradictory specifications, or out-of-scope fixes as
  blockers;
- leave transition selection to the TSQH controller.

Do not carry over Swarm Forge-specific Babashka, Clojure, APS, Gherkin mutation, tmux, dashboard,
worktree, squad-leader, `git_handoff`, `swarm_handoff.sh`, `ready_for_next.sh`, or
`done_with_current.sh` instructions.

The catalog README, provenance file, and versioned `manifest.json` must map every adapted role to
its file, SHA-256 digest, dispatch posture, source branch, immutable commit, and source path. A
manifest digest mismatch fails catalog verification. Research covered these upstream heads:

```text
main         0b69a51ca154025087569e6f880ca24b0bce6f54
two-pack     f2791781b9070fc43c33d460f396f297447e5833
four-pack    83f819307e6258296f6c1934b583ba888346cb2f
six-pack     c8650d14becf6c33be537c75b6dacebccf965d4b
adversaries  7aa2f3a2691ed92e26a11be4481d7d5c8e2ff859
squad        b0d63d57a8f0c2e678c0449c16ee953132b9d306
```

No `LICENSE`, `COPYING`, or `NOTICE` file was present in the inspected upstream branches. Therefore
the repository must contain original paraphrased adaptations and attribution, not substantial
verbatim copies. Literal redistribution requires separate rights confirmation.

## Approved Swarm Forge Lite continuation

The user approved this bounded continuation on 2026-08-25. It preserves the useful common idea from
Swarm Forge `main`, `six-pack`, and `squad`: fresh agents with different responsibilities work on
one candidate in configured order, and a completed role can give the next role concise context.
The TSQH controller replaces the persistent leader and handoff daemon; one caller-supplied clean
worktree replaces per-role worktrees.

### Bounded role handoff

- After an agent exits successfully and its changed paths pass validation, its sanitized,
  already-bounded stdout becomes the most recent agent handoff.
- The next configured agent assignment receives the source step id, source visit, truncation flag,
  and handoff text in a separately labelled section. Empty output is represented explicitly.
- Gate steps do not erase the most recent completed-agent handoff. A blocked or nonzero agent never
  dispatches a downstream role and cannot produce a successful handoff.
- Handoff text is untrusted context. `passed`, `skip`, `nextStep`, tool output, or permission claims
  cannot change configured edges, visits, allowed paths, providers, gate outcomes, or terminal
  state. The controller does not parse semantic review decisions.
- Reuse the existing bounded process artifact and append-only trace. Do not add mailboxes, peer
  messaging, a daemon, a semantic result protocol, a content store, or a persistence migration.

### Candidate-stable gates

- Reuse the existing Git snapshot and path-fingerprint mechanism immediately before and after every
  native gate.
- A gate blocks if it changes any Git-visible candidate path, even when it exits zero. Configured
  ignored quality reports may still be regenerated.
- Git inspection failure before or after a gate blocks with an exact diagnostic.
- An ordinary nonzero gate that leaves the candidate unchanged continues to use its configured
  `onFailed` repair edge.
- A writing repair role remains path-scoped and returns to `quick`, so coverage, CRAP, Knip,
  mutation, and Sonar are regenerated in the existing exact order.
- Durable candidate digests, evidence DAGs, cache reuse, commit manifests, and crash recovery remain
  out of scope.

### Swarm Forge Lite example

Add one separate example pack rather than replacing the existing hardening example:

```text
implementer -> cleaner -> reviewer -> hardener -> qa
            -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed
```

- Use one candidate worktree, one configured provider, and a fresh process for every agent step.
- `implementer`, `cleaner`, and `hardener` may write only configured production and test paths.
- `reviewer` and `qa` are read-only by default through empty `allowedPathPrefixes`.
- Reviewer output reaches the hardener through the bounded handoff. QA output remains evidence;
  native gates decide pass or fail.
- Every native gate failure selects the existing bounded repairer. Repair returns to `quick` and
  preserves the complete chain, including mutation and Sonar.
- Use concise example-local prompts. Do not add a catalog resolver, duplicate upstream runtime
  scripts, or weaken prompt-path containment.

### Additional verification

Automated behavior tests must prove:

- successful, empty, and truncated handoffs with source identity;
- handoff preservation across an intervening gate;
- transition, pass, skip, and permission claims in handoff text have no authority;
- blocked or nonzero agents do not dispatch a recipient;
- an exit-zero gate that changes a tracked or untracked candidate path blocks;
- an unchanged nonzero gate still follows its configured repair edge;
- repair changes remain path-scoped and restart the complete quality chain at `quick`;
- the fake-provider Swarm Forge Lite trace executes every configured role and all six gates in order;
- persistent gate failure exhausts repair before downstream work;
- all existing version 0 and hardening tests preserve their intent.

This continuation adds no dependency, configuration-schema change, CLI command, trace-schema
migration, dynamic spawning, concurrency, leader agent, peer messaging, managed worktree, merge, or
approval system.

## Architecture and security

- Quality tools remain package scripts or explicit configured native profiles. They do not enter
  `src/domain` and do not alter pure planning.
- Local wrappers use Node.js built-ins, exact executable-plus-argument arrays, `shell: false`,
  bounded output, bounded timeouts, and injected adapters in deterministic tests.
- Report validation is fail-closed and independent from friendly console prose.
- Owned generated directories are `coverage/`, `reports/`, `.scannerwork/`, and `.stryker-tmp/`;
  ignore rules must not conceal source or configuration.
- Secrets are environment-only and redacted from commands, traces, reports, errors, and tests.
- Agents may not edit the workflow, quality policy, prompt catalog, package manifest, lockfile, or
  quality configuration to unblock their own ordinary implementation or repair run.

## Verification

Automated tests must prove at least:

- coverage threshold pass and failure, plus missing, stale, malformed, partial, and zero-source
  evidence;
- CRAP exit 0/1/2 propagation and strict JSON validation;
- mutation process failure, report absence, stale/malformed report, zero mutants, survivor,
  no-coverage/error status, and a real nonzero production mutant inventory;
- Knip's real entry point and complete-project scope, plus issue and configuration-hint failure;
- Sonar preflight failures, secret redaction, scanner failure, timeout, missing computed gate, red
  gate, absent coverage import, and controlled green response;
- the exact full-script order and fail-fast behavior;
- a multi-gate happy trace, a failure followed by repair and complete revalidation, and exhaustion
  before downstream work;
- prompt catalog completeness, forbidden Swarm Forge runtime vocabulary, provenance SHAs, and role
  prompt path resolution;
- the existing 36 controller tests continue to pass unchanged in intent.

Use deterministic fake executables, fixtures, and injected responses for failure-path tests. Run a
real local Stryker scan during delivery. Run real Sonar only against the explicitly approved target;
never fabricate or replace that result with a fake test.

## Required deliverable

- approved pinned development dependencies and one `pnpm-lock.yaml`;
- coverage, Stryker, Knip, and Sonar configuration;
- fail-closed report/preflight validators and their deterministic tests;
- individual quality scripts and one complete `quality:full` chain;
- an example workflow with separate native gates and bounded repair;
- the adapted prompt catalog and immutable provenance record;
- README, `GOAL.md`, `AGENTS.md`, and `STATUS.md` aligned with actual behavior;
- exact command, exit-status, test-total, workflow-trace, mutation, CRAP, Knip, coverage, and Sonar
  evidence.

## Non-goals

- controller concurrency, daemon mode, remote execution, managed worktrees, merge, or crash resume;
- role-specific transition logic or semantic decisions parsed from agent output;
- automatic dependency installation by agents;
- automatic creation, disclosure, or persistence of Sonar credentials;
- mutation of Sonar projects, profiles, or gates outside the dedicated MVP identities above;
- CI-provider configuration, Git hooks, public port exposure, or remote service provisioning;
- Gherkin/APS infrastructure or mutation, language-independent plugin systems, or Swarm Forge's
  orchestration protocol;
- weakening or baselining current findings to obtain green.

## Completion condition

This increment is complete only when the dependency set and Sonar target remain exactly as approved,
all required artifacts and deterministic tests exist, the adapted prompt catalog is provenance
complete, both examples exercise their configured roles and ordered gates with bounded repair, the
handoff and candidate-stability behaviors pass, a real non-incremental Stryker run has valid
100-percent runnable-mutant evidence with checker rejections reported separately, a real Sonar
scan reports the computed gate `OK`, and `pnpm quality:full` exits zero. A red gate is work to fix,
not permission to skip it, soften policy, or invent evidence.
