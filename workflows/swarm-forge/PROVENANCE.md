# Provenance and adaptation record

## Upstream snapshot

Repository: <https://github.com/unclebob/swarm-forge>

Inspected through 2026-08-26 at these immutable commits:

| Branch | Commit |
| --- | --- |
| `main` | `8e83a09a41a7970edf8107f074cc41c12b953a08` |
| `two-pack` | `f2791781b9070fc43c33d460f396f297447e5833` |
| `four-pack` | `83f819307e6258296f6c1934b583ba888346cb2f` |
| `six-pack` | `c8650d14becf6c33be537c75b6dacebccf965d4b` |
| `squad` | `b0d63d57a8f0c2e678c0449c16ee953132b9d306` |

## Source mapping

| Adapted role | Source branch and path |
| --- | --- |
| `specifier` | `four-pack:swarmforge/roles/specifier.prompt`; `six-pack:swarmforge/roles/specifier.prompt`; `squad:swarmforge/role-templates/gherkin-writer.prompt` |
| `architect` | `four-pack:swarmforge/roles/architect.prompt`; `six-pack:swarmforge/roles/architect.prompt`; `squad:swarmforge/role-templates/architect.prompt` |
| `implementer` | `two-pack:swarmforge/roles/coder.prompt`; `four-pack:swarmforge/roles/coder.prompt`; `six-pack:swarmforge/roles/coder.prompt`; `squad:swarmforge/role-templates/implementer.prompt` |
| `cleaner` | `two-pack:swarmforge/roles/cleaner.prompt`; `four-pack:swarmforge/roles/refactorer.prompt`; `six-pack:swarmforge/roles/cleaner.prompt`; `squad:swarmforge/role-templates/cleaner.prompt` |
| `hardener` | `six-pack:swarmforge/roles/hardender.prompt`; `squad:swarmforge/role-templates/hardener.prompt` |
| `qa` | `six-pack:swarmforge/roles/QA.prompt`; `squad:swarmforge/role-templates/qa.prompt` |

The shared clean-code and engineering ideas were also compared with
`main:swarmforge/constitution/articles/engineering.prompt`.

## Adaptation decisions

The TSQH text preserves focused ownership, test-first implementation, behavior-preserving cleanup,
clean architecture, bounded owner-routed rework, coverage before CRAP, mutation hardening, and
independent QA.
It translates the tooling examples to this repository's TypeScript, Vitest, pnpm, Stryker,
`@azaru/tscrap`, Knip, Sonar, and native-gate contracts.

The adaptation removes all upstream runtime choreography, persistent team processes, peer handoff
commands, branch or worktree manipulation, dashboard approval, Clojure/Babashka-specific tooling,
and agent-selected transitions. TSQH configuration and the controller replace that authority.

The upstream `six-pack` roles repair failures in the verification they own. In `squad`, product
rework is also ownership-specific: hardener applies code-review findings, QA fixes issues within QA
scope, and senior implementer applies architecture findings. The persistent Troubleshooter repairs
swarm state and dead sessions and is explicitly outside the product state machine. TSQH therefore
does not adapt it into a generic product repair role: static workflow edges route failed native
gates to the configured implementer, cleaner, or hardener rework step.

## Rights notice

No `LICENSE`, `COPYING`, or `NOTICE` file was present in the inspected branches. These files are
original paraphrased adaptations of ideas and role boundaries, not substantial verbatim copies.
Attribution does not itself grant redistribution rights to upstream text. Do not add literal
upstream passages without separate rights confirmation.
