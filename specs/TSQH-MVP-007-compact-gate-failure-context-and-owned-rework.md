---
id: TSQH-MVP-007
status: complete
risk: high
---

# Compact gate failure context and owner-routed rework

## Value

A failed native gate supplies the next configured writing agent with enough deterministic evidence
to diagnose the failure without placing complete tool logs in the provider prompt. Rework remains a
configured, finite transition, but the Swarm Forge workflow routes it to the role that owns the
failed quality concern instead of introducing one universal product repair role.

## Relationship to completed increments

`TSQH-MVP-001` through `TSQH-MVP-006` remain normative for strict configuration, controller-owned
transitions, provider-neutral command execution, bounded process capture, candidate write
enforcement, fail-closed native gates, sequential execution, and finite visit budgets. This
increment changes the reduced context supplied after an ordinary native-gate failure and the
declarative repair edges in the bundled workflow packs. It does not let tool output, an agent, a
role name, or an upstream runtime select a transition.

## Upstream design conclusion

The current immutable branch heads inspected for this increment are:

- Swarm Forge `main` at `8e83a09a41a7970edf8107f074cc41c12b953a08`;
- `six-pack` at `c8650d14becf6c33be537c75b6dacebccf965d4b`;
- `squad` at `b0d63d57a8f0c2e678c0449c16ee953132b9d306`.

`main` supplies shared handoff infrastructure rather than a product repair role. `six-pack` makes
each role fix failures in the checks that role owns before handoff. `squad` also separates product
rework by authority: the hardener applies code-review recommendations, QA fixes issues within QA
scope, and the senior implementer applies architecture findings. Its persistent Troubleshooter
repairs swarm state, dead sessions, and blockers and is explicitly outside the product state
machine. Therefore TSQH must not cite that Troubleshooter as evidence for a generic code repairer.

TSQH keeps the useful principle—route rework to an authorized owner—while retaining its own static,
sequential graph and deterministic controller instead of importing persistent agents, peer
handoffs, dynamic spawning, worktree merging, or an operator repair plane.

## Gate failure context

The trace continues to record the existing bounded `ProcessArtifact`; there is no trace-schema
migration. Reduction derives a separate immutable `GateFailureContext` only from an ordinary failed
gate event.

For each standard stream, the context records:

- the bytes captured by the process adapter;
- the bytes included in the agent context;
- whether process capture was already truncated;
- whether context compaction truncated it further;
- a deterministic UTF-8-safe excerpt.

Each stream excerpt is limited to 8,192 UTF-8 bytes. When compaction is required, it retains both
the beginning and the end around an explicit omission marker because tool setup normally appears at
the beginning while the decisive failure summary normally appears at the end. The combined native
output inserted into a repair assignment is therefore at most 16,384 bytes, independent of the
process adapter's larger per-stream capture limit.

The prompt states every truncation fact. It never describes a compacted excerpt as complete. Full
machine reports and quality summaries remain in the candidate for selective inspection; they are
not copied into the initial provider prompt.

When a gate failure context exists, the assignment omits the previous successful agent handoff.
The exact task, current candidate, role instructions, write authority, and compact gate evidence
remain available, while a second potentially large and stale prose payload does not compete with
the failure evidence.

Passed gates never create a `GateFailureContext`. Blocked, timed-out, signalled, mutating, or
uninspectable gates retain the existing fail-closed blocker behavior and do not dispatch repair by
inference.

## Rework ownership policy

Complete user workflows retain their existing freedom to point each gate's `onFailed` edge at any
finite configured agent step. The planner and controller do not branch on gate ids or role ids.

The built-in and `workflows/simple/` policies have one writing role, so their bounded `repair` step
reuses `implementer`; there is no second generic repairer identity.

The Swarm Forge pack uses three explicit rework steps, all returning to `quick`:

```text
quick                         -> implementation-rework (implementer)
coverage | crap | knip        -> cleanup-rework        (cleaner)
mutation | sonar              -> hardening-rework      (hardener)
```

Each rework step has its own finite two-visit budget. Read-only specifier, architect, and QA roles
remain read-only and are not silently converted into repair writers. The existing writer-role path
allowlists remain unchanged.

## Security and architecture

- Context compaction is a deterministic domain operation over an already sanitized bounded process
  artifact; it performs no filesystem, Git, process, provider, clock, or network access.
- Raw tool output is untrusted evidence. It cannot change the task, role, provider, write authority,
  transitions, visit limits, or gate outcome.
- Context excerpts are byte bounded after UTF-8 encoding and never use provider-specific tokenizers.
- Quality reports remain machine evidence on disk. Agents inspect them selectively under their
  existing read access; report content gains no transition authority.
- Rework routing is ordinary validated workflow configuration. No planner branch knows `quick`,
  coverage, CRAP, Knip, mutation, Sonar, implementer, cleaner, or hardener.

## Verification

Automated tests must prove:

- passed and blocked gates do not create a failure context;
- an ordinary failed gate creates exact identity, exit, stream-size, and truncation facts;
- small output is preserved exactly;
- oversized ASCII and multibyte UTF-8 output stays within the per-stream bound and preserves both
  ends with the omission marker;
- repair prompts contain the compact excerpts and every truncation fact but not omitted middle
  content;
- gate-driven assignments omit the previous agent handoff;
- the built-in and simple workflows reuse the implementer for finite repair;
- the Swarm Forge gates route to the three configured owner-rework steps and restart at `quick`;
- persistent failures exhaust the relevant owner budget without starting downstream gates;
- provider selection, path authority, gate ordering, disabled-stage expansion, and candidate-stable
  gate behavior do not regress.

Tests use controlled process artifacts and fake command providers. They do not require a live model,
network access, or a real Sonar service except for the repository's required final quality chain.

## Required deliverable

- the strict `GateFailureContext` type and pure compaction implementation;
- reducer, prompt, controller, and trace-state integration without a trace migration;
- owner-routed built-in, simple, and Swarm Forge workflows and aligned prompts;
- updated immutable upstream provenance and digest validation;
- behavioral, configuration, prompt, and domain tests;
- aligned README and `STATUS.md` evidence;
- targeted, `quality:quick`, and `quality:full` verification.

## Non-goals

- a provider tokenizer or exact token accounting;
- LLM-generated log summaries;
- removal or weakening of native gates or their durable evidence;
- automatic parsing of every third-party diagnostic format in this increment;
- dynamic role selection, persistent workers, peer messaging, daemon recovery, concurrency, remote
  execution, or Swarm Forge's worktree/merge runtime;
- changing the 65,536-byte process capture bound or the successful-agent handoff bound.

## Completion condition

The increment is complete when deterministic tests demonstrate compact failure context and exact
owner-routed rework, both bundled packs contain no unused generic repairer role, the required full
quality chain exits zero, and `STATUS.md` records exact evidence or an exact blocker.

## Completion evidence — 2026-08-26

- Pure reduction derives a `GateFailureContext` only for an ordinary failed gate. Each sanitized
  stream retains a deterministic UTF-8-safe head and tail within 8,192 bytes and records captured,
  included, process-truncated, and context-truncated facts. Gate-driven prompts omit the previous
  successful-agent handoff.
- The built-in and simple policies reuse implementer at their bounded `repair` step. The Swarm
  Forge pack has no generic repairer: quick routes to implementer rework, coverage/CRAP/Knip route
  to cleaner rework, and mutation/Sonar route to hardener rework. Each configured edge returns to
  quick and remains independently visit-bounded.
- Upstream comparison used immutable `main`, `six-pack`, and `squad` commits. The squad
  Troubleshooter was rejected as a product repairer because it repairs persistent swarm state
  outside the product state machine; product rework stays with the authorized concern owner.
- Targeted typecheck and behavioral verification exited 0 with 59 tests across three affected
  files. Focused mutation of `gate-failure-context.ts` produced 36 mutants: 24 runnable mutants
  were `Killed`, 12 checker-rejected mutants were `CompileError`, and no other status occurred.
- Final quick verification exited 0 with 789 tests across 30 files and the eight-entry domain
  architecture boundary. Coverage passed with 100% statements (1,865/1,865), 99.53% branches
  (1,074/1,079), 100% functions (422/422), and 100% lines (1,833/1,833). CRAP covered 32 files and
  443 units with zero violations and maximum 6; Knip reported zero issues or hints.
- Complete non-incremental mutation produced 4,398 mutants across 30 source files: all 3,187
  runnable mutants were `Killed`, 1,211 checker-rejected mutants were `CompileError`, and no other
  status occurred.
- Final `pnpm quality:full` exited 0 in the exact
  `quick -> coverage -> crap -> knip -> mutation -> sonar` order. Sonar analysis
  `2dea0d8b-7f87-4ef8-b86c-ab93f6f814f5` returned computed gate `OK` with the approved dedicated
  project and remote policy.
- No real Codex agent smoke was run or claimed for this increment.
