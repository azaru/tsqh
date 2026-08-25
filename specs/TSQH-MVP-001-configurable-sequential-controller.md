---
id: TSQH-MVP-001
status: complete
risk: high
---

# Configurable sequential multi-agent controller

> Completion snapshot: this specification was completed on 2026-08-25. The active follow-up is
> `TSQH-MVP-002`, which adds repository quality hardening and an adapted role-prompt catalog without
> changing this controller's transition authority.

## Value

A project can declare a sequence or bounded repair graph containing several logical coding agents
and native quality gates. A local controller executes exactly that configuration, never lets an
agent select a transition, and finishes passed or with an exact blocker.

## Product boundary

Version 0 is a foreground TypeScript CLI. It operates on one explicitly supplied clean Git
worktree, invokes one action at a time, uses a generic local command provider, records a small
append-only run trace, and has no merge authority.

## Configuration model

One strict JSON document contains four independent maps:

```text
workflow step -> logical role -> command provider
              -> quality profile
```

The minimum valid shape is:

```json
{
  "schemaVersion": 1,
  "workflow": {
    "id": "example",
    "entryStepId": "implement",
    "steps": {
      "implement": {
        "type": "agent",
        "role": "implementer",
        "maxVisits": 1,
        "onCompleted": "quick"
      },
      "quick": {
        "type": "gate",
        "profile": "quick",
        "maxVisits": 3,
        "onPassed": "review",
        "onFailed": "repair"
      },
      "review": {
        "type": "agent",
        "role": "reviewer",
        "maxVisits": 1,
        "onCompleted": "full"
      },
      "repair": {
        "type": "agent",
        "role": "repairer",
        "maxVisits": 2,
        "onCompleted": "quick"
      },
      "full": {
        "type": "gate",
        "profile": "full",
        "maxVisits": 1,
        "onPassed": "passed",
        "onFailed": "repair"
      },
      "passed": {
        "type": "terminal",
        "outcome": "passed"
      }
    }
  },
  "roles": {
    "implementer": {
      "provider": "codex",
      "promptPath": "prompts/implementer.md",
      "allowedPathPrefixes": ["src/", "test/"]
    },
    "reviewer": {
      "provider": "codex",
      "promptPath": "prompts/reviewer.md",
      "allowedPathPrefixes": ["src/", "test/"]
    },
    "repairer": {
      "provider": "codex",
      "promptPath": "prompts/repairer.md",
      "allowedPathPrefixes": ["src/", "test/"]
    }
  },
  "providers": {
    "codex": {
      "type": "command",
      "executable": "codex",
      "args": ["exec", "-"],
      "promptTransport": "stdin"
    }
  },
  "profiles": {
    "quick": {
      "executable": "pnpm",
      "args": ["quality:quick"]
    },
    "full": {
      "executable": "pnpm",
      "args": ["quality:full"]
    }
  }
}
```

The example provider arguments are configuration, not a guaranteed Codex CLI contract. The
implementation must inspect the installed CLI before shipping the example and keep provider
invocation behind the generic command adapter.

## Observable rules

1. Configuration is schema versioned, rejects unknown properties, and validates before any Git,
   filesystem mutation, agent, or gate command runs.
2. `entryStepId`, every transition target, role id, provider id, profile id, prompt path, executable,
   argument, path prefix, and positive safe-integer `maxVisits` value is validated.
3. Supported step types are `agent`, `gate`, and `terminal`. Role and profile names are data; the
   controller contains no branches for `implementer`, `reviewer`, `repairer`, `quick`, or `full`.
4. The same validated configuration, run trace, visit counts, and recorded process outcomes produce
   the same next planned action.
5. Exactly one action runs at a time. An agent process cannot start another workflow step or select
   a transition.
6. An agent step resolves its role, provider, and prompt; composes the stable role prompt, the exact
   user task, workspace identity, step identity, and most recent gate failure when present; then
   sends the resolved prompt through the configured transport.
7. A successful agent process exit records `completed`. A launch error, signal termination,
   timeout, or nonzero exit records a blocker. Version 0 does not accept agent-selected workflow
   status or next-step fields.
8. A gate runs the exact configured executable and argument array in the candidate worktree. Exit
   zero records `passed`; nonzero records `failed`; launch errors, timeout, or signals record a
   blocker. Output is retained as an artifact but cannot override exit status.
9. After an agent completes, the controller obtains changed paths from Git and blocks if any path is
   outside that role's allowed path prefixes. Invalid, absolute, parent-traversing, or ambiguous
   paths fail closed.
10. A recorded outcome selects only its explicit configured edge. Missing outcome edges block.
11. Before entering a target step, the planner increments its visit count. Exceeding `maxVisits`
    blocks, which makes every configured cycle finite without special-casing a repair role.
12. A repairer is an ordinary configured agent step. A failed gate may point to it, and its
    `onCompleted` edge may point back to an earlier gate.
13. A terminal `passed` step succeeds only when reached by a configured edge. A terminal `blocked`
    step and every fail-closed condition return a nonzero CLI exit.
14. The controller writes one JSON line per `run-created`, `step-started`, `step-finished`, and
    `run-finished` event with one run id and contiguous positive sequence numbers. Version 0 uses
    this trace for audit and `status`; crash-safe resume is deferred.
15. `status` reads without mutation and reports the current step, visit counts, latest outcome,
    terminal state, and blocker when present.

## Architecture

- `src/domain` owns immutable workflow/run types, graph validation that does not require I/O, event
  reduction, and the pure next-action planner.
- `src/application` owns the foreground controller and ports.
- `src/adapters` owns strict JSON loading, filesystem trace writing, Git inspection, and command
  execution.
- `src/cli` owns argument parsing and JSON/human rendering.
- Domain code imports no Node.js builtin, npm package, filesystem, Git, process, provider, or clock.

## Security boundary

- Use `spawn` with `shell: false`, exact argument arrays, explicit working directories, bounded
  output capture, timeout, and a minimal environment allowlist.
- Treat prompts and repository content as untrusted input; they never become executable arguments.
- Resolve configuration and prompt paths beneath the configuration root and reject escapes.
- Never print environment secrets. Persist only bounded, sanitized command output.
- Require an explicitly supplied existing clean Git worktree. Version 0 does not create, delete, or
  merge worktrees and does not modify an integration branch deliberately.

## Verification

Automated tests must prove:

- a workflow containing at least three distinct logical agent roles and two gates executes in exact
  configured order;
- several roles can map to the same provider without becoming the same logical role;
- a failed gate invokes the configured repair role, returns to the configured gate, and continues
  after a later pass;
- repeated failure exhausts a visit budget and blocks without running downstream work;
- malformed schemas, unknown references, missing edges, invalid limits, invalid paths, and unknown
  step types fail before side effects;
- agent output cannot choose or skip a transition;
- gate exit status cannot be overridden by output text;
- unauthorized changed paths, spawn failures, timeouts, and signals block;
- the event trace is contiguous and `status` is read-only;
- pure planning returns the same canonical action for equivalent inputs and does not mutate them.

Use deterministic fake command executables for automated end-to-end tests. Also document a manual
local Codex smoke workflow. Run it only when the installed CLI is available and authenticated, and
report its real result without fabricating success.

## Required deliverable

- strict TypeScript source and JSON schema;
- pnpm package with one lockfile;
- `run` and `status` CLI commands;
- an example workflow, at least three logical roles, prompts, and deterministic fake-provider
  fixtures;
- unit, integration, and CLI acceptance tests;
- `pnpm build`, `pnpm test`, `pnpm quality:quick`, and `pnpm quality:full` scripts;
- concise README usage and updated `STATUS.md`;
- exact verification evidence and remaining limitations.

## Non-goals

- parallel steps, concurrent runs, batches, daemon, dashboard, server, or remote execution;
- managed worktree creation, integration, merge repair, or branch leases;
- crash-safe resume, locks, snapshots, tail recovery, migrations, or power-loss guarantees;
- content-addressed cache, rich evidence DAGs, tool-specific parsing, or cross-run reuse;
- structured semantic review decisions, approvals, provider SDKs, arbitrary plugins, or multiple
  production provider implementations;
- copying the existing `tsqh-orchestrator` implementation or completing its current TSQH-002 scope.

## Completion condition

The increment is complete only when all required artifacts exist, automated happy/repair/exhaustion
traces pass, `pnpm quality:full` exits zero, documentation describes actual behavior, and
`STATUS.md` records the verified result or an exact external blocker.
