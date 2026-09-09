import { SpawnCommandRunner } from "../adapters/command-runner.js";
import { FetchSonarApi } from "./sonar-api.js";
import { runQualityCli } from "./cli-main.js";

const environment = Object.fromEntries(
  ["SONAR_HOST_URL", "SONAR_TOKEN", "SONAR_ORGANIZATION"]
    .filter((key): key is "SONAR_HOST_URL" | "SONAR_TOKEN" | "SONAR_ORGANIZATION" => process.env[key] !== undefined)
    .map((key) => [key, process.env[key] as string]),
);

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
