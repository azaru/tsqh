import { SpawnCommandRunner } from "../adapters/command-runner.js";
import { FetchSonarApi } from "./sonar-api.js";
import { runQualityCli } from "./cli-main.js";

const SONAR_ENVIRONMENT_KEYS = ["SONAR_HOST_URL", "SONAR_TOKEN", "SONAR_ORGANIZATION"] as const;

export function selectQualityEnvironment(
  environment: NodeJS.ProcessEnv,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    SONAR_ENVIRONMENT_KEYS
      .filter((key) => environment[key] !== undefined)
      .map((key) => [key, environment[key] as string]),
  );
}

const environment = selectQualityEnvironment(process.env);

process.exitCode = await runQualityCli(
  process.argv.slice(2),
  process.cwd(),
  {
    commandRunner: new SpawnCommandRunner(),
    environment,
    now: Date.now,
    sonarApi: new FetchSonarApi(),
  },
  { stdout: process.stdout, stderr: process.stderr },
);
