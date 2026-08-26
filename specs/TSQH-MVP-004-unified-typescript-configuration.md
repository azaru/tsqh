---
id: TSQH-MVP-004
status: complete
risk: high
---

# Unified TypeScript configuration

> Completed on 2026-08-26. The final `quality:full` execution passed 761 tests, killed all 3,083
> runnable mutants while retaining 1,171 checker-rejected `CompileError` results, and completed
> real Sonar analysis `c3b00f50-74d6-41cb-8f99-bf4d3adf2e70` with computed gate `OK`.

## Value

`tsqh.config.ts` is the primary project configuration surface. Its default export may be either a
small built-in-workflow overlay or one complete version 1 workflow, so projects can start with one
quality toggle and grow into a fully customized multi-role graph without changing configuration
formats.

## Relationship to completed increments

`TSQH-MVP-001`, `TSQH-MVP-002`, and `TSQH-MVP-003` remain normative for deterministic controller
authority, strict workflow validation, sequential execution, protected configuration paths,
bounded evaluation, gate immutability, and fail-closed behavior. This increment broadens only the
validated value accepted from a TypeScript default export. Explicit complete JSON workflows and an
absent-file built-in fallback remain supported.

## Configuration contract

The default export from `tsqh.config.ts` is a strict discriminated union:

1. An object with `schemaVersion` is a complete workflow and must satisfy the unchanged complete
   version 1 workflow schema and semantic graph validation.
2. An object without `schemaVersion` is a partial project configuration and must satisfy the
   existing strict quality-overlay schema.

Unknown properties remain errors in both forms. A malformed object that resembles neither form
must fail; it never falls back to the built-in workflow. Complete-workflow prompt paths are resolved
relative to the TypeScript configuration directory and retain the existing regular-file, UTF-8,
inside-root, and symlink protections.

A JSON workflow can be migrated by preserving its object exactly and adding an ECMAScript default
export:

```ts
export default {
  schemaVersion: 1,
  workflow: {},
  roles: {},
  providers: {},
  profiles: {},
};
```

Raw JSON text without `export default` is not a TypeScript module contract. Explicit `.json` paths
continue to load the complete workflow directly.

## Security and architecture

- Both TypeScript forms use the existing fresh, bounded, credential-free evaluator and dedicated
  result pipe.
- Evaluation output cannot select transitions or bypass schema and semantic validation.
- Deterministic partial expansion stays in the domain layer.
- Complete workflow loading reuses one validation and prompt-resolution path across JSON and
  TypeScript inputs.
- The resolved configuration remains deeply immutable and the selected TypeScript path remains
  protected from writing agents.

## Verification

Automated tests must prove:

- discovered and explicit TypeScript partial configurations retain their existing behavior;
- discovered and explicit TypeScript complete workflows load successfully;
- the object from `examples/swarm-forge-lite/workflow.json`, when default-exported from
  `tsqh.config.ts`, resolves to the same workflow and prompt contents as the JSON source;
- complete TypeScript prompt paths use the configuration directory and retain traversal, symlink,
  file-type, and UTF-8 protections;
- complete TypeScript configurations reject schema errors, unknown properties, invalid graph
  semantics, and malformed evaluator values before Git or trace creation;
- `schemaVersion` deterministically selects the complete contract and cannot fall back to a partial
  overlay after failure;
- explicit JSON, absent-file fallback, disabled-gate expansion, CLI precedence, protection, and
  controller behavior do not regress.

Tests use temporary workspaces and evaluator fixtures. They must not require Codex, Sonar, network
access, or a live external service.

## Required deliverable

- unified TypeScript loading with strict contract discrimination;
- shared complete-workflow validation and prompt resolution;
- behavioral adapter and CLI coverage, including the Swarm Forge Lite equivalence case;
- removal of exact duplicate example prompt files while retaining the distinct complete catalog
  and concise Lite role variants;
- README and status documentation aligned with the actual public surface;
- targeted, quick, full, and real local dogfood evidence.

## Non-goals

- accepting raw JSON syntax as a TypeScript module;
- TypeScript config factories, promises, callbacks, hooks, plugins, or dynamic transitions;
- merging a partial overlay with a user-supplied complete workflow;
- ancestor search, JavaScript, CommonJS, YAML, or implicit JSON discovery;
- changes to planner actions, trace schemas, concurrency, daemons, remote execution, managed
  worktrees, merge, or crash-safe resume.

## Completion condition

The increment is complete when both TypeScript forms validate and execute through the same secure
boundaries, the Swarm Forge Lite migration case is demonstrated, all prior configuration behavior
passes, `pnpm quality:full` exits zero, real dogfooding records the expected workflow trace, and
`STATUS.md` records exact evidence or an exact blocker.
