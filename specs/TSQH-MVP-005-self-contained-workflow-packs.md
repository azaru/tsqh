# TSQH-MVP-005: Self-contained workflow packs

Status: complete

## Purpose

Replace the repository's overlapping `examples/` and `prompts/` content roots with two explicit,
self-contained workflow packs under `workflows/`. Each pack owns its complete configuration, task
example, and prompt files, so every prompt has one clear workflow context and prompt-path
containment remains enforceable.

## Required layout

The repository must contain exactly these two workflow packs:

```text
workflows/
  simple/
    README.md
    task.md
    workflow.json
    prompts/
      implementer.md
      repairer.md
  swarm-forge/
    README.md
    PROVENANCE.md
    manifest.json
    task.md
    workflow.json
    prompts/
      architect.md
      cleaner.md
      hardener.md
      implementer.md
      qa.md
      repairer.md
      specifier.md
```

The `examples/` and top-level `prompts/` directories must not remain.

## Simple workflow

The simple pack preserves the existing complete hardening graph:

```text
implement -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed
             \-> repair --------------------------------------------/
```

It owns concise `implementer` and `repairer` prompts beneath its configuration root. All existing
quality profiles, bounded repair semantics, provider behavior, and path authority remain unchanged.

## Swarm Forge workflow

The Swarm Forge pack uses the fixed sequential role model that best fits TSQH version 0, primarily
adapted from the immutable Swarm Forge `six-pack` branch with additional role evidence from the
recorded `two-pack`, `four-pack`, `adversaries`, `squad`, and `main` commits:

```text
specifier -> implementer -> cleaner -> architect -> hardener -> qa
          -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed
                       \-> repair ------------------------------------/
```

Every agent step runs as a fresh sequential provider process. `specifier`, `architect`, and `qa`
are read-only. `implementer`, `cleaner`, `hardener`, and `repairer` may write only under `src/` and
`test/`. Agent output remains bounded untrusted handoff context; it cannot select transitions.

Only prompts referenced by this workflow remain in the pack. Its manifest records their exact
digests and immutable upstream source mapping. The provenance notice continues to require original
paraphrased adaptations because no upstream license file was found in the inspected commits.

## Compatibility and migration

- Move every maintained workflow and prompt asset to `workflows/`; do not retain forwarding copies.
- Update repository documentation, tests, and configuration fixtures to the new canonical paths.
- Preserve the built-in discovered workflow and explicit complete JSON loading behavior.
- Preserve strict prompt containment beneath each configuration root.
- Do not change schemas, planner semantics, trace formats, command execution, quality policy, or
  runtime dependencies.
- Completed specifications remain historical records and are not rewritten to pretend they used
  the new paths.

## Verification

Automated tests must prove:

- both workflow configurations load with their owned prompts;
- the simple workflow retains the exact six-gate repair graph;
- the Swarm Forge workflow has the exact sequential role and quality order;
- every Swarm Forge role has the configured path authority;
- its manifest matches every retained prompt digest and immutable source mapping;
- `examples/` and top-level `prompts/` do not exist;
- the fake-provider happy and repair-exhaustion traces use the new Swarm Forge workflow.

Run targeted tests while migrating, `pnpm quality:quick` after the coherent change, and
`pnpm quality:full` before delivery.

## Completion evidence — 2026-08-26

- `examples/` and the top-level `prompts/` root are absent. The repository contains exactly the
  `workflows/simple/` and `workflows/swarm-forge/` packs required by this specification.
- Both complete JSON configurations load with prompt containment intact. The Swarm Forge manifest
  lists exactly the seven workflow roles, and every retained prompt digest matches.
- `pnpm exec vitest run test/config/config-loader.test.ts test/config/project-config-loader.test.ts
  test/application/controller.test.ts test/prompts/catalog.test.ts` — exit 0; 129 tests across four
  files passed.
- `pnpm quality:quick` — exit 0; strict test typecheck, build, 762 tests across 28 files, and the
  six-entry domain architecture boundary passed.
- `pnpm quality:full` — exit 0 in the exact `quick -> coverage -> crap -> knip -> mutation -> sonar`
  order. Coverage was 100% statements, functions, and lines and 99.51% branches. CRAP reported 30
  source files, 418 units, zero violations, and maximum CRAP 6. Knip reported zero findings or
  hints. Stryker reported 3,083 `Killed` runnable mutants and 1,171 checker `CompileError` mutants,
  with no other status. Sonar analysis `0deb3bfb-d442-4f87-88cf-abb01fc15fc8` produced computed gate
  `OK` with the approved dedicated-project policy.
- The fake-provider happy trace ran `specifier -> implementer -> cleaner -> architect -> hardener
  -> qa -> quick -> coverage -> crap -> knip -> mutation -> sonar -> passed`. Persistent mutation
  failure selected repairer twice, reran from `quick`, exhausted the repair visit limit, and never
  started Sonar.
- No new authenticated Codex smoke was run or claimed for this content-layout increment.
