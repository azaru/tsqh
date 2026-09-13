# TSQH-MVP-008 dogfooding campaign

Status: frozen before implementation worktrees.

## Authority and baseline

- Specification: `specs/TSQH-MVP-008-static-analysis-and-security-guardrails.md`
- Specification revision: `103ed5f` (the specification is unchanged at campaign freeze)
- Integration base: `f6fcf4c2c0f58cc1e738f50da07301f7f6b50866` (`dogfooding`, clean and green)
- Workflow: checked-in `workflows/simple/workflow.json`
- Workflow file content identity at freeze: `563ef0b73b70ee31789a7cdb11755f78030a19f3`
- Runtime preflight: Node.js `v22.22.3`, pnpm `11.17.0`, Git `2.50.1`
- Validated client: `codex-cli 0.154.0`, authenticated with `codex login status`
- TypeScript baseline: `5.9.3`
- Client policy: verify the exact client/runtime/package versions before every task; do not use
  an unvalidated `latest` value or change the client version during this campaign.

The baseline verification at freeze was `pnpm test` — exit 0, 786 tests in 29 files — and
`pnpm quality:quick` — exit 0, including strict test typecheck, build, the same 786-test suite,
and the architecture check. Historical status and full-chain evidence are not current evidence.

The simple pack remains the sole campaign controller. Its implementer authority is the union of
the task-specific implementation prefixes listed below; task text narrows the assignment for each
run, while the controller still protects the workflow, task, prompt, run-store, credential, report,
and temporary-path inputs. The tester remains limited to `test/`.

## Frozen task order

| Order | Task | Depends on | Integration condition |
| --- | --- | --- | --- |
| 01 | `TSQH-MVP-008-01-package-boundary` | none | Packed artifact installs in a clean consumer and quick passes |
| 02 | `TSQH-MVP-008-02-consumer-preflight-scope` | 01 | Installed package resolves package-owned tools and scope checks pass |
| 03 | `TSQH-MVP-008-03-dependency-cruiser` | 02 | Real production graph passes and fixture failures are fail-closed |
| 04 | `TSQH-MVP-008-04-typed-lint-sast` | 02 | Safe/unsafe lint fixtures and report validation pass |
| 05 | `TSQH-MVP-008-05-secrets` | 02 | Candidate/history scans are complete and redacted |
| 06 | `TSQH-MVP-008-06-integration-demo` | 03, 04, 05 | Switches, packs, demo, docs, and installed trace pass |
| 07 | `TSQH-MVP-008-07-final-verification` | 06 | Fresh acceptance evidence is captured; red gates remain exact blockers |

Every implementation task starts from the preceding integrated commit in a new worktree. The
candidate is built and packed through its public package boundary, installed into an invocation-owned
fixture under `tmp/codex-<task>/`, exercised from that fixture, and integrated only after the
configured controller reaches its success terminal and required checks pass.

## Workflow and evidence policy

Each task uses the checked-in simple workflow:

```text
tester -> implementer -> quick -> passed
                         ^
                         └── finite implementer repair
```

The task file is passed with `--task`; `workflows/simple/task.md` is not used for campaign work.
The tester may write only `test/`. The implementer receives the task's exact assignment and may
write only within the union of implementation prefixes declared by the campaign; it may not edit
task authority, workflow policy, credentials, reports, or `tmp/`. Every writing step is checked
against its pre-step Git snapshot. Native gates are candidate-stable and run with `shell: false`.

The external-consumer check is mandatory for every implementation task. It records the package
version, tarball name and digest, install command, installed `tsqh` path, consumer trace, and
cleanup result. No source checkout, pnpm link, sibling checkout, consumer quality script, or
unbuilt source path may satisfy that boundary.

## Evidence and cleanup

Durable sanitized campaign evidence belongs in the task artifact or `STATUS-HISTORY.md` only after
it is captured. Invocation-owned paths are limited to
`tmp/codex-<task>/`; remove only paths created by that invocation after evidence capture, including
consumer fixtures, run stores, package tarballs, and temporary reports. Never record credentials or
secret bytes. Never claim a real client, package install, native service, mutation, or Sonar result
unless it actually ran.

## Final condition

After task 07, run the final required quality chain, reconcile every active-spec requirement and
acceptance scenario against current evidence, verify cleanup and worktree state, and report exact
changed files, commands, exit statuses, test totals, task traces, repairs, limitations, and blockers.
