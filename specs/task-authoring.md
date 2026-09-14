# Task brief authoring

A task brief describes one independently verifiable product slice. It contains only:

- the objective;
- product scope;
- product non-goals;
- dependencies on already integrated behavior; and
- externally observable acceptance criteria.

Put acceptance criteria under a `## Acceptance` heading as one consecutive ordered list. Criteria
describe required product behavior or artifacts. They must not describe agent roles, provider
commands, controller transitions, workflow packs, worktrees, temporary directories, evidence
formats, or integration procedures.

Task briefs are inputs to the configured workflow. They do not inherit uncommitted changes from
another task, and they do not select how their implementation or verification is orchestrated.
