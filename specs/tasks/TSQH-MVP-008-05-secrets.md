# Task 05 — redacted Gitleaks guardrail

## Objective

Add one package-owned `quality:secrets` wrapper that scans the complete candidate and reachable
local history scopes with the installed Gitleaks engine, validates complete evidence, and redacts
secret bytes from all durable and model-visible output.

## Scope

- Selected npm Gitleaks wrapper provisioning and installed-engine/version preflight.
- Candidate scope: tracked files, unstaged modifications, and non-ignored untracked files;
  history scope: commits reachable from `HEAD` and all local refs/tags with completeness checks.
- Narrow checked-in policy, inline/global weakening rejection, synthetic documented exceptions, and
  redacted reports/errors/traces/prompts.
- Fresh bounded report validator, scope/object inventory binding, cancellation/cleanup, and real
  safe/unsafe fixture tests including deleted historical secrets and shallow/missing history.

## Non-goals

No credential rotation, history rewriting, remote fetch, reflog scan, advisory/SCA scan, or writer
repair for a secrets failure.

## Dependencies

Task 02 integrated commit. It may be developed independently of tasks 03 and 04 but integrates in
the frozen order.

## Allowed paths

Tester: `test/` only. Implementer: `src/quality/`, `scripts/`, protected Gitleaks policy and
package metadata. No writing role may edit workflow policy, task authority, reports, credentials,
or global ignore files.

## Acceptance criteria

- One sequential wrapper runs candidate and reachable-history scans with the installed engine and
  zero approved findings; invocation-time binary download or unknown engine blocks.
- Candidate and history enumerations are complete and bound to the declared workspace; tracked
  files remain included even when ignored, and unstaged/untracked/deleted historical cases work.
- Shallow/incomplete history, missing objects, malformed/truncated/oversize/stale reports,
  unsupported repository, scanner error, and policy weakening block directly.
- Secret bytes and recognizable secret-bearing native output never appear in reports, traces,
  errors, prompts, or task evidence. No writer is dispatched after secrets failure.
- Success and failure/cancellation clean only invocation-owned temporary paths.

## Tests and gates

Run focused secrets/redaction/evidence tests, real pinned-tool failing/corrected fixtures, package
install smoke, `pnpm build`, and `pnpm quality:quick`.

## Failure and repair cases

All scanner, scope, policy, process, output, redaction, or cleanup contradictions block. Secrets
failure is a terminal blocker without a writer transition; other task quick failures use finite
implementer repair.

## Required evidence

Installed engine/version, candidate and ref/object inventories, redacted report digest, synthetic
fixture fail/pass results, secret-byte absence checks, cleanup result, test totals, and external
consumer trace. Real credentials must never be used.

## Cleanup and integration

Use only `tmp/codex-TSQH-MVP-008-05-secrets/`; remove only current-invocation paths after capture.
Integrate from a clean controller success and installed-package secrets smoke.
