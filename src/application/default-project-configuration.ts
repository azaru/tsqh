import type { Configuration, QualityProfile, WorkflowStep } from "../domain/types.js";

export const QUALITY_STAGE_IDS = [
  "quick",
  "coverage",
  "crap",
  "knip",
  "mutation",
  "sonar",
] as const;

export type QualityStageId = (typeof QUALITY_STAGE_IDS)[number];

export interface TsqhProjectConfiguration {
  readonly quality?: Readonly<Partial<Record<QualityStageId, boolean>>>;
}

const DEFAULT_PROFILES = {
  quick: {
    executable: "pnpm",
    args: ["quality:quick"],
    timeoutMs: 900_000,
  },
  coverage: {
    executable: "pnpm",
    args: ["quality:coverage"],
    timeoutMs: 900_000,
  },
  crap: {
    executable: "pnpm",
    args: ["quality:crap"],
    timeoutMs: 900_000,
  },
  knip: {
    executable: "pnpm",
    args: ["quality:knip"],
    timeoutMs: 900_000,
  },
  mutation: {
    executable: "pnpm",
    args: ["quality:mutation"],
    timeoutMs: 3_600_000,
  },
  sonar: {
    executable: "pnpm",
    args: ["quality:sonar"],
    environmentKeys: ["SONAR_HOST_URL", "SONAR_TOKEN", "SONAR_ORGANIZATION"],
    timeoutMs: 360_000,
  },
} as const satisfies Readonly<Record<QualityStageId, QualityProfile>>;

export function expandProjectConfiguration(
  project: TsqhProjectConfiguration = {},
): Configuration {
  const enabledStages = QUALITY_STAGE_IDS.filter((stageId) => project.quality?.[stageId] !== false);
  const firstTarget = enabledStages[0] ?? "passed";
  const steps: Record<string, WorkflowStep> = {
    implement: {
      type: "agent",
      role: "implementer",
      maxVisits: 1,
      onCompleted: firstTarget,
    },
  };
  const profiles: Record<string, QualityProfile> = {};

  for (const [index, stageId] of enabledStages.entries()) {
    steps[stageId] = {
      type: "gate",
      profile: stageId,
      maxVisits: 3,
      onPassed: enabledStages[index + 1] ?? "passed",
      onFailed: "repair",
    };
    profiles[stageId] = DEFAULT_PROFILES[stageId];
  }

  if (enabledStages.length > 0) {
    steps.repair = {
      type: "agent",
      role: "implementer",
      maxVisits: 2,
      onCompleted: firstTarget,
    };
  }
  steps.passed = { type: "terminal", outcome: "passed" };

  return deepFreeze({
    schemaVersion: 1,
    workflow: {
      id: "default",
      entryStepId: "implement",
      steps,
    },
    roles: {
      implementer: {
        provider: "codex",
        promptPath: "builtin/implementer.md",
        allowedPathPrefixes: ["src/", "test/"],
      },
    },
    providers: {
      codex: {
        type: "command",
        executable: "codex",
        args: ["exec", "--sandbox", "workspace-write", "-"],
        promptTransport: "stdin",
        timeoutMs: 900_000,
      },
    },
    profiles,
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}
