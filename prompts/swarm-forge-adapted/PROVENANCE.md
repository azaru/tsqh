# Provenance and adaptation record

## Upstream snapshot

Repository: <https://github.com/unclebob/swarm-forge>

Inspected on 2026-08-25 at these immutable commits:

| Branch | Commit |
| --- | --- |
| `main` | `0b69a51ca154025087569e6f880ca24b0bce6f54` |
| `two-pack` | `f2791781b9070fc43c33d460f396f297447e5833` |
| `four-pack` | `83f819307e6258296f6c1934b583ba888346cb2f` |
| `six-pack` | `c8650d14becf6c33be537c75b6dacebccf965d4b` |
| `adversaries` | `7aa2f3a2691ed92e26a11be4481d7d5c8e2ff859` |
| `squad` | `b0d63d57a8f0c2e678c0449c16ee953132b9d306` |

## Source mapping

| Adapted role | Source branch and path |
| --- | --- |
| `analyst` | `squad:swarmforge/role-templates/analyst.prompt`; `squad:swarmforge/role-templates/system-analyst.prompt` |
| `specifier` | `four-pack:swarmforge/roles/specifier.prompt`; `six-pack:swarmforge/roles/specifier.prompt`; `squad:swarmforge/role-templates/gherkin-writer.prompt` |
| `architect` | `four-pack:swarmforge/roles/architect.prompt`; `six-pack:swarmforge/roles/architect.prompt`; `squad:swarmforge/role-templates/architect.prompt` |
| `implementer` | `two-pack:swarmforge/roles/coder.prompt`; `four-pack:swarmforge/roles/coder.prompt`; `six-pack:swarmforge/roles/coder.prompt`; `squad:swarmforge/role-templates/implementer.prompt` |
| `cleaner` | `two-pack:swarmforge/roles/cleaner.prompt`; `four-pack:swarmforge/roles/refactorer.prompt`; `six-pack:swarmforge/roles/cleaner.prompt`; `squad:swarmforge/role-templates/cleaner.prompt` |
| `code-reviewer` | `adversaries:swarmforge/roles/reviewer.prompt`; `squad:swarmforge/role-templates/code-reviewer.prompt` |
| `hardener` | `six-pack:swarmforge/roles/hardender.prompt`; `squad:swarmforge/role-templates/hardener.prompt` |
| `qa` | `six-pack:swarmforge/roles/QA.prompt`; `squad:swarmforge/role-templates/qa.prompt` |
| `senior-implementer` | `squad:swarmforge/role-templates/senior-implementer.prompt` |
| `repairer` | `adversaries:swarmforge/roles/coder.prompt`; `adversaries:swarmforge/roles/reviewer.prompt`; `six-pack:swarmforge/roles/hardender.prompt`; `squad:swarmforge/roles/troubleshooter.prompt`; `squad:swarmforge/role-templates/hardener.prompt` |

The shared clean-code and engineering ideas were also compared with
`main:swarmforge/constitution/articles/engineering.prompt`.

## Adaptation decisions

The TSQH text preserves focused ownership, test-first implementation, behavior-preserving cleanup,
clean architecture, adversarial review, coverage before CRAP, mutation hardening, and independent
QA. It translates the tooling examples to this repository's TypeScript, Vitest, pnpm, Stryker,
`@azaru/tscrap`, Knip, Sonar, and native-gate contracts.

The adaptation removes all upstream runtime choreography, persistent team processes, peer handoff
commands, branch or worktree manipulation, dashboard approval, Clojure/Babashka-specific tooling,
and agent-selected transitions. TSQH configuration and the controller replace that authority.

## Rights notice

No `LICENSE`, `COPYING`, or `NOTICE` file was present in the inspected branches. These files are
original paraphrased adaptations of ideas and role boundaries, not substantial verbatim copies.
Attribution does not itself grant redistribution rights to upstream text. Do not add literal
upstream passages without separate rights confirmation.
