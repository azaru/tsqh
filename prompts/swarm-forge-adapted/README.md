# TSQH adapted role catalog

This catalog contains original TSQH role prompts informed by the role separation and engineering
practices found across several Swarm Forge branches. It is prompt content, not an orchestration
runtime. A TSQH workflow activates a role only by referencing its prompt and still controls every
transition through validated configuration and native process outcomes.

## Roles

| Role | Primary responsibility | Default write posture |
| --- | --- | --- |
| `analyst` | Clarify intent, constraints, risks, and acceptance evidence | Read-only |
| `specifier` | Produce deterministic, externally observable acceptance criteria | Specification paths only |
| `architect` | Review boundaries, dependency direction, and testability | Review artifacts only |
| `implementer` | Deliver the smallest tested behavior slice | Assigned production and test paths |
| `cleaner` | Improve structure without changing behavior | Assigned production and test paths |
| `code-reviewer` | Produce concrete adversarial findings | Review artifacts only |
| `hardener` | Resolve review and deep-quality findings | Assigned production and test paths |
| `qa` | Independently verify the user-facing result and quality evidence | QA artifacts; fixes only if assigned |
| `senior-implementer` | Apply bounded architectural recommendations | Explicitly assigned paths |
| `repairer` | Repair the most recent failed native gate | Explicitly assigned paths |

The configuration's `allowedPathPrefixes` is authoritative. The assignment composer must show the
resolved prefixes to a writing agent. A role prompt cannot grant broader access than configuration.

## Common authority contract

Every role follows these rules even when a role file does not repeat every implementation detail:

- Work only on the exact assignment and configured allowed paths.
- Do not install dependencies or edit workflow, prompt, package, lock, or quality policy unless the
  assignment explicitly authorizes those exact files.
- Execute relevant installed commands one at a time and report exact commands, exit statuses, test
  totals, evidence, residual findings, and blockers.
- Missing tools, invalid evidence, contradictory requirements, or necessary out-of-scope changes
  block; they never pass by inference.
- Do not commit, merge, create or manage worktrees, start a daemon, message another role, or invoke
  an external coordination protocol.
- Process prose is evidence only. The TSQH controller alone chooses transitions.

## Use

Copy a selected prompt into a configuration-relative prompt directory or reference this catalog
from a configuration root that contains it. Keep role, provider, prompt, and quality profile ids
independent. Review [`PROVENANCE.md`](PROVENANCE.md) before redistribution or further adaptation.

The catalog does not imply that version 0 can parse semantic review decisions. Review prompts write
or report findings; configured native gates and controller-owned edges still decide execution.

[`manifest.json`](manifest.json) records stable ids, file digests, dispatch posture, and immutable
upstream commits. A digest change requires an intentional manifest update.
