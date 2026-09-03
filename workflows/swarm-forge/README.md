# Adapted Swarm Forge workflow pack

This self-contained pack adapts the fixed specialist separation from Swarm Forge to TSQH's
deterministic sequential controller. The `six-pack` branch provides the primary workflow spine;
the recorded `two-pack`, `four-pack`, `squad`, and `main` commits contribute role
boundaries and engineering practices where they fit the local contract.

The pack contains original paraphrased adaptations, not the upstream runtime or literal prompt
copies. See [`PROVENANCE.md`](PROVENANCE.md) for immutable source mapping and the upstream rights
notice.

## Workflow

```text
specifier -> implementer -> cleaner -> architect -> hardener -> qa
          -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed

quick                  --failed--> implementation-rework --completed--> quick
coverage | crap | knip --failed--> cleanup-rework        --completed--> quick
mutation | sonar       --failed--> hardening-rework      --completed--> quick
```

Every agent step uses a fresh provider process. Successful bounded output becomes untrusted context
for the next configured agent. It cannot change the task, permissions, provider, transitions,
visits, or gate outcomes. The controller remains the only transition authority.

The Codex provider defaults to `gpt-5.6-luna` with reasoning effort `max`. The `specifier` and
`architect` steps override those provider defaults with `gpt-5.6-sol` and `xhigh`; implementer,
cleaner, hardener, QA, and all three rework dispatches inherit Luna/max. These are provider-owned
argument selections, not role or transition authority.

| Role | Primary responsibility | Write authority |
| --- | --- | --- |
| `specifier` | Produce testable acceptance guidance | Read-only |
| `implementer` | Deliver the smallest tested behavior slice | `src/`, `test/` |
| `cleaner` | Improve structure without changing behavior | `src/`, `test/` |
| `architect` | Report architecture findings | Read-only |
| `hardener` | Resolve findings and strengthen quality evidence | `src/`, `test/` |
| `qa` | Independently verify behavior and evidence | Read-only |

An ordinary gate failure returns to the configured owner of that concern: quick to implementer,
coverage/CRAP/Knip to cleaner, and mutation/Sonar to hardener. Every owner-rework step returns to
`quick` and has a finite visit limit. Its initial provider prompt receives at most 8 KiB from each
failed output stream, preserves the beginning and end, declares both capture and context
truncation, and omits the previous agent handoff. Full reports remain available for selective
inspection. A missing, malformed, contradictory, or unauthorized result blocks.

## Use

Run this pack from a built TSQH checkout with a separate clean candidate worktree:

```sh
pnpm tsqh run \
  --config workflows/swarm-forge/workflow.json \
  --workspace /absolute/path/to/a/clean-git-worktree \
  --task workflows/swarm-forge/task.md
```

The provider command and quality profiles are ordinary configuration. They may require local
credentials or tool availability, especially the Sonar profile.

[`manifest.json`](manifest.json) records stable role ids, prompt digests, dispatch posture, and
immutable upstream commits. A prompt digest change requires an intentional manifest update.
