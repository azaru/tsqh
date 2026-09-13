# Task 01 — package boundary and tool provisioning

## Objective

Make TSQH a public, installable package whose packed artifact contains the compiled CLI and every
asset required by the package-owned quality stages. Move the exact consumer-facing toolchain into
runtime dependencies and establish the clean consumer smoke used by later tasks.

## Scope

- `package.json`, `pnpm-lock.yaml`, build/package scripts, and package files/exports.
- Package-root executable and asset resolution needed by the existing CLI.
- Exact runtime dependencies for the existing gates plus ESLint, compatible typescript-eslint,
  dependency-cruiser, the selected security plugin, and the selected npm Gitleaks wrapper.
- Repository test discovery exclusions for generated/dependency stores, including the known local
  `.pnpm-store` symlink.
- Tests for package metadata, pack contents, executable permissions, and clean installation.

## Non-goals

Consumer scope semantics, dependency-cruiser rules, lint rules, Gitleaks scan behavior, workflow
expansion, the demo, and full release verification are later tasks. Do not add SCA, a new runtime
action, a plugin framework, or a consumer install hook.

## Dependencies

None. Start from integration base `103ed5f`.

## Allowed paths

Tester: `test/` only. Implementer: `package.json`, `pnpm-lock.yaml`, `src/`, `scripts/`,
`schemas/`, `workflows/`, `vitest.config.ts`, and package documentation needed to describe the
public boundary. Protected: `AGENTS.md`, active specifications and task authority, workflow
controller policy, credentials, `.env*`, reports, `tmp/`, and unrelated source behavior.

## Acceptance criteria

- `private` is removed and the package has an explicit, minimal `files`/exports boundary.
- `npm pack` produces one identified tarball containing the bin, compiled code, schemas, prompts,
  workflow assets, quality scripts, and required policy files, without tests, reports, or secrets.
- All consumer-facing quality tools are exact runtime dependencies; the lockfile remains the only
  lockfile and installation verifies the selected Gitleaks wrapper's installed engine.
- Node.js `22.12.0+` and TypeScript `5.9.3` compatibility is checked.
- A clean fixture installs the tarball with pnpm and npm where required by the specification,
  and the installed `tsqh` bin resolves without the source checkout.
- Existing behavior tests remain green and the local dependency-store test pollution is excluded.

## Tests and gates

Run metadata tests, `pnpm build`, the targeted package tests, `pnpm quality:quick`, `npm pack`,
and the clean pnpm/npm consumer install trace. Use a finite configured repair for a quick failure.

## Failure and repair cases

Reject private or incomplete package contents, missing bin targets, mutable/generated package
inputs, wrong tool versions, install failures, missing engine metadata, source-checkout fallback,
and unauthorized path changes. A zero-exit gate that changes a candidate path blocks.

## Required evidence

Exact client/runtime preflight, base and task commits, packed filename and SHA-256, pack file list,
both install commands and exit statuses, installed `tsqh` path/version output, workflow trace,
test totals, quick result, and cleanup result. No credential or synthetic provider claim may be
presented as a real Codex smoke.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-01-package-boundary/` and its invocation children. Remove only
those paths after evidence capture. Integrate one clean commit only after the controller reaches
its success terminal, the installed consumer check passes, and all required task gates pass.
