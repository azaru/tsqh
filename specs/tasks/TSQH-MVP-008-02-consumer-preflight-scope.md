# Task 02 — consumer preflight and analysis scope

## Objective

Remove repository-name and consumer-script assumptions from quality execution. Add strict consumer
preflight, package-root tool resolution, and a deterministic production/test/script/exclusion
scope used consistently by all later adapters.

## Scope

- Consumer manifest/Git/TypeScript/test/module-format inspection and bounded warning model.
- Default and explicitly overridden relative glob scope, normalization, inventory, exclusions,
  source digests, and invalid-pattern blocking.
- Package-owned executable resolution with exact argument arrays, `shell: false`, fixed cwd,
  finite timeouts, and explicit environment allowlists.
- Existing coverage, CRAP, Knip, mutation, and Sonar adapters updated to consume the scope where
  applicable without weakening their evidence validators.
- Behavioral tests for defaults, alternate layouts, warnings, blocking, and source-checkout
  isolation.

## Non-goals

Do not implement dependency-cruiser rules, ESLint rule selection, Gitleaks scans, workflow switches,
or the demo. Do not invoke consumer `quality:*` scripts or `node_modules/.bin` as a fallback.

## Dependencies

Task 01 integrated commit.

## Allowed paths

Tester: `test/` only. Implementer: `src/`, `scripts/`, and the relevant strict schema/configuration
files. Protected: package policy, task/workflow authority, scanner policy, reports, credentials,
and unrelated role or controller transitions.

## Acceptance criteria

- Any consumer package name and supported module format can be preflighted; missing or unsupported
  settings produce bounded warnings, while unconstructable commands/evidence block.
- Defaults are production `src/**/*.ts`, tests `test/**/*.ts`, scripts `scripts/**/*.mjs`, plus
  standard generated/dependency/report exclusions.
- Overrides accept only nonempty, safe relative patterns and reject absolute paths, parent escapes,
  unknown scope properties, duplicates/ambiguous normalization, and invalid exclusions.
- The resolved inventory is deterministic and is used by test, typed lint, Knip, coverage, CRAP,
  mutation, Sonar, and architecture adapters according to the specification.
- Package-owned tools resolve from the installed TSQH package root, and no consumer script or
  consumer `.bin` path is executed.

## Tests and gates

Run focused preflight/scope/command-runner tests, package install smoke from task 01, `pnpm build`,
and `pnpm quality:quick`. Exercise a missing config warning, alternate `lib`/`__tests__`/`tools`
layout, malformed scope, spawn error, timeout, signal, and evidence mismatch.

## Failure and repair cases

Fail closed for wrong workspace, missing manifest/Git root, unsupported TypeScript or test config,
absolute/escaping/empty scope, package-root resolution fallback, consumer-script execution,
nonzero process, signal, timeout, malformed evidence, and unauthorized changes. Route ordinary
quick failures through the finite task implementer repair.

## Required evidence

Scope JSON/inventory digest, preflight warnings and blockers, exact installed package/tool paths,
process facts, test totals, workflow trace, and clean external-consumer output. No source checkout
path may appear as the executed tool path.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-02-consumer-preflight-scope/`. Remove invocation-owned fixtures
after evidence capture and integrate only from a clean successful controller run.
