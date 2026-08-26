import { describe, expect, it } from "vitest";
import { BUILT_IN_PROMPTS } from "../../src/application/default-prompts.js";

describe("built-in project prompts", () => {
  it("keeps the immutable implementer and repairer policy content", () => {
    expect(Object.keys(BUILT_IN_PROMPTS)).toEqual(["implementer", "repairer"]);
    expect(BUILT_IN_PROMPTS.implementer).toContain("# Implementer");
    expect(BUILT_IN_PROMPTS.implementer).toContain("The controller and native gates select the next step.");
    expect(BUILT_IN_PROMPTS.repairer).toContain("# Repairer");
    expect(BUILT_IN_PROMPTS.repairer).toContain("Configured edges select the next step.");
    expect(Object.isFrozen(BUILT_IN_PROMPTS)).toBe(true);
  });
});
