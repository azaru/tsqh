# Task 03 — dependency-cruiser architecture gate

## Objective

Replace the regex architecture script with a package-owned dependency-cruiser adapter, one strict
JSON rule file, bounded report evidence, and production-scope graph validation inside `quick`.

## Scope

- Dependency-cruiser invocation and package-root binary resolution.
- Rules for cycles, unresolved imports, layer boundaries, undeclared/development dependencies,
  production imports into test/generated/report paths, dynamic resolution, and complete inventory.
- Versioned ignored report and evidence validator bound to workspace, scope, configuration identity,
  native status, and complete graph facts.
- Real repository graph plus synthetic nested/alias/re-export/type-only/cycle/layer fixtures.

## Non-goals

No custom dependency graph implementation, independent architecture stage, SCA, new controller
protocol, or unrelated domain behavior.

## Dependencies and authority

Start from task 02's integrated commit. Tester writes only `test/`. Implementer may write only
`src/quality/`, `scripts/`, protected dependency-cruiser JSON policy, and required package metadata.
Do not edit task files, workflow authority, role prompts, credentials, or maintained reports.

## Acceptance criteria

- `quality:quick` runs dependency-cruiser after package-owned typecheck/build and before tests;
  `quality:architecture` remains independently callable and full does not duplicate it.
- The real repository graph passes with every production TypeScript module in the inventory.
- Cycles, unresolved imports, forbidden layers, undeclared/development dependencies, and production
  imports into test/generated/report paths fail closed.
- Reports are bounded, fresh, nonempty, valid JSON, workspace/scope/configuration bound, complete,
  warning-free, and reject empty or contradictory graphs.
- Type-only imports and supported aliases/re-exports use the real tool; dynamic resolution is
  rejected by the selected lint/security policy where dependency-cruiser cannot resolve it.

## Tests, failures, and evidence

Run focused architecture/evidence tests, real safe/unsafe dependency-cruiser fixtures, the real
repository graph, `pnpm build`, and `pnpm quality:quick`. Block missing/wrong-version binaries,
spawn errors, timeouts/signals/nonzero status, malformed/stale/oversize/incomplete/wrong-workspace
reports, warnings, empty graphs, and gate mutations. Route an ordinary quick failure through the
finite implementer repair.

Required evidence: tool version, exact rule identity, source inventory, report digest, native facts,
real repository pass, each fixture result, test totals, and installed-consumer trace.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-03-dependency-cruiser/`; remove invocation-owned fixture paths
after evidence capture and integrate the clean task commit after package installation and quick pass.
