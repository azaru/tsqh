# Task brief authoring

A task brief describes one independently verifiable product slice. It contains only:

- the objective;
- product scope;
- product non-goals;
- dependencies on already integrated behavior; and
- externally observable acceptance criteria.

Acceptance criteria describe required product behavior or artifacts. Their structure and vocabulary
belong to the product specification, not to a workflow pack or its verification artifacts. They must
not describe agent roles, provider commands, controller transitions, workflow packs, worktrees,
temporary directories, evidence formats, or integration procedures.

Task briefs are opaque inputs to the configured workflow. They do not inherit uncommitted changes
from another task, and they do not select how their implementation or verification is orchestrated.
