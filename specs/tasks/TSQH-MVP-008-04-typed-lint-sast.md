# Task 04 — typed lint and lightweight SAST

## Objective

Add one package-owned ESLint flat-config invocation combining typed typescript-eslint correctness
rules with a small explicit `eslint-plugin-security` rule set and fail-closed JSON evidence.

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

## Dependencies

Task 02 integrated commit.

## Allowed paths

Tester: `test/` only. Implementer: `src/quality/`, `scripts/`, protected ESLint policy/configuration,
and package metadata required for exact runtime tools. Lint policy and validators are protected
from writing-role path allowances in the configured workflow.

## Acceptance criteria

- One invocation covers the resolved union of production, test, and script patterns; TypeScript
  files receive typed rules and supported scripts receive generic/security rules.
- Required rules are enabled, parser failures and any warning/error fail, inline configuration is
  disabled, and no autofix or dependency mutation occurs.
- The JSON report contains every expected file, including zero-finding entries, and validates exact
  scope/inventory/tool/process/report identity before success.
- Real unsafe promise/value/regex/process/bidi fixtures fail and corrected fixtures pass without
  leaking fixture secrets or scanning generated/dependency/report/workflow/task paths.
- Package-owned tools are resolved without consumer `node_modules/.bin` or scripts.

## Tests and gates

Run focused lint/evidence tests, real pinned ESLint fixture checks, `pnpm build`, and
`pnpm quality:quick`. Exercise missing/wrong-version binary, spawn/timeout/signal, parser failure,
suppression, missing file entry, stale/oversize/wrong-scope report, and candidate mutation.

## Failure and repair cases

Any finding, warning, parser/evidence error, incomplete report, native failure, unsupported scope,
or unauthorized path blocks/fails. A one-time lint failure must route to its configured owner; this
task's ordinary quick repair remains finite.

## Required evidence

Exact selected rule list, tool versions, scope/inventory, safe/unsafe fixture outputs, report digest,
process facts, test totals, repair trace, and installed-consumer run. Do not call this complete
application vulnerability analysis.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-04-typed-lint-sast/`; remove invocation-owned fixtures after
evidence capture. Integrate only after the package-installed lint and quick checks pass.
