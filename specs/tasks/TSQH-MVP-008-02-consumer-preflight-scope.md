# Task 02 — consumer preflight and analysis scope

## Objective

Remove repository-name and consumer-script assumptions from quality execution. Add strict consumer
preflight, package-root tool resolution, and a deterministic production/test/script/exclusion scope
used consistently by later adapters.

## Scope

- Consumer manifest, Git, TypeScript, test, and module-format inspection with bounded warnings.
- Default and overridden relative glob scope, normalization, inventory, exclusions, and source
  digests.
- Package-owned executable resolution with exact argument arrays, `shell: false`, fixed cwd,
  finite timeouts, and explicit environment allowlists.
- Existing coverage, CRAP, Knip, mutation, and Sonar adapters updated to consume applicable scope
  facts without weakening evidence validators.
- Behavioral tests for defaults, alternate layouts, warnings, blocking, process failures, and
  source-checkout isolation.

## Non-goals

Do not implement dependency-cruiser rules, ESLint rule selection, Gitleaks scans, workflow switches,
or the demo. Do not invoke consumer `quality:*` scripts or `node_modules/.bin` as a fallback.

## Dependencies and authority

Start from task 01's integrated commit. Tester writes only `test/`. Implementer may write only
`src/`, `scripts/`, and relevant strict schema/configuration files. Protect package policy, task and
workflow authority, scanner policy, reports, credentials, and unrelated controller transitions.

## Acceptance criteria

- Consumers with different package names and supported module formats preflight; missing or
  unsupported settings yield bounded warnings, while unconstructable commands/evidence block.
- Defaults are production `src/**/*.ts`, tests `test/**/*.ts`, scripts `scripts/**/*.mjs`, plus
  standard generated/dependency/report exclusions.
- Overrides accept only nonempty safe relative patterns and reject absolute paths, parent escapes,
  unknown keys, duplicate/ambiguous normalization, and invalid exclusions.
- A deterministic resolved inventory is available to test, typed lint, Knip, coverage, CRAP,
  mutation, Sonar, and architecture adapters according to the active specification.
- Package-owned tools resolve from the installed TSQH package root; no consumer script or consumer
  `.bin` path executes.

## Tests, failures, and evidence

Run focused preflight/scope/command-runner tests, the task 01 install smoke, `pnpm build`, and
`pnpm quality:quick`. Exercise missing configuration warnings, alternate `lib`/`__tests__`/`tools`
layouts, malformed scope, spawn error, timeout, signal, and evidence mismatch. Block wrong
workspace, missing Git root, unsupported settings that prevent command construction, unsafe scope,
fallback resolution, nonzero process, malformed evidence, and unauthorized changes.

Required evidence includes scope JSON/inventory digest, warnings/blockers, exact installed tool paths,
process facts, tests, workflow trace, and a clean external-consumer result with no source-checkout
tool path.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-02-consumer-preflight-scope/`. Remove invocation-owned fixtures
after evidence capture and integrate only from a clean successful controller run.
