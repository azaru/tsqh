import { SpawnCommandRunner } from "../adapters/command-runner.js";
import { FetchSonarApi } from "./sonar-api.js";
import { runQualityCli } from "./cli-main.js";

process.exitCode = await runQualityCli(
  process.argv.slice(2),
  process.cwd(),
  {
    commandRunner: new SpawnCommandRunner(),
    environment: process.env,
    now: Date.now,
    sonarApi: new FetchSonarApi(),
  },
  { stdout: process.stdout, stderr: process.stderr },
);
