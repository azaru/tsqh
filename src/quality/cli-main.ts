import type { QualityGateRuntime } from "./gates.js";
import { runLocalQualityGate, type LocalQualityGateId } from "./gates.js";
import type { SonarApi } from "./sonar-api.js";
import { runSonarQualityGate } from "./sonar-gate.js";
import type { SonarEnvironment } from "./sonar.js";

export type QualityGateId = LocalQualityGateId | "sonar";

export interface QualityCliRuntime extends QualityGateRuntime {
  readonly environment: SonarEnvironment;
  readonly sonarApi: SonarApi;
}

interface QualityCliStreams {
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

export async function runQualityCli(
  args: readonly string[],
  workspace: string,
  runtime: QualityCliRuntime,
  streams: QualityCliStreams,
): Promise<number> {
  const gateId = parseQualityGate(args);
  if (gateId === null) {
    streams.stderr.write("Usage: quality-gate <coverage|crap|knip|mutation|sonar>\n");
    return 2;
  }

  const result = gateId === "sonar"
    ? await runSonarQualityGate(workspace, runtime)
    : await runLocalQualityGate(gateId, workspace, runtime);
  if (result.process !== null) {
    streams.stdout.write(result.process.stdout);
    streams.stderr.write(result.process.stderr);
  }
  const stream = result.exitCode === 0 ? streams.stdout : streams.stderr;
  stream.write(`${gateId}: ${result.summary.status}: ${result.summary.reason}\n`);
  return result.exitCode;
}

export function parseQualityGate(args: readonly string[]): QualityGateId | null {
  if (args.length !== 1) {
    return null;
  }
  return isQualityGate(args[0]) ? args[0] : null;
}

function isQualityGate(value: string | undefined): value is QualityGateId {
  return value === "coverage" ||
    value === "crap" ||
    value === "knip" ||
    value === "mutation" ||
    value === "sonar";
}
