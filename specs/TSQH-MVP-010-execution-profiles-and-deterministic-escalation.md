---
id: TSQH-MVP-010
status: planned
risk: high
depends_on: TSQH-MVP-009
---

# Execution profiles and deterministic escalation

## Value and scope

Execute the same approved work order with different amounts of agent specialization while keeping
the same native quality policy, acceptance obligations, and final independent QA. Start from an
explicitly selected local profile and activate additional configured specialists only on validated
failure facts. The controller retains transition authority throughout the run.

This is a planned successor to MVP-009, after MVP-008. Creating this document does not activate or
implement any of those increments. Local specifications remain authoritative; external designs do
not import concurrency, managed worktrees, recovery, merge, or provisional APIs.

This increment explicitly extends MVP-009's fixed specialist workflow and MVP-008's single
onFailed edge for opted-in gates. It preserves the approved work-order format and approval rules.
Model capability labels are hypotheses to evaluate, not a built-in model ranking. More agents
are not assumed to improve quality, and fewer agents do not reduce the required evidence.

## Product decisions

| Concern | Decision |
| --- | --- |
| Profile selection | Explicit trusted complete configuration selected before execution |
| Bundled profiles | compact, reviewed, specialized |
| Model assignment | Existing provider/role/step selection from MVP-006 |
| Conditional specialists | Predeclared sequential graph branches with finite visits |
| Routing input | Validated structured native failure classification; no stdout heuristics |
| Planner agent | Optional read-only implementation decomposition after approval |
| Architecture specialist | Read-only diagnosis; authorized implementation owner repairs |
| QA | Fresh read-only semantic review after all required native gates |
| Release policy | Identical full gate chain and thresholds across bundled profiles |
| Evaluation | Paired task/profile measurements; no automatic profile promotion |

No runtime agent spawning policy, peer communication, concurrent actions, dynamic permission
changes, model capability detector, automatic risk classifier, or generic workflow expression
language is introduced. External processes still use executable-plus-argument arrays, shell:false,
bounded execution, and existing environment isolation.

## Normative requirements

### REQ-EP-001: Select and freeze one execution profile

Use the existing complete configuration and `--config`/discovery surfaces. Ship three complete
configurations under `workflows/swarm-forge/profiles/`: `compact.json`, `reviewed.json`, and
`specialized.json`. Do not add a second profile-selection CLI flag, runtime registry, or automatic
model-name matching. Each file must resolve its owned prompts within the existing configuration-root
containment rules; update pack layout, manifests and provenance accordingly.

Add an optional `executionPolicy` object to complete version 1 configuration, with exactly:

- `profileId`: bounded ID using the existing identifier grammar;
- `acceptedRiskLevels`: nonempty unique subset of low, normal, high;
- `requiredReviewStepIds`: nonempty unique list of configured semantic review steps.

All bundled profiles opt in and require approved-work-order mode. Task-mode and legacy complete
workflows without executionPolicy keep their existing behavior. Partial configuration cannot carry
this object. With executionPolicy present, missing workOrderPolicy or `--task` input rejects before
run creation. Reject unknown fields and references as usual.

The operator chooses the profile and model assignments using task needs, approved risk, and measured
results. Preflight compares the approved work-order risk against acceptedRiskLevels and blocks a
mismatch; it never silently switches profiles. Bundled examples accept all three risk levels so
they make no unsupported capability assertion; deployment guidance explains how to narrow them.

Freeze profile ID, resolved graph, provider/role/step model and effort values, prompts, and policy
digests before dispatch. Changing configuration mid-run blocks under MVP-009 integrity rules.
Changing profile after a blocked run requires a new run and fresh verification. No writer, reviewer,
work-order field, or model output can replace the selected profile or grant new authority.

### REQ-EP-002: Supply three base workflows with equal obligations

The initial successful paths are:

| Profile | Initial agent path before native gates | Final step after native gates |
| --- | --- | --- |
| compact | implementer | qa |
| reviewed | implementer -> technical-review | qa |
| specialized | planner -> implementer -> cleaner -> architect -> hardener | qa |

The technical-review role combines architecture and hardening review, with no write permission.
Architect, planner and QA also remain read-only. Implementer, cleaner and hardener retain the
bundled src/ and test/ writing prefixes and their distinct responsibilities. Diagnostic specialist
branches are available in compact even though they do not run on its happy path.

Every profile runs the same mandatory native chain:

```text
secrets -> lint -> quick -> coverage -> crap -> knip -> mutation -> sonar
```

Preserve MVP-008's exact order, coverage targets, CRAP limit, zero Knip findings, all-runnable-mutants
killed policy with CompileError reported separately, and approved Sonar gate. Architecture remains
inside quick, without a duplicate top-level architecture gate. Preserve all MVP-009 evidence keys,
bindings, input identity, report validation, candidate stability, and completion checks.

Add a pack consistency check comparing normalized required gate order, executable/arguments,
environment allowlists, timeouts, evidence bindings, owned report configuration, and quality policy
digests across the three examples. Ignore profile-specific roles and repair edges only. Equal gate
names with different commands or weaker validators must fail that check. Consumer customization is
explicit local policy and must not be represented as the unchanged bundled standard.

Keep the existing simple pack and the legacy Swarm Forge workflow callable. Document the three new
profiles as the opt-in execution-policy surface; do not silently switch existing callers. There is
no six-stage minimum and no claim that one named model family always requires a particular profile.

### REQ-EP-003: Limit the planner to derived implementation guidance

The planner reads the complete immutable approved bundle and produces bounded guidance identifying
implementation order, likely files, architecture boundaries, acceptance-to-test strategy, and
uncertainties. It uses the existing sanitized successful-agent handoff, not a new authoritative task
database. Its result can be empty or truncated under existing limits; every subsequent agent still
receives the full approved input manifest and reading list.

The planner cannot author new acceptance criteria, change IDs, relax constraints, choose roles,
select model/effort, widen allowed paths, or turn an unresolved product decision into an assumption.
Its proposed test filenames are advisory. Detectable contract conflicts block; semantic questions
requiring changed behavior require a new approved bundle. Calling this role planner does not give
it the deterministic planner's authority. No specifier is restored to the execution profiles.

### REQ-EP-004: Route only validated native failure facts

Add an optional `failureRouting` object to native gate steps, with exactly `reportPath` and
`onClassifiedFailure`. The latter is a nonempty map from bounded classification ID to target step
ID. The existing onFailed edge remains required and serves only as the fallback for a valid
unmapped classification. Reject invalid or unreachable targets and unbounded cycles.
For version 1, allow at most 32 classification entries per gate; maps use exact case-sensitive
identifier matching with no patterns, precedence rules, predicates or executable expressions.

The report path uses MVP-009's protected, owned, ignored candidate-relative report rules. Failure
reports are at most 64 KiB of strict UTF-8 JSON, reject duplicate/unknown keys, and contain exactly:
`schemaVersion:1`, `runId`, `stepId`, `visit`, `bundleDigest`, `candidateDigest`, `policyDigest`,
`outcome`, and `failureClass`. Outcome is passed or failed. Passed requires failureClass:null;
failed requires one bounded classification ID. It must agree with the native exit status.

For opted-in gates, extend the controller-generated stdin request from MVP-009 with policyDigest;
version the extended request as version 2 while preserving version 1 handling for unchanged gates.
Routing-only gates receive the same version 2 identity envelope with an empty evidence request list.
The native wrapper reports a classification from its own validated subcheck result. It cannot
report a target step, role name, permission, retry count, or pass override. Interpretation of the
classification-to-edge map is pure controller planning over validated facts.

Require a fresh report on success as well as failure. Remove only owned prior reports before the
invocation and bind output to the current request. Missing, stale, oversize, malformed, contradictory
or unauthorized evidence blocks; it does not select onFailed. A valid unknown classification uses
onFailed. Record whether routing used an exact match or that fallback.

Existing spawn errors, timeouts, signals, protected-input changes and candidate mutations block
before ordinary classified routing. Preserve MVP-009 requirement-evidence validation: failure
classification cannot rescue invalid acceptance evidence. Gates without failureRouting keep their
existing native outcome and onFailed semantics. No classification is inferred from stderr text,
agent prose, exit-code folklore, or a passed report for another candidate.

### REQ-EP-005: Expose quick subcheck failures without changing its quality contract

The quick wrapper emits one validated classification identifying the first failed subcheck in
MVP-008's existing order: typecheck, build, architecture, tests. These are native-wrapper data;
the generic planner contains none of those names. A success reports passed/null. The wrapper must
validate any required subcheck evidence before emitting its classification. An operational failure
or evidence-validation failure that cannot prove a normal subcheck finding reports no acceptable
classification and therefore blocks the opted-in routed gate.

Do not run downstream subchecks to collect a preferred classification after fail-fast termination.
Do not split architecture into a duplicate workflow gate, replace typecheck/build/tests, or parse
human log messages to discover the failure. Bind the report to the same candidate and invocation
as quick. The `quick` profile retains its usable native exit behavior without requiring a controller
stdin request; routing report production is enabled only by the explicit protocol.

### REQ-EP-006: Escalate through bounded, preconfigured repair branches

All targets exist and validate before the run. Bundled profiles use this routing policy:

| Failed gate or review | compact / reviewed | specialized |
| --- | --- | --- |
| quick: architecture | architecture-diagnosis -> implementation-rework | architecture-diagnosis -> implementation-rework |
| quick: typecheck/build/tests or valid unmapped class | implementation-rework | implementation-rework |
| lint, coverage, crap, knip | implementation-rework | cleanup-rework |
| mutation, sonar | hardening-rework | hardening-rework |
| secrets | blocked | blocked |
| technical-review or architect: changes-requested | implementation-rework | implementation-rework |
| qa: changes-requested | implementation-rework | implementation-rework |

Architecture-diagnosis uses the existing read-only architect role and a separate diagnostic step.
It does not write code and does not masquerade as an approval review. It reports actionable
findings through bounded handoff; the implementation owner repairs. Hardening-rework uses the
authorized hardener writer. A compact run can therefore activate a specialist absent from its base
path, with unchanged configured authority. No persistent enlarged team is created.
Assignments explicitly identify diagnostic versus semantic-review mode, and the shared architect
prompt documents both output contracts. A diagnostic response never creates an accepted review.

Every repair writer returns to the beginning of the full native chain. Required QA then runs again.
Initial technical-review and architect reviews provide early design feedback; they are not final
completion approvals and need not repeat after every repair. QA covers the final candidate's
requirements, architecture and hardening concerns using the same required rubric in all profiles.

Preserve the triggering failure across a read-only diagnostic step: the repair assignment gets
the original bounded GateFailureContext plus the latest diagnostic handoff, both source-labeled
and untrusted. This explicitly extends MVP-007's omission of prior handoff for gate-driven repair:
only the diagnosis associated with that exact triggering gate visit may accompany its context.
Unrelated old success output must not be reintroduced. Keep existing per-artifact/context limits.

Each repair writer step has maxVisits:2. Compact/reviewed have two repair writers, so shared native
stages and final QA allow five visits. Specialized has three, so they allow seven. Initial agents
allow one visit; architecture-diagnosis allows two, matching its following implementation-rework
budget. No repair counter resets after passing a gate or switching concern.

Before dispatching a diagnostic branch, check the remaining visit budget of its statically known
following repair writer. If exhausted, block immediately rather than spend another diagnostic
call. Express this dependency with optional agent-step `requiresRemainingVisitsAt`, a reference
to a writing agent step; it is checked by the pure planner, never supplied by a report. Reject
cycles in these budget dependencies and references to non-writing or missing steps.

Graph validation must account for every new classified and review-rejection edge, required gates,
terminal reachability, and finite budgets. A failed QA must not find a path to passed without
repair, full gates, and fresh QA. No writer can follow accepted final QA and reach passed without
revalidation. Runtime completion checks provide a second defense against stale facts.

### REQ-EP-007: Make semantic review outcomes explicit and candidate-bound

Add optional `review` to an agent step with exactly `onChangesRequested`, a target step ID.
The existing onCompleted edge means accepted only for this opted-in step. Its role must have empty
write authority; review and requiresRemainingVisitsAt may not coexist on one step. Agent steps
without review retain their existing completion semantics.

Review assignments include a controller-generated request with schemaVersion:1, runId, stepId,
visit, bundleDigest, candidateDigest, policyDigest, and sorted IDs of requirements and constraints
to review. Provider invocation remains the same generic command mechanism. Require a new provider
invocation with no resumed implementation conversation. That is context separation, not a claim
of independent model errors; the same provider/model may be used if local policy chooses it.

For a review step only, stdout must be one strict JSON object with exactly those request identity
fields plus `decision`, `coveredIds`, and `findings`. Decision is accepted or changes-requested;
coveredIds must equal the requested ID set. Each finding contains exactly `id`, `subjectIds`,
`path`, `message`, and `requestedChange`. Subject IDs must exist, path is a contained candidate
path or null for cross-cutting findings, and the two text fields are bounded to 2 KiB each. Require
unique bounded finding IDs, at most 32 findings, and a total report size within existing 64 KiB
stdout capture. Truncated stdout, duplicate keys or unknown properties block. Accepted requires
zero findings; changes-requested requires at least one. Nonzero process exit always blocks even
with a valid review decision. Stderr remains bounded diagnostic output and cannot select an edge.

The controller validates the envelope, coverage and candidate stability; it does not claim to
mechanically prove the review's semantic correctness. Each reviewer must independently inspect the
approved artifacts, final code/diff and available native evidence. A coder's summary is advisory.
The common QA rubric requires checking observable acceptance, errors/edge cases, architecture
constraints, and whether tests actually demonstrate the specified behavior.

Changes-requested is a completed semantic review outcome, not a native gate failure. The planner
selects its configured onChangesRequested target and forwards the bounded findings as untrusted
repair context. Malformed output or process failure cannot enter that branch. Keep native failures
and semantic review rejection distinct in trace and reporting.

Every writer dispatch, including an empty diff, invalidates all prior semantic approvals as well
as native/requirement evidence. Candidate or approved-input identity changes also invalidate them.
Completion requires fresh accepted decisions from executionPolicy.requiredReviewStepIds for the
final candidate after the latest writer and after all required native gates have passed. The
bundled list contains only qa. A stale, missing or rejected review blocks terminal success even
if all native gates remain green.

### REQ-EP-008: Preserve auditable profile, routing and review results

Extend MVP-009's controller-owned records using strict new schema versions; keep historical trace
and result readers compatible. Do not add undeclared fields to existing version 1 schemas.
Execution-policy runs publish execution-result schemaVersion:2: all version 1 result fields plus
`execution`, containing exactly profileId, configurationDigest, routingDecisions and reviews.

Each routing decision records stepId, visit, validated report digest, failureClass, match kind
(exact/fallback), selected target and remaining target budget. Each review records stepId, visit,
role/provider/model/effort identity, candidate and bundle digests, decision, invalidation state,
and a path/digest reference to its durable sanitized report. Absent model/effort is recorded as
unspecified, not guessed from provider output. Diagnostic budget rejection records its blocker
even when no additional agent was dispatched.
Remaining target budget means that target step's configured maxVisits minus consumed visits;
terminal targets use null. Diagnostic entries additionally identify the required following writer
and its remaining budget so an exhausted writer cannot be hidden by available diagnostic visits.

`status --json` exposes selected profile, current branch, consumed/remaining visits, and current
QA validity from durable facts. An incomplete or corrupt record never reconstructs success from
mutable workspace reports. Report-persistence failure prevents successful publication as in
MVP-009. IntegrationStatus remains not-performed; archive and merge remain out of scope.

### REQ-EP-009: Evaluate profiles without inferring model superiority

Deliver a reproducible evaluation manifest and reporting command that aggregates completed runs
without launching agents, changing profiles, or altering policy. The manifest pins task/bundle,
base, quality-policy identity, profile/configuration digest, provider/model/effort settings, run
references, and repetition number. Compare profiles on the same approved task and clean base.

Report acceptance success, blocker categories, first-pass success, repair/diagnostic counts,
budget exhaustion, wall time, and any independently recorded defects discovered after completion.
Report token/cost data only when observed from a documented source, with currency/pricing version
where applicable; missing usage/cost and unmeasured later defects are unknown, never zero. Include
failed runs in totals. Keep runtime timestamps and cost outside deterministic planning identity.

Provide fixtures covering local changes, boundary changes, and hardening-sensitive changes, with
at least three paired repetitions per task/profile in the documented real evaluation protocol.
Use separate clean candidates and report distributions, not a single best run. Deterministic fake
provider runs validate the aggregation logic but establish no model performance claim. Real model
benchmark campaigns are operator-initiated and are not launched automatically by this increment.

The implementation deliverable is the harness, fixtures and honest measurement contract. No real
benchmark is required to claim the mechanism implemented, but no profile may be described as cheaper,
safer or better for a model tier without supporting runs. Acceptance/evidence obligations remain
identical even when a measured profile uses fewer handoffs.

## Acceptance matrix

| Acceptance ID | Requirements | Required behavioral demonstration |
| --- | --- | --- |
| AC-EP-001 | 001 | Explicit profile selection is frozen; unknown policy/risk/config or task-mode input rejects before dispatch |
| AC-EP-002 | 001, 002 | Existing task and complete workflows preserve behavior; partial policy extensions reject |
| AC-EP-003 | 002 | Three happy paths have exactly their intended initial roles, full identical gates, then accepted QA |
| AC-EP-004 | 002 | Changed thresholds, commands, evidence bindings or environment in one bundled profile fail consistency validation |
| AC-EP-005 | 003 | Planner cannot write; misleading/truncated planning context never changes approved requirements or transitions |
| AC-EP-006 | 004 | Exact classified edge and valid unmapped fallback route deterministically; agent prose cannot choose either |
| AC-EP-007 | 004, 005 | Missing/stale/oversize/contradictory reports and process/candidate failures block without a repair dispatch |
| AC-EP-008 | 005 | Quick reports the actual first failed subcheck, retains order and stops without a second architecture invocation |
| AC-EP-009 | 006 | Compact architecture failure dispatches read-only diagnosis, then writer, full gates and QA |
| AC-EP-010 | 006 | Mutation activates hardener in compact; secrets block without activating a writer |
| AC-EP-011 | 006 | Repair receives its exact triggering failure and associated diagnosis, excluding unrelated old handoffs |
| AC-EP-012 | 006 | Mixed repair concerns respect five/seven stage visits; exhausted writer blocks before extra diagnosis |
| AC-EP-013 | 006 | Classified/review/budget dependency graph errors reject, including paths bypassing gates or final QA |
| AC-EP-014 | 007 | Valid accepted review completes; changes-requested selects configured writer and repeats full verification |
| AC-EP-015 | 007 | Nonzero reviewer exit, truncated/malformed JSON, wrong candidate, incomplete IDs or unauthorized writes block |
| AC-EP-016 | 007 | Empty-diff repair invalidates QA; stale accepted review cannot complete a changed candidate |
| AC-EP-017 | 007 | QA receives fresh invocation context and independently accessible approved artifacts/native evidence |
| AC-EP-018 | 008 | Result/status preserve profile, exact routing/budgets and QA validity across reload; legacy records still load |
| AC-EP-019 | 008 | Failed durable publication never claims success; original bundle cannot change active run input |
| AC-EP-020 | 009 | Aggregation includes failed runs, rejects mismatched pairs and reports missing cost/defect data as unknown |
| AC-EP-021 | 001–009 | Success/failure/cancellation cleanup removes only task-owned temporary paths and preserves durable evidence |

Required future workflow traces:

```text
compact: implementer -> all native gates -> qa(accepted) -> passed
reviewed: implementer -> technical-review(accepted) -> all native gates -> qa(accepted) -> passed
specialized: planner -> implementer -> cleaner -> architect(accepted) -> hardener
  -> all native gates -> qa(accepted) -> passed

compact: quick(failed:architecture) -> architecture-diagnosis -> implementation-rework
  -> secrets -> lint -> quick -> coverage -> crap -> knip -> mutation -> sonar
  -> qa(accepted) -> passed

qa(changes-requested) -> implementation-rework -> all native gates -> qa(accepted) -> passed
repair budget exhausted -> blocked (no additional diagnosis or downstream success)
```

These are acceptance targets, not claims of execution during specification delivery. Test ordinary
agent failures, command-spawn errors, invalid configuration, routing order, one-time repair success,
persistent failure exhaustion, unauthorized changes, and stale evidence with deterministic fixtures.
Exercise the real quick wrapper protocol with failing and corrected synthetic subcheck fixtures.
Do not weaken production policy to manufacture fixture success.

## Implementation and completion

1. Complete the prerequisites and activate this increment through the local status process.
2. Add strict optional policy/step schemas, pure routing/review/budget semantics and graph validation.
3. Implement native classification requests/reports and quick subcheck reporting with integrity checks.
4. Implement candidate-bound semantic review, diagnostic failure context and approval invalidation.
5. Deliver three complete profiles, protected prompts/manifests, consistency validation and docs.
6. Add durable result/status versions, evaluation manifest/reporting fixtures, and compatibility tests.
7. Record targeted-test results and exact current evidence generated by the selected workflow
   before claiming implementation complete.

Expected changes include domain planning/reduction, application dispatch, native/report adapters,
strict schemas, CLI status, quality wrappers, workflow pack content, tests, docs, README and STATUS.
Keep the approved work-order and OpenSpec adapter contract unchanged. Use pnpm exclusively, pin any
necessary dependency, and prefer existing modules and Node built-ins over framework infrastructure.

Temporary data and tool scratch space must use exclusively owned paths under
`<project-root>/tmp/codex-<task>/` and be removed after success, failure, cancellation or setup error.
Do not remove pre-existing temporary files or quality reports. Preserve configured durable run
evidence. Keep all repository artifacts English.

Completion requires all acceptance scenarios, real native-wrapper fixtures, legacy compatibility,
profile policy equivalence, and a successful real full chain with current evidence. Existing mutation
and Sonar blockers remain blockers until fresh evidence resolves them. No real Codex smoke or model
benchmark is claimed unless it actually runs and is recorded with its exact scope and outcome.

## Local design references

- [MVP-009 approved inputs and candidate-bound evidence](TSQH-MVP-009-approved-work-orders-and-openspec-adapter.md)
- [MVP-008 native gates and owner intervention](TSQH-MVP-008-static-analysis-and-security-guardrails.md)
- [MVP-007 failure context and repair ownership](TSQH-MVP-007-compact-gate-failure-context-and-owned-rework.md)
- [MVP-006 provider-aware selection](TSQH-MVP-006-provider-aware-agent-selection.md)
