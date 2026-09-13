# TSQH-MVP-008 dogfooding campaign

Status: frozen before implementation worktrees.

## Authority and baseline

- Specification: `specs/TSQH-MVP-008-static-analysis-and-security-guardrails.md`
- Specification revision: `103ed5f` (the specification is unchanged at the campaign freeze)
- Integration base: `103ed5f` (`main`, clean at freeze)
- Workflow revision: `103ed5f` (`specs/dogfooding-workflow.md`)
- Runtime: Node.js `v22.22.3`
- Package manager: pnpm `11.17.0`
- Git: `2.50.1`
- Validated client: `codex-cli 0.154.0`
- TypeScript baseline: `5.9.3`
- Client policy: verify `codex --version`, Node.js, pnpm, and the package lock before each task;
  do not change versions during this campaign.

The clean integration base is the latest local `main` checkpoint. Its repository test set passes
786 tests in 29 files when invoked with the explicit repository test root and the pre-existing
ignored `.pnpm-store` worktree symlink excluded. An unfiltered `pnpm test` currently discovers
that unrelated symlink and runs its stale tests as a second project; this is recorded as a local
baseline environmental issue and task 01 adds the standard dependency-store exclusion needed by
the active specification. Historical full-chain and Sonar results are not current evidence.

## Frozen task order

| Order | Task | Depends on | Integration condition |
| --- | --- | --- | --- |
| 01 | `TSQH-MVP-008-01-package-boundary` | none | Packed artifact installs and the repository quick checks pass |
| 02 | `TSQH-MVP-008-02-consumer-preflight-scope` | 01 | Installed CLI resolves its package-owned tools and scope checks pass |
| 03 | `TSQH-MVP-008-03-dependency-cruiser` | 02 | Real repository graph passes and fixture failures are fail-closed |
| 04 | `TSQH-MVP-008-04-typed-lint-sast` | 02 | Real safe/unsafe ESLint fixtures and report validation pass |
| 05 | `TSQH-MVP-008-05-secrets` | 02 | Real redacted Gitleaks candidate/history scans and fixture checks pass |
| 06 | `TSQH-MVP-008-06-integration-demo` | 03, 04, 05 | Configuration, packs, demo, docs, and installed consumer trace pass |
| 07 | `TSQH-MVP-008-07-final-verification` | 06 | Fresh acceptance evidence is captured; any red required gate remains an exact blocker |

Each implementation task is executed in a new worktree created from the preceding integrated
commit. The candidate is built and packed through its public package boundary, installed into an
invocation-owned fixture under `tmp/codex-<task>/`, exercised from that fixture, and only then
integrated. No task may rely on uncommitted changes, pnpm links, sibling checkouts, or source
imports from the fixture.

## Workflow and evidence policy

The task worktrees use a checked-in, task-scoped TSQH workflow derived from the simple pack:

```text
tester -> implementer -> quick -> passed
                         ^
                         └── finite implementer repair
```

The tester writes only behavioral tests. The implementer has only the task's allowed production,
configuration, package, script, or documentation paths. Workflow files, task authority,
credentials, run stores, and other protected policy remain outside every writing role. A real
Codex run is reported only when the configured provider actually executes; fake native fixtures
are test evidence, never release evidence.

Required retained evidence is sanitized and task-scoped: client/runtime preflight, worktree and
commit identity, package version and tarball digest, install command, consumer trace, configured
workflow trace, path/evidence validation, targeted tests, `pnpm quality:quick`, and the final
quality-chain results. Temporary fixture and report paths are removed only when owned by the
current invocation and after their evidence is captured.
