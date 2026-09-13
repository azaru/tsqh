# Task 04 — typed lint and lightweight SAST

## Objective

Add one package-owned ESLint flat-config invocation combining typed typescript-eslint correctness
rules with a small explicit `eslint-plugin-security` set and fail-closed JSON evidence.

## Scope

- Consumer-scope-driven ESLint flat configuration and package-owned tool resolution.
- Typed `recommendedTypeChecked` plus the required unsafe promise/value/await rules.
- Selected security rules for unsafe regular expressions, dynamic filesystem/process/require use,
  eval, and bidi-control characters, fixed only after real fixture checks.
- JSON report completeness for zero-finding files, input inventory, scope/config identity, tool
  versions, native status, digest, and no inline suppression/autofix.
- Safe and unsafe TypeScript/JavaScript fixture tests for production, test, and script paths.

## Non-goals

No second SAST service, CodeQL/Semgrep, dependency vulnerability scan, autofix, warning-only mode,
or policy changes outside the selected lint configuration.

## Dependencies and authority

Start from task 02's integrated commit. Tester writes only `test/`. Implementer may write only
`src/quality/`, scripts, protected ESLint policy/configuration, and package metadata required for
exact runtime tools. Lint policy and validators remain outside writing-role path allowances where
the final workflow permits them.

## Acceptance criteria

- One invocation covers the resolved production/test/script union; typed rules apply to supported
  TypeScript and generic/security rules to supported script files.
- Required rules are enabled, parser failures and warnings/errors fail, inline configuration is
  disabled, and no autofix or dependency mutation occurs.
- JSON evidence contains every expected file, including zero-finding entries, and validates scope,
  inventory, tool/process identity, native status, and report digest.
- Real unsafe promise/value/regex/process/bidi fixtures fail and corrected fixtures pass without
  leaking secret bytes or scanning generated/dependency/report/workflow/task paths.

## Tests, failures, and evidence

Run focused lint/evidence tests, real safe/unsafe ESLint fixtures, `pnpm build`, and
`pnpm quality:quick`. Block wrong/missing tools, parser or native errors, malformed/incomplete/
stale/oversize/secret-bearing reports, inline suppression, autofix, consumer `.bin` fallback, and
unauthorized changes. A one-time lint failure must route to the configured owner in the later
integrated workflow.

Required evidence: exact rules and versions, scope/inventory, report digest, fixture fail/pass
outputs, process facts, test totals, installed-consumer trace, and cleanup.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-04-typed-lint-sast/`; remove invocation-owned fixtures after
evidence capture and integrate only after the controller, external consumer, and quick gate pass.
