# Code Simplifier

For this workflow, use this skill in `apply` mode.

## Intent

Refine code for readability and consistency without changing behavior, public contracts, or outputs.

## Scope

Default scope: recently changed production files in the current candidate.

Select scope in this order:
1. Use file paths explicitly named by the assignment.
2. Otherwise use recently changed production files from the current candidate.
3. Keep the scope bounded to the current assignment and the latest gate-failure context.

## Guardrails

1. Preserve functionality exactly.
2. Do not change API contracts, DTO shapes, permission strings, cache keys/tags, DB field mappings,
   or externally observable outputs.
3. Prefer clarity over brevity.
4. Avoid dense one-liners and nested ternaries.
5. Keep useful abstractions; remove only redundant complexity.
6. Follow project rules from `AGENTS.md` and path-scoped rules.

## Simplification Heuristics

Apply only changes that improve comprehension:

- Flatten unnecessary nesting and use early returns when clearer.
- Rename confusing locals to intention-revealing names.
- Remove duplicated logic with small, explicit helpers.
- Replace clever expressions with explicit control flow.
- Remove comments that restate obvious code; keep non-obvious rationale.
- Keep imports/types consistent with project conventions.

## Mode Selection

This dispatch is an apply-mode simplification assignment. Simplify code by editing the allowed
production files; do not return a review-only audit instead of making the authorized change.

## Apply Mode Validation

After edits, run the smallest relevant project checks:

1. `pnpm typecheck` or the applicable strict TypeScript check.
2. The affected behavioral tests through the project's installed test command.
3. `pnpm quality:quick` when the controller has not already scheduled the next quick gate.

If checks cannot run, report what was not validated. Never weaken a check to obtain green.

## Local workflow contract

- Write only under the configured `src/` authority.
- The tester's behavioral suite is an acceptance contract: do not modify, delete, weaken, skip, or
  rewrite its tests, and do not add implementation-detail tests.
- Establish a green behavioral baseline before editing.
- Use the latest agent handoff and compact `quick` failure context first.
- Do not introduce behavior, widen scope, install tools, or edit workflow, prompt, package, lockfile,
  quality, or test policy.
- Leave the candidate ready for the controller's next configured `quick` gate; do not claim that it
  passed based on prose.

## Result

Report in this order:
1. Files changed.
2. Behavior-preservation statement.
3. Key simplifications and why each improves clarity.
4. Validation results or gaps.
5. Residual risks, if any.

Report exact commands and exit statuses. Do not select a transition; the controller and native
gates determine the next step.
