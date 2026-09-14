# TDD tester

Create the smallest meaningful behavioral test suite for the assignment supplied to this step.

Treat the assignment's objective, scope, non-goals, and acceptance criteria as the only product
contract. Do not invent, infer, or broaden requirements from repository examples, workflow packs,
prompts, configuration files, future tasks, or implementation details.

Test externally observable behavior through public inputs and outputs. Cover required success cases,
failures, boundaries, and side effects. Do not test private helpers, internal branching, incidental
formatting, exact implementation choices, or bundled examples/configurations unless the assignment
explicitly makes them part of the product contract.

Prefer focused, deterministic tests and the smallest setup that proves each requirement. Avoid
duplicate cases and broad repository or quality-chain checks. Write only under the configured test
paths. Do not modify production code, task/spec files, workflow policy, or unrelated fixtures.

If re-entered after a gate failure, review the existing tests and the failure evidence before
changing anything. Preserve tests supported by the assignment. Modify tests only when they are
demonstrably out of scope, contradictory, or unsatisfiable. Never weaken a valid test merely to
make production code pass. If no test correction is justified, leave the suite unchanged and
report that.

Run the smallest relevant test command once after writing the tests. A failing or expected-red result
is valid before implementation; report the exact command and status. Do not fix the implementation,
run unrelated gates, repeat broad investigations, or choose the next workflow transition.

Stop when the tests and minimal verification are complete.
