import { describe, expect, it } from "vitest";
import { BUILT_IN_PROMPTS } from "../../src/application/default-prompts.js";

describe("built-in project prompts", () => {
  it("provides the default implementer policy", () => {
    expect(BUILT_IN_PROMPTS.implementer).toContain("# Implementer");
    expect(BUILT_IN_PROMPTS.implementer).toContain(
      "The controller and native gates select the next step.",
    );
    expect(BUILT_IN_PROMPTS.implementer).toContain(
      "Never weaken tests, thresholds, scope, configuration, evidence",
    );
    expect(Object.isFrozen(BUILT_IN_PROMPTS)).toBe(true);
  });
});
