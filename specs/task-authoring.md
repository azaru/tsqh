# Task brief authoring

A task brief describes one independently verifiable product slice. It contains only:

- the objective;
- product scope;
- product non-goals;
- dependencies on already integrated behavior; and
- externally observable acceptance criteria.

Acceptance criteria describe required product behavior or artifacts. Their structure and vocabulary
belong to the product specification, not to a workflow pack or its verification artifacts. They must
not prescribe agent roles, provider commands, controller transitions, worktrees, temporary
directories, evidence formats, or integration procedures. A task whose product is configuration or
workflow behavior may state that externally observable behavior without prescribing how it is
orchestrated.

Task briefs are opaque inputs to the configured workflow. They do not inherit uncommitted changes
from another task, and they do not select how their implementation or verification is orchestrated.

## Planning and execution boundary

A campaign plan may contain a dependency graph, implementation groups, checklists, and many pending
work items. Those planning artifacts are not a workflow task. The simple workflow receives exactly one
selected product brief at a time; do not pass a proposal, design document, campaign plan, or task
checklist to the tester as the task. If a planning system such as OpenSpec is used, its pending-item
selection belongs before dispatch, while the selected brief remains product-only.

## Size and scope for the simple workflow

The simple workflow is intended for a small vertical product slice, not for an entire release
program or an implementation phase. Use these planning heuristics:

- Give the task one primary product boundary and one coherent outcome.
- Keep related acceptance requirements together, but split unrelated package, analyzer, security,
  workflow, and documentation concerns.
- Prefer two to five observable acceptance requirements. More than five is a signal to split, not a
  hard parser limit.
- Keep the expected implementation surface to a few closely related modules or one configuration
  family. If the change is expected to span several independent adapters, make separate tasks.
- Keep one external compatibility matrix per task. For example, package publication and npm/pnpm
  relocation may be separate slices; adding a new analyzer is a separate slice from either.
- A task should be independently useful after its listed dependencies are integrated. It should not
  require a later task to become meaningful or to define its success.

Split a task when one acceptance failure would require a different owner, fixture strategy, external
service, package boundary, or rollback decision. For MVP-008 this means separating the public package
boundary, consumer installation, runtime toolchain, package-owned tool resolution, Gitleaks engine
provisioning, consumer quality behavior, each new analyzer, workflow activation, and the demo. These
are authoring heuristics only; they are not injected into provider prompts or treated as product
requirements.
