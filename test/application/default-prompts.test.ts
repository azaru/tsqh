import { describe, expect, it } from "vitest";
import { BUILT_IN_PROMPTS } from "../../src/application/default-prompts.js";

describe("built-in project prompts", () => {
  it("keeps the immutable implementation and owner-rework policy content", () => {
    expect(Object.keys(BUILT_IN_PROMPTS)).toEqual(["implementer"]);
    expect(BUILT_IN_PROMPTS.implementer).toContain("# Implementer");
    expect(BUILT_IN_PROMPTS.implementer).toContain("The controller and native gates select the next step.");
    expect(BUILT_IN_PROMPTS.implementer).toContain("native gate failure");
    expect(BUILT_IN_PROMPTS.implementer).toContain("compact failure context");
    expect(Object.isFrozen(BUILT_IN_PROMPTS)).toBe(true);
  });
});
