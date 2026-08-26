import { describe, expect, it } from "vitest";
import {
  expandProjectConfiguration,
  QUALITY_STAGE_IDS,
  type QualityStageId,
  type TsqhProjectConfiguration,
} from "../../src/domain/project-configuration.js";

describe("built-in project configuration expansion", () => {
  it("expands the complete default quality chain with bounded repair", () => {
    const configuration = expandProjectConfiguration();

    expect(Object.keys(configuration.workflow.steps)).toEqual([
      "implement",
      ...QUALITY_STAGE_IDS,
      "repair",
      "passed",
    ]);
    expect(Object.keys(configuration.profiles)).toEqual(QUALITY_STAGE_IDS);
    expect(configuration.workflow.steps.implement).toMatchObject({ onCompleted: "quick" });
    for (const [index, stageId] of QUALITY_STAGE_IDS.entries()) {
      expect(configuration.workflow.steps[stageId]).toEqual({
        type: "gate",
        profile: stageId,
        maxVisits: 3,
        onPassed: QUALITY_STAGE_IDS[index + 1] ?? "passed",
        onFailed: "repair",
      });
    }
    expect(configuration.workflow.steps.repair).toEqual({
      type: "agent",
      role: "repairer",
      maxVisits: 2,
      onCompleted: "quick",
    });
    expect(configuration.roles.implementer?.allowedPathPrefixes).toEqual(["src/", "test/"]);
    expect(configuration.roles.repairer?.allowedPathPrefixes).toEqual(["src/", "test/"]);
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.workflow.steps)).toBe(true);
    expect(Object.isFrozen(configuration.profiles.sonar?.environmentKeys)).toBe(true);
  });

  it("treats an empty partial object as the unchanged default", () => {
    expect(expandProjectConfiguration({})).toEqual(expandProjectConfiguration());
  });

  it("omits Sonar instead of recording a synthetic pass", () => {
    const configuration = expandProjectConfiguration({ quality: { sonar: false } });

    expect(configuration.workflow.steps.sonar).toBeUndefined();
    expect(configuration.profiles.sonar).toBeUndefined();
    expect(configuration.workflow.steps.mutation).toMatchObject({ onPassed: "passed" });
    expect(configuration.workflow.steps.repair).toMatchObject({ onCompleted: "quick" });
  });

  it.each([
    ["leading", { quick: false }, ["coverage", "crap", "knip", "mutation", "sonar"]],
    ["intermediate", { crap: false }, ["quick", "coverage", "knip", "mutation", "sonar"]],
    ["trailing", { sonar: false }, ["quick", "coverage", "crap", "knip", "mutation"]],
    ["multiple", { quick: false, crap: false, sonar: false }, ["coverage", "knip", "mutation"]],
  ] satisfies readonly [string, Partial<Record<QualityStageId, boolean>>, readonly QualityStageId[]][])(
    "reconnects %s disabled stages deterministically",
    (_name, quality, enabled) => {
      const configuration = expandProjectConfiguration({ quality });
      const steps = configuration.workflow.steps;

      expect(Object.keys(configuration.profiles)).toEqual(enabled);
      expect(steps.implement).toMatchObject({ onCompleted: enabled[0] });
      expect(steps.repair).toMatchObject({ onCompleted: enabled[0] });
      for (const [index, stageId] of enabled.entries()) {
        expect(steps[stageId]).toMatchObject({ onPassed: enabled[index + 1] ?? "passed" });
      }
    },
  );

  it("produces a finite agent-to-terminal graph when every quality stage is disabled", () => {
    const quality = Object.fromEntries(
      QUALITY_STAGE_IDS.map((stageId) => [stageId, false]),
    ) as NonNullable<TsqhProjectConfiguration["quality"]>;
    const configuration = expandProjectConfiguration({ quality });

    expect(configuration.workflow.steps).toEqual({
      implement: {
        type: "agent",
        role: "implementer",
        maxVisits: 1,
        onCompleted: "passed",
      },
      passed: { type: "terminal", outcome: "passed" },
    });
    expect(configuration.roles.repairer).toBeUndefined();
    expect(configuration.profiles).toEqual({});
  });
});
