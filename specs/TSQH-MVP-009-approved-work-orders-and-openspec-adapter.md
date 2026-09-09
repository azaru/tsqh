---
id: TSQH-MVP-009
status: planned
risk: high
depends_on: TSQH-MVP-008
---

# Approved work orders and OpenSpec adapter

## Value and release boundary

Accept an already reviewed specification as an immutable execution assignment, execute it under
trusted local workflow policy, and return requirement-linked evidence for the exact candidate.
OpenSpec owns specification authoring and evolution. TSQH owns execution, permissions, configured
transitions, bounded repair, native verification, and the execution result.

This is the planned increment after MVP-008. It does not activate itself, implement MVP-008, or
resolve existing release blockers. MVP-001 through MVP-008 remain normative except for the explicit
changes below. The local specification is authoritative; sibling design documents provide rationale
without importing their runtime, milestone, APIs, or evidence DAG.

The first adapter uses a project-local OpenSpec schema. The runtime contract is independent of
OpenSpec: another producer can create the same valid bundle without installing OpenSpec. Do not
fork the OpenSpec product, embed its workflow engine in the planner, or introduce a plugin framework.

## Scope and ownership

| Concern | Owner and decision |
| --- | --- |
| Intent, clarification, requirements, acceptance, design | Specification layer and its reviewer |
| Approval | Explicit local operator action over exact content |
| Work-order format and input validation | Producer-neutral TSQH boundary |
| Export from OpenSpec | Narrow preparation adapter, outside the execution loop |
| Roles, providers, commands, permissions, gates, repair | Trusted local complete workflow configuration |
| Requirement evidence | Configured native evidence producer, validated by TSQH |
| Candidate result | Controller-owned durable result, independent of agent prose |
| Integration and canonical spec updates | Operator-owned follow-up; automatic merge/archive deferred |

Preserve one foreground run, one action at a time, and one caller-supplied clean Git worktree.
No managed worktrees, crash-safe resume, daemon, concurrency, dynamic agent spawning, model-routing
changes, automatic integration, or remote approval service is introduced.

## Normative requirements

The requirements below use stable IDs. MUST means required for implementation completion. Unknown
properties, versions, references, evidence kinds, or unsupported obligations MUST fail closed.

### REQ-WO-001: Separate preparation from execution

Provide these public CLI surfaces, with normal human output and the existing `--json` convention:

```text
tsqh spec export --source openspec --root <project> --change <id> --output <new-bundle>
tsqh spec validate --bundle <bundle>
tsqh spec approve --bundle <bundle> --reviewer <identity>
tsqh run --workspace <clean-worktree> --work-order <approved-bundle> [--config <config>]
```

`run` accepts exactly one of existing `--task` or new `--work-order`. Existing task-mode behavior
and configurations remain compatible. Work-order mode requires a complete configuration with the
work-order policy described below; absent configuration, a partial overlay, or a complete workflow
without that policy fails before agent or gate execution. Configuration discovery remains unchanged.

Export creates a new directory and refuses an existing destination. It generates no approval,
invokes no coding agent, runs no implementation/apply operation, and writes nothing in the source
OpenSpec tree. Validate is read-only. Approve is a separate explicit operator command; a review
file containing the word approved is never a substitute for that action.

Preparation failures return nonzero with stable error codes and artifact/ID locations, without
printing full artifact contents. No run trace is created for a rejected preflight. Once a run has
started, ordinary process, gate, authority, and exhaustion failures retain their existing semantics.

### REQ-WO-002: Define one strict, producer-neutral bundle

Use JSON for machine contracts and Markdown for authored documents. JSON reuses the existing Ajv
dependency and avoids adding a YAML parser to the runtime. OpenSpec continues to own its schema
YAML. Ship strict JSON schemas for the work order, approval, evidence report, and execution result.

The bundle contains `work-order.json`, `artifacts/`, and, only after explicit approval,
`approval.json`. No executable configuration or producer plugin is loaded from the bundle.
The work-order object has exactly these required properties:

| Property | Contract |
| --- | --- |
| `schemaVersion` | Integer `1` |
| `changeId` | Nonempty bounded slug identifying the requested change |
| `source` | `{ kind, reference }`; provenance strings, never executable or fetchable authority |
| `target` | `{ repositoryId, baseCommit, objectFormat }`; project-policy identity, full commit ID, `sha1` or `sha256` |
| `risk` | `low`, `normal`, or `high`; descriptive, with no transition authority |
| `artifacts` | Nonempty array of `{ id, kind, path, sha256 }` |
| `requirements` | Nonempty array of `{ id, artifactId, heading, acceptanceIds }` |
| `acceptance` | Nonempty array of `{ id, artifactId, heading, evidenceKeys }` |
| `constraints` | Array of `{ id, artifactId, heading, evidenceKeys }` |
| `reviewArtifactId` | Reference to the single review artifact |

Artifact kinds are `proposal`, `specs`, `constraints`, `acceptance`, `design`, `validation`,
`review`, and optional `research`. Require exactly one of each kind except `specs` (one or more)
and `research` (zero or one). Empty constraints are explicit in the required constraints document.
Require an entry for every changed normative requirement, acceptance criterion, and constraint in
the authoring documents. Unchanged requirements in copied baseline context are not indexed. The
machine index is a checked projection, not a second normative text.

IDs use `[A-Za-z][A-Za-z0-9_-]{0,127}`. Requirement, acceptance, and constraint IDs must be globally
unique within their combined index; artifact IDs are unique within the artifact array. Evidence
keys use the same syntax and may be shared. Each requirement has at least one acceptance ID;
each acceptance item and each constraint has at least one evidence key. Every acceptance item
must be referenced by a requirement. All document headings must resolve exactly once. Reject
duplicate array references, dangling references, duplicate JSON keys, and contradictory indexes.

`heading` is the exact Markdown heading text without its leading heading markers. Authoring
templates use an ID-prefixed heading, such as `REQ-AUTH-001: Reject invalid credentials`, so
renaming descriptive text cannot silently create a second identity. Parse the documented heading
and requirement structure; do not count apparent headings inside fenced code examples.

Limits: 1 MiB each for machine JSON files, 256 KiB per Markdown artifact, 2 MiB total authored
artifact bytes, 64 artifacts, and 1,000 total indexed requirements/acceptance/constraints. Text
must be valid UTF-8 without NUL. Reject oversize input rather than truncate an approved assignment.
Schema string limits must bound every field: IDs as above, headings at 256 characters, repository
identity at 128, source reference at 512, and paths at 512. Digests are lowercase hexadecimal.

For version 1, all bundle paths are concrete POSIX relative paths beneath `artifacts/`. Reject
absolute paths, empty segments, dot segments, backslashes, symlinks, non-regular files, duplicate
paths, case-insensitive collisions, and files not listed by the manifest. Globs and network URLs
cannot identify artifact content. Permit only the two known top-level JSON files and listed
artifact files; approval may be absent for validation of an unapproved bundle.

### REQ-WO-003: Bind review and approval to immutable bytes

Each artifact digest is SHA-256 of its exact bytes. The bundle digest is SHA-256 of the UTF-8
canonical JSON serialization of `work-order.json`: recursively sort object keys by code-unit
order, preserve array order, serialize JSON scalars using JSON.stringify semantics, and emit no
whitespace. Reject non-JSON values before hashing. Shared test vectors must pin this algorithm.
Artifact digests inside the manifest bind the entire authored content transitively.

The manifest contains neither its own digest nor an approval digest. `approval.json` contains
exactly `{ schemaVersion: 1, bundleDigest, reviewer, approvedAt }`, where reviewer is a nonempty
identity of at most 128 characters and approvedAt is a UTC RFC 3339 timestamp. Approval metadata
does not change the bundle digest. It is a local operator assertion, not a cryptographic identity
proof; signatures, revocation services, and hostile same-account protection are out of scope.

Approve first validates all documents and the review decision, then atomically creates approval
without replacing an existing file. It must display/return the digest, change identity, base commit,
and reviewer. Editing any artifact or manifest field requires a newly exported and approved bundle.
Timestamps alone cannot establish approval or freshness.

The review template includes exactly one fenced JSON block under the exact heading `Review decision`,
with `decision` (`approved` or
`changes-requested`), `reviewer`, and `unresolvedQuestions` (an array). Validation requires an
approved decision and an empty question list before approval or execution. The operator approving
the bundle need not be the semantic reviewer; preserve both identities. Validation checks required
sections and references but must not claim to prove absence of ambiguity or semantic correctness.
The reviewer owns those judgments, including contradictions between requirements and design.

### REQ-WO-004: Validate target and preserve input integrity

Before creating a run, require a clean candidate with HEAD equal to target.baseCommit and matching
Git object format. Complete configuration supplies `workOrderPolicy.repositoryId`, which must
equal target.repositoryId. This is an explicit local project identity, not a Git remote URL and
not a globally authenticated repository identity. Support offline operation without fetching.

The adapter records the preparation root's HEAD as baseCommit and verifies it has not changed
during export. Uncommitted authored OpenSpec files may be exported because their exact bytes are
captured; this does not claim that arbitrary uncommitted implementation changes are in the base.
Document the intended sequence: finish preparation, export outside the candidate, approve, then
execute against a clean checkout of the recorded base.

Bundle and runs root must be outside the candidate. Reject overlaps between input bundle and run
output. After validation, copy the approved bundle into the controller-owned run directory using
exclusive creation, restrictive permissions, and atomic publication. Hash during copying and
revalidate the copy; a changed source during materialization blocks before the first dispatch.
The immutable run copy is the assignment source thereafter. Later changes to the external original
do not change an active run, but make that external bundle fail subsequent validation if inconsistent.

Capture resolved workflow/configuration and prompt digests at preflight. Recheck protected policy,
prompts, and the run's approved input snapshot before and after external steps and before completion.
Mutation or inspection failure blocks. This extends cooperative local-process integrity checks;
it is not OS sandboxing against hostile processes running as the same user.

### REQ-WO-005: Keep policy authority local

Add one optional `workOrderPolicy` object to complete version 1 configurations only. It contains
exactly `repositoryId`, `requiredGateStepIds`, and `evidenceBindings`. The first is the identity
above; the second is a nonempty unique list of native gate step IDs. The third is a nonempty map
from evidence key to `{ gateStepId, reportPath }`. Report paths are normalized candidate-relative
paths in explicitly owned ignored quality-report directories, with no escapes or symlinks.
Extend existing report ownership declarations as needed; a path string alone cannot claim ownership.

All references must resolve to native gates. Every binding's gate is in requiredGateStepIds.
The configured graph must pass validation proving no reachable path to a passed terminal bypasses
a required gate. A failed required gate cannot reach passed without subsequently passing that gate.
Cycles retain existing finite visit limits. Reject unverifiable or incompatible policy before run
creation. Do not silently add nodes, change pass/failure edges, or reorder a supplied graph.

Every requested evidence key must resolve in local policy. The work order cannot supply command
arguments, environment keys, providers, model choices, role permissions, workflow identifiers,
repair budgets, required-gate replacements, or completion switches. These properties are rejected,
not treated as suggestions. Descriptive risk does not choose a workflow in this increment.

Bundle constraints state implementation obligations. They cannot relax configured architecture
boundaries, authorize dependency changes, add suppression exceptions, or widen allowed paths.
An incompatible obligation blocks preparation or preflight when mechanically detectable; a semantic
conflict discovered during execution is an explicit blocker requiring a new approved assignment.

Bundled work-order policy must require every MVP-008 delivery gate in its exact order:

```text
secrets -> lint -> quick -> sca -> coverage -> crap -> knip -> mutation -> sonar
```

Preserve all thresholds, report validation, native exit semantics, and owner-routed repair. A
consumer's explicit custom complete policy remains distinct from repository release policy; the
work-order document cannot weaken either. No planner branches on a tool name or OpenSpec artifact.

### REQ-WO-006: Provide a reproducible OpenSpec authoring adapter

Ship the project-local schema `openspec/schemas/swarmforge-ts/` with its templates and setup guide.
Do not migrate historical `specs/TSQH-MVP-001` through `009` or change the authoritative spec root
of this repository as a side effect. Demonstrate the schema in isolated fixture projects.

The required artifact dependency graph is:

```text
proposal -> specs, constraints
specs -> acceptance
specs + constraints -> design
acceptance + design + constraints -> validation
proposal + specs + constraints + acceptance + design + validation -> review
review + all required inputs -> handoff
```

Keep the exact artifact ID `specs` and OpenSpec's supported delta syntax. Requirements retain
`ADDED`, `MODIFIED`, `REMOVED`, and `RENAMED` semantics and stable requirement IDs. A removal
requires acceptance evidence proving the removed behavior/compatibility obligation; a rename
preserves the ID and records old/new headings. Never quietly invent a new ID for modified behavior.

Research is optional: export includes it only when explicitly present, and review then includes it
in its reviewed inputs. No required dependency may make missing optional research block every
change. `handoff` is an authored machine index of the requirements, acceptance, and constraints;
it is not an approval or executable workflow. Export constructs the final strict manifest and
content digests from it, rejecting omitted or invented indexed items.

Define `handoff` as `handoff.json`, with exactly `schemaVersion: 1`, `changeId`, `repositoryId`,
`risk`, `requirements`, `acceptance`, and `constraints`. Its three index arrays use the bundle
shapes above. Repository identity is checked again against execution policy; the authored value
does not authorize a target. Export obtains artifact paths from the pinned schema's concrete CLI
outputs and emits stable artifact IDs equal to kind for singleton documents, `delta_<capability>`
for delta specs, and `baseline_<capability>` for existing canonical specs. Capability names must
satisfy the remaining artifact-ID length/character limits. Reject collisions rather than rename
them implicitly. Review covers the requirement/acceptance/evidence relationships in the authored
validation document. Handoff is their mechanical projection after review; export verifies that it
introduces no new obligation or relationship. The validated index is incorporated into
work-order.json; handoff.json is not an extra unlisted bundle artifact.

Templates require: proposal value/scope/non-goals/breaking changes; normative requirements with
scenarios, edge cases, error behavior and observability (or justified not-applicable statements);
architecture constraints; observable Given/When/Then acceptance; design decisions; validation
evidence keys; and semantic review decisions with unresolved questions. Acceptance derives from
requirements, so a design cannot define its own success criterion.

Export must include sufficient canonical context to interpret deltas without consulting mutable
OpenSpec state during execution. Copy the affected existing canonical specs as additional `specs`
artifacts, retaining their exact bytes and distinguishing baseline from delta by artifact ID.
A new capability explicitly states in its delta document that no prior canonical spec exists. Resolve modified,
removed, and renamed requirements against the copied baseline; missing/ambiguous targets block.
Index changed requirements only; baseline requirements remain contextual unless explicitly changed.

Pin a compatible OpenSpec release and CLI JSON response contract during implementation. Access it
only from the preparation adapter using fixed executable/argument arrays, explicit root/change,
bounded output, finite timeout, and no forwarded credentials. Reject missing tools, wrong versions,
nonzero exits, malformed/partial JSON, unexpected paths, schema mismatch, or changed source inputs.
Use the CLI's concrete `specs` artifact outputs; never guess other artifacts are delta specs.
No OpenSpec binary, parser, or network access is needed to validate or run an already exported bundle.

Use a schema fork, not a source-code fork. Do not dispatch OpenSpec apply, standard implementation
tasks, sync, or archive from TSQH. Verify experimentally that the pinned schema and preparation
commands work without a mandatory standard `tasks.md`; document the exact setup and command trace.
If the chosen release cannot support this boundary, record an implementation blocker rather than
adding a second execution engine.

### REQ-WO-007: Deliver complete approved context to every agent

Every work-order assignment identifies bundle digest, change ID, target base, requirement IDs,
and exact paths to the immutable run copy. Supply the manifest and an explicit ordered artifact
reading list. Artifacts may be read from that snapshot; do not depend on a previous agent's prose
to carry requirements forward or inline/truncate the entire bundle into the existing handoff.
Verify provider access to that snapshot before execution; an inaccessible input is a blocker.

Label document content and previous-agent output as untrusted task data under local policy.
Instructions embedded in examples cannot select transitions, skip gates, or change permissions.
Agents may plan implementation steps internally but may not rewrite the approved contract.
Clarification that changes behavior requires stopping and preparing a new bundle, not silently
editing tests or interpreting an unresolved question as permission.

The bundled Swarm Forge execution pack removes specifier and its unused prompt/role, becoming
`implementer -> cleaner -> architect -> hardener -> qa` followed by the MVP-008 gate chain.
Update its manifest, provenance adaptation notes, references, and digests consistently. Preserve
the other roles' read/write authority, configured repair owners, models, efforts, and finite budgets.
The generic runtime continues to accept a custom role named specifier. The simple pack retains its
single implementation owner. Both packs document task-mode and approved-work-order invocation.

Do not introduce conditional specialist selection in this increment. Implementation decomposition
belongs to the execution assignment; it does not create a new persistent task scheduling subsystem.

### REQ-WO-008: Collect evidence tied to the candidate and invocation

An evidence key describes an obligation such as `unit-auth`, `acceptance-auth`, or `architecture`.
It is not a test filename or proof by itself. The validation document explains what each key must
demonstrate. Concrete tests and reports are linked after implementation by a native producer.

For bound gates, the controller supplies a versioned request on stdin containing run ID, step ID,
visit, bundle digest, candidate digest, and the requested acceptance/constraint IDs grouped by key.
This is a controller-generated protocol, not a configuration interpolation or extra environment
variable. Legacy gates without evidence bindings retain their current stdin behavior. Ship a
documented native wrapper example that consumes the request and produces the strict report.

The report has exactly `schemaVersion: 1`, `runId`, `stepId`, `visit`, `bundleDigest`,
`candidateDigest`, and `checks`. Each check has `subjectId`, `evidenceKey`, `status` (`passed` or
`failed`), and a nonempty `artifacts` array of `{ path, sha256, selector }`. Paths reference owned
ignored report files; selector is a nonempty bounded test/scenario/rule identifier inside that
report. Report and referenced evidence combined are limited to 16 MiB, 1,000 checks, and 128
artifacts per check; use bounded reads. Reject duplicates, unknown subjects, missing requested
pairs, mismatched identities, invalid selectors, missing files, and digest mismatches.

The configured native wrapper is trusted project policy and must validate the referenced tool's
actual report, including selector existence and pass status. TSQH validates the common envelope
and content binding; it does not pretend a generic JSON link proves arbitrary behavioral semantics.
Evidence producers and their validation policy must be outside writer authority. Agents can add
implementation/tests within their allowed paths but cannot write accepted quality reports as proof.
Before each bound gate, remove only that gate's owned previous report through the existing report
ownership mechanism. Require new output from that invocation even after a zero exit.

Candidate digest means SHA-256 of a canonical inventory of all tracked and non-ignored untracked
candidate paths, including normalized path, file type/mode, and content digest or symlink target.
Reject unresolved Git inventory or unsupported file types. Include tracked paths even if ignored;
exclude only untracked ignored outputs. Record deletions by their absence relative to the pinned
base. Pin inventory ordering and encoding with test vectors. This identifies uncommitted code;
HEAD alone is not a candidate identity.

Nonzero native exit never passes even if a report says passed. Missing/malformed/stale/contradictory
reports block and cannot enter ordinary repair. A valid report with failed checks and nonzero
native exit follows the configured gate-failure edge. Failed checks with zero native exit are
contradictory and block. Existing spawn, timeout, signal, and candidate-mutation blockers take
precedence. Persist bounded sanitized diagnostics through MVP-007 without reading machine reports
from truncated stdout.

Every writing agent dispatch invalidates previously accumulated gate and requirement evidence,
even if its diff is empty. A new candidate digest also invalidates prior evidence. Before passed,
all required gates and requested evidence pairs must have fresh passing outcomes after the latest
writer, for the final candidate. No inferred pass, partial coverage, timestamp-only freshness,
or prior-run cache can satisfy completion.

### REQ-WO-009: Make completion fail closed and export a durable result

Add a pure work-order completion predicate over validated policy, reduced current gate outcomes,
and validated evidence facts. At a configured passed terminal, the planner may finish passed only
when that predicate succeeds; otherwise it selects blocked with a precise missing/stale-evidence
diagnostic. This is an explicit terminal admissibility constraint, not an adapter-selected edge.
Task mode retains existing terminal behavior. No role name, evidence-key name, or producer name
is hard-coded in transition logic.

Persist work-order identity, candidate identity, gate visits, and evidence facts in versioned
controller-owned records before terminal publication. Preserve existing version 1 trace reading
for historical runs; new work-order records must have a separately versioned strict schema and
must not silently change the shape of existing events. `status --json` must expose the recorded
work-order result and distinguish a missing/incomplete result from passed. Never reconstruct
authoritative completion from mutable workspace reports or agent output.

Atomically write `execution-result.json` in the run directory, with exactly these required fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `runId`, `changeId`, `bundleDigest` | Exact assignment/run identity |
| `repositoryId`, `baseCommit`, `candidateDigest`, `policyDigest` | Subject and resolved policy identity |
| `outcome` | `passed` or `blocked` |
| `integrationStatus` | Always `not-performed` in this increment |
| `gates` | Required gate IDs, visits, outcomes, candidate identities and durable evidence references |
| `requirements` | REQ-to-AC links, statuses, and accepted evidence references |
| `constraints` | Constraint statuses and accepted evidence references |
| `blocker` | Exact `{ code, message, stepId }` or null only for passed |

For blocked runs, absent evidence is represented explicitly as missing, never as passed. A
candidate inspection failure uses null candidateDigest with the corresponding blocker. Copy
accepted report evidence into the run store before publication so it remains available after a
later gate replaces workspace reports. Revalidate copied hashes. Failure to persist required
evidence or the final result prevents a successful CLI exit and successful status claim.

The implementation must fully specify and schema-test the nested gate/status/reference shapes;
they carry only the identities and facts above, not arbitrary unvalidated JSON. Stable errors must
distinguish at least input-invalid, approval-missing, approval-mismatch, target-mismatch,
policy-incompatible, input-mutated, evidence-invalid, evidence-incomplete, and result-write-failed,
while retaining existing process and authority blocker codes.

### REQ-WO-010: Reconcile without premature canonical updates

The result is evidence of a tested candidate, not an integration receipt. Deliver an operator
reconciliation guide showing how to inspect requirement coverage and carry the result into a
separate integration decision. It must require verifying that the incorporated implementation
matches the validated candidate before updating canonical specifications.

Do not execute sync/archive merely because all gates passed. A changed integration candidate
requires new verification; spec drift requires new review/approval. Failed or partially evidenced
runs cannot be reconciled as implemented. OpenSpec remains responsible for its documented
canonical/delta merge and historical archive semantics; automatic integration verification and
archive receipts are deferred.

## Acceptance and verification matrix

Each scenario requires behavioral tests using fake processes, temporary Git repositories, and
synthetic native reports. Keep domain tests independent of filesystem, clocks, providers and I/O.

| Acceptance ID | Requirements | Scenario and expected evidence |
| --- | --- | --- |
| AC-WO-001 | 001, 002 | Export creates a standalone bundle; execution works with OpenSpec unavailable |
| AC-WO-002 | 001 | Missing/both input flags, unsupported config, and existing export destination fail before dispatch |
| AC-WO-003 | 002 | Unknown fields, duplicate keys/IDs, dangling headings, empty evidence, invalid UTF-8 and every size boundary reject |
| AC-WO-004 | 002, 004 | Traversal, symlinks, path collisions, unlisted files and overlapping roots reject without outside writes |
| AC-WO-005 | 003 | Semantic review approved but no operator approval blocks; changes-requested/questions also block |
| AC-WO-006 | 003 | Canonical hash vectors are stable across object-key ordering and change with any semantic manifest/artifact edit |
| AC-WO-007 | 003, 004 | Wrong approval digest/base/repository/object format and dirty candidate reject before a run |
| AC-WO-008 | 004, 007 | Copy race or protected-input mutation blocks; later external-source edit cannot change the run snapshot |
| AC-WO-009 | 005 | Unknown evidence keys and graphs bypassing required gates reject; task-mode policy remains compatible |
| AC-WO-010 | 005, 007 | Prompt injection and attempted policy/report writes cannot alter task, authority, gates or transition order |
| AC-WO-011 | 006 | Added/modified/removed/renamed deltas export with sufficient baseline context and stable IDs |
| AC-WO-012 | 006 | Optional research omitted/present works; missing baseline, malformed CLI JSON, version/spawn/timeout failures block |
| AC-WO-013 | 007 | Swarm Forge starts at implementer, preserves specialists/rework ownership, and delivers approved context on every dispatch |
| AC-WO-014 | 008 | Native wrapper reports actual test selectors; report identities, content hashes and complete requested pairs validate |
| AC-WO-015 | 008 | Zero exit with missing/failed evidence, stale/replayed/partial reports, forged selectors and candidate mutation block |
| AC-WO-016 | 008, 009 | Valid failed gate repairs through its owner; every required gate/evidence pair reruns after the writer |
| AC-WO-017 | 008, 009 | Empty-diff writer still invalidates evidence; persistent failure exhausts its budget without downstream success |
| AC-WO-018 | 009 | All gates green with missing acceptance evidence cannot finish passed; blockers survive status/reload |
| AC-WO-019 | 009 | Result/evidence-copy failure never returns success; old trace reading remains compatible |
| AC-WO-020 | 009, 010 | Passed result retains readable REQ-to-AC evidence after workspace report replacement and reports not-performed integration |
| AC-WO-021 | 001, 010 | No preparation/execution command calls OpenSpec apply/sync/archive or updates canonical specs |
| AC-WO-022 | 001–010 | Success, failure, cancellation and setup failure clean only invocation-owned temporary paths |

Required demonstration traces:

```text
export -> validate -> explicit approval -> preflight -> immutable input snapshot
  -> implementer -> cleaner -> architect -> hardener -> qa
  -> secrets -> lint -> quick -> sca -> coverage -> crap -> knip -> mutation -> sonar
  -> completion validation -> passed result (integration not performed)

native failure with valid failed evidence -> configured owner rework
  -> all required verification again -> complete current evidence -> passed result

approved input changed -> preflight rejected -> zero agent/gate dispatches
all native gates green + missing acceptance evidence -> blocked result
```

Traces above are required future behavior, not evidence that this specification delivery ran them.
Use fake providers for deterministic coverage. Run a real pinned OpenSpec export/approval fixture
and a real native test-report wrapper fixture. Record exact commands and outputs. A real Codex
smoke is separately identified and is never implied by these fixtures or by the full quality suite.

## Implementation sequence and deliverables

1. Complete/activate the prerequisite increment through the normal local status process. Record
   existing release blockers without relabeling historical evidence as current success.
2. Implement strict producer-neutral schemas, canonical hashing, bounded bundle validation,
   approval and target validation, with fixture and negative-path coverage.
3. Deliver the pinned OpenSpec schema/templates and preparation adapter with real CLI fixtures.
4. Add immutable assignment materialization, local work-order policy validation, and agent context.
5. Add bound native evidence protocol, invalidation, pure terminal validation, durable result/status
   support, and backward-compatible trace reading.
6. Update both packs, remove bundled execution specifier, preserve provenance, and deliver setup,
   producer-contract, native evidence-wrapper and operator reconciliation documentation.
7. Run targeted tests, `pnpm quality:quick` after coherent changes, and the complete MVP-008
   `pnpm quality:full` chain with current real evidence before claiming implementation complete.

Expected files include schemas, domain predicates/types, application orchestration, filesystem/Git
and OpenSpec adapters, CLI commands, tests, OpenSpec templates, workflow packs, README and STATUS.
Prefer built-ins and explicit modules; any new development dependency must be pinned with pnpm in
the single lockfile. OpenSpec is a preparation tool, never an execution runtime dependency.

All implementation/fixture artifacts remain English. Temporary paths and redirected tool scratch
space belong under `<project-root>/tmp/codex-<task>/` with exclusive ownership and cleanup on all
exit paths. Durable run evidence is preserved in the configured run store. Never delete existing
temporary paths, start unrelated services, expose credentials, or modify the sibling repository.

Completion requires every acceptance scenario, the real preparation/evidence fixtures, compatible
legacy behavior, and a zero-exit real full delivery chain. Unresolved mutation findings, rejected
Sonar authentication, missing tools or failed evidence validation remain exact blockers. A drafted
specification or fake-provider trace does not establish implementation completion.

## References and assumptions

Reviewed on 2026-09-08. Online main-branch documentation is design evidence, not a pinned release
contract. Implementation must record the exact OpenSpec release and prove the used CLI behavior.

- [OpenSpec customization and artifact dependencies](https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md)
- [OpenSpec canonical specs, deltas and archive](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)
- [Local MVP-008 prerequisite](TSQH-MVP-008-static-analysis-and-security-guardrails.md)
- [Local MVP-007 repair ownership](TSQH-MVP-007-compact-gate-failure-context-and-owned-rework.md)
- [Swarm Forge adaptation provenance](../workflows/swarm-forge/PROVENANCE.md)

The custom DAG organizes authoring dependencies; artifact existence is not semantic approval.
OpenSpec templates supply guidance, while TSQH's independent validation and explicit local approval
establish the execution boundary. No capability ranking of alternative spec frameworks is a
normative requirement of this increment.
