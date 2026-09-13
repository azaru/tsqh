# Task 03 — dependency-cruiser architecture gate

## Objective

Replace the regex architecture script with a package-owned dependency-cruiser adapter, one strict
JSON rule file, bounded report evidence, and production-scope graph validation inside `quick`.

## Scope

- Dependency-cruiser invocation and package-root binary resolution.
- Rules for cycles, unresolved imports, layer boundaries, undeclared/development dependencies,
  test/generated/report imports, dynamic resolution, and complete production inventory.
- Versioned ignored report and evidence validator bound to workspace, scope, configuration identity,
  native status, and complete graph facts.
- Real repository graph and synthetic nested/alias/re-export/type-only/cycle/layer fixtures.

## Non-goals

No custom dependency graph implementation, independent architecture stage, SCA, new controller
protocol, or changes to unrelated domain behavior.

## Dependencies

Task 02 integrated commit.

## Allowed paths

Tester: `test/` only. Implementer: `src/quality/`, `scripts/`, protected dependency-cruiser JSON
policy, and relevant package metadata. The implementer must not edit workflow policy, task files,
role prompts, credentials, or reports as maintained inputs.

## Acceptance criteria

- `quality:quick` runs dependency-cruiser after package-owned typecheck/build and before tests,
  while `quality:architecture` remains independently callable and full does not duplicate it.
- The real repository graph passes with every production TypeScript module present.
- Cycles, unresolved imports, forbidden layers, undeclared/development dependencies, and production
  imports into test/generated/report paths fail closed.
- Reports are bounded, fresh, nonempty, valid JSON, workspace/scope/configuration-bound, complete,
  warning-free, and reject empty or contradictory graphs.
- Type-only imports and supported aliases/re-exports are handled by the real tool, not a regex
  substitute; dynamic require/computed import is rejected by the selected lint/security policy.

## Tests and gates

Run focused architecture/evidence tests, real safe/unsafe dependency-cruiser fixture commands,
the real repository graph, `pnpm build`, and `pnpm quality:quick`.

## Failure and repair cases

Block missing/wrong-version binaries, spawn errors, timeout/signal/nonzero status, malformed,
stale, oversize, incomplete, wrong-workspace, wrong-scope, warning-bearing, empty, or mutated
reports. A failed quick stage uses the finite implementer repair.

## Required evidence

Tool version, exact rule identity, source inventory, report digest, native process facts, real
repository pass, each fixture fail/pass result, test totals, and external installed-consumer trace.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-03-dependency-cruiser/`; remove only invocation-owned fixture
paths. Integrate the clean task commit after the installed package and quick gate pass.
