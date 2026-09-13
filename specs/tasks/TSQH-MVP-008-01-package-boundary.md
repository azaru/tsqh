# Task 01 — package boundary and tool provisioning

## Objective

Make TSQH a public, installable package whose packed artifact contains the compiled CLI and every
asset required by package-owned quality stages. Move the exact consumer-facing toolchain into
runtime dependencies and establish the clean consumer smoke used by later tasks.

## Scope

- `package.json`, `pnpm-lock.yaml`, build/package scripts, and explicit files/exports metadata.
- Package-root executable and asset resolution needed by the existing CLI and quality commands.
- Exact runtime dependencies for the existing gates plus the selected ESLint, typescript-eslint,
  dependency-cruiser, security plugin, and npm Gitleaks wrapper.
- Test discovery exclusions for generated/dependency stores, including the local `.pnpm-store`
  worktree symlink when present.
- Behavioral tests for metadata, pack contents, executable permissions, and clean installation.

## Non-goals

Consumer scope semantics, dependency-cruiser rules, lint rules, Gitleaks scan behavior, workflow
stage expansion, the demo, and final release verification are later tasks. Do not add SCA, a new
runtime action, a generic plugin framework, or an install hook.

## Dependencies and authority

Start from the frozen campaign integration base. Tester writes only `test/`. Implementer may write
only the package/runtime paths required by this task: `package.json`, `pnpm-lock.yaml`, `src/`,
`scripts/`, `schemas/`, `vitest.config.ts`, and package-facing README text. Protected paths include
`AGENTS.md`, `specs/`, `workflows/simple/`, credentials, `.env*`, `reports/`, and `tmp/`.

## Acceptance criteria

- `private` is removed and the package has an explicit minimal files/exports boundary.
- `npm pack` produces one identified tarball containing the bin, compiled code, schemas, prompts,
  workflow assets, quality scripts, and required policy files, without tests, reports, or secrets.
- Consumer-facing quality tools are exact runtime dependencies and the lockfile remains the only
  lockfile; installation verifies the selected Gitleaks wrapper's installed engine.
- Node.js `22.12.0+` and TypeScript `5.9.3` compatibility is checked.
- Clean pnpm and npm fixtures install the tarball and resolve the installed `tsqh` bin without the
  source checkout.
- Existing behavior tests remain green and dependency-store test pollution is excluded.

## Tests, failures, and evidence

Run focused package tests, `pnpm build`, `pnpm quality:quick`, `npm pack`, and both clean consumer
install traces. Fail closed for private/incomplete contents, wrong tool versions, missing engine
metadata, installation failure, source-checkout fallback, unauthorized changes, or a zero-exit gate
that mutates candidate paths. A quick failure may use only the simple pack's finite implementer
repair.

Required evidence: exact preflight, base/task commits, tarball name and SHA-256, pack file list,
install commands and exits, installed `tsqh` path/version, workflow trace, test totals, quick result,
and cleanup. No synthetic provider result is a real Codex smoke claim.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-01-package-boundary/` and its invocation children. Remove only
paths owned by this invocation after evidence capture. Integrate one clean commit only after the
controller passes, the installed consumer check passes, and all required gates pass.
