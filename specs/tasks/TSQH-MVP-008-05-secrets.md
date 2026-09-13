# Task 05 — redacted candidate and history secret scans

## Objective

Implement one package-owned `quality:secrets` wrapper that runs complete candidate and reachable
history Gitleaks scans, validates fresh evidence, and never exposes secret bytes.

## Scope

- Installed Gitleaks-wrapper engine discovery and no-download-at-scan-time verification.
- Candidate scope of tracked plus non-ignored untracked files, including unstaged changes.
- Reachable local history across `HEAD` and locally available refs/tags with shallow/missing-object
  rejection and recorded sanitized ref/object inventory.
- Inline/global policy weakening rejection, narrow documented synthetic fixture exception, bounded
  redaction, versioned ignored report, and fail-closed evidence validation.
- Deterministic local Git fixtures for tracked/untracked/unstaged/deleted historical secrets, tags,
  shallow history, missing objects, failures, and cleanup.

## Non-goals

No credential rotation, history rewrite, remote fetch, reflog scan, SCA, or writer repair after a
secrets failure. Do not narrow secret scanning to the code-analysis scope.

## Dependencies and authority

Start from task 02's integrated commit. Tester writes only `test/`. Implementer may write only
`src/quality/`, scripts, protected Gitleaks policy, and package metadata required for the wrapper.
Protect workflow/task authority, credentials, maintained reports, and temporary paths.

## Acceptance criteria

- Both scans run sequentially with the installed engine and zero unapproved findings are required.
- Candidate and history scopes match the declared workspace; tracked files remain included despite
  ignore rules, and incomplete/shallow/missing history blocks.
- Reports, errors, traces, and provider prompts contain only redacted metadata; synthetic fixtures
  never baseline real credentials.
- Missing binaries, wrong versions, unsupported repositories, incomplete enumeration, malformed or
  truncated output, scanner errors, stale/oversize/outside-workspace evidence all block directly.
- Secrets failure selects an explicit blocked terminal and dispatches no writer.

## Tests, failures, and evidence

Run deterministic fake-process/evidence tests and real pinned-tool failing/corrected fixtures,
`pnpm build`, and `pnpm quality:quick`. Block nonzero, spawn, timeout, signal, malformed output,
missing engine, download fallback, policy weakening, candidate mutation, and any secret leakage.
Record engine version, candidate/history inventories, redacted finding counts, process facts, test
totals, installed-consumer trace, and cleanup; never record synthetic secret bytes.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-05-secrets/`; remove only invocation-owned fixture paths after
evidence capture and integrate the clean task commit after the external consumer and quick pass.
