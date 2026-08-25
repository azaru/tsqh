# Agent Instructions

## Read order

Before coding, read `README.md`, `STATUS.md`, the active specification named by `STATUS.md`, and the
upstream design references linked from `README.md`.

## Development contract

- Work only on the local active specification. Do not inherit the active milestone or provisional
  APIs from `../tsqh-orchestrator`.
- Treat `../tsqh-orchestrator` as read-only design evidence. Never modify it from this repository.
- Keep every repository file, identifier, prompt, comment, test, and generated artifact in English.
- Use pnpm exclusively and keep one `pnpm-lock.yaml`.
- Target Node.js 22 or newer, ESM, and strict TypeScript.
- The approved initial dependency budget is `ajv`, `typescript`, `vitest`, and `@types/node`. Obtain
  human approval before adding another dependency.
- Prefer Node.js built-ins and a small number of explicit modules over framework infrastructure.
- Keep deterministic planning independent of filesystem, Git, processes, clocks, providers, and
  network access.
- The controller selects transitions. Agents and native commands only report outcomes.
- Execute external commands as an executable plus argument array with `shell: false`. Never build
  interpolated shell commands from configuration or agent output.
- Validate configuration strictly and reject unknown properties, unknown references, invalid visit
  limits, missing transitions, and unreachable terminal behavior.
- Run only one action at a time. Version 0 has no concurrency, daemon, distributed lease, or remote
  executor.
- Treat nonzero gate exit status as failure. Missing, malformed, contradictory, or unauthorized
  output blocks; it never passes by inference.
- Validate Git changed paths after every writing agent step against the role's allowed path
  prefixes. Never let an agent edit workflow policy to unblock its own run.
- Add behavioral tests for happy paths, configuration failures, transition order, agent failure,
  gate failure, repair success, repair exhaustion, unauthorized changes, and command-spawn errors.
- Run targeted tests while iterating and `pnpm quality:quick` after each coherent change. Run
  `pnpm quality:full` before delivery.
- Do not weaken tests or validation to obtain green.
- Update `STATUS.md` when the implementation state or blocker changes.

## Delivery report

Report exact changed files, commands, exit statuses, test totals, the demonstrated workflow trace,
remaining limitations, and blockers. Do not claim a real Codex smoke test passed unless it ran.
