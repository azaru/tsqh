import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [, , mode, stateDirectory, label = "gate"] = process.argv;
if (mode === undefined || stateDirectory === undefined) {
  process.stderr.write("fake command requires a mode and state directory\n");
  process.exit(64);
}
await mkdir(stateDirectory, { recursive: true });

if (mode.startsWith("agent-")) {
  const prompt = await readStandardInput();
  const identity = /## Assignment identity[\s\S]*?\nStep: ([^\n]+)\nVisit: ([^\n]+)/.exec(prompt);
  const step = identity?.[1] ?? "unknown";
  const visit = identity?.[2] ?? "0";
  await writeFile(join(stateDirectory, `prompt-${step}-${visit}.txt`), prompt, "utf8");

  if (mode === "agent-timeout") {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  if (mode === "agent-signal") {
    process.kill(process.pid, "SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  if (mode === "agent-unauthorized") {
    await writeFile("workflow-policy.json", "{}\n", "utf8");
  } else if (mode === "agent-protected-config") {
    await writeFile("workflow.json", "{}\n", "utf8");
  } else if (
    mode !== "agent-workflow" ||
    !new Set(["specifier", "architect", "qa"]).has(step)
  ) {
    await mkdir("src", { recursive: true });
    await appendFile("src/order.txt", `${step}\n`, "utf8");
  }
  await appendFile(join(stateDirectory, "execution.log"), `agent:${step}:${visit}\n`, "utf8");
  process.stdout.write('{"status":"completed","nextStep":"passed"}\n');
  if (mode === "agent-exit") {
    process.exit(7);
  }
  process.exit(0);
}

await appendFile(join(stateDirectory, "execution.log"), `gate:${label}\n`, "utf8");
if (mode === "gate-write-tracked") {
  await appendFile("seed.txt", "gate mutation\n", "utf8");
}
if (mode === "gate-write-untracked") {
  await writeFile("gate-output.txt", "gate mutation\n", "utf8");
}
if (mode === "gate-write-ignored") {
  await mkdir("reports", { recursive: true });
  await writeFile("reports/gate-output.txt", "owned ignored report\n", "utf8");
}
if (mode === "gate-signal") {
  process.kill(process.pid, "SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}
if (mode === "gate-always-fail") {
  process.stdout.write("passed; nextStep=passed\n");
  process.stderr.write("simulated persistent gate failure\n");
  process.exit(1);
}
if (mode === "gate-fail-once") {
  const counterPath = join(stateDirectory, `counter-${label}.txt`);
  const previous = await readFile(counterPath, "utf8").catch(() => "0");
  const count = Number.parseInt(previous, 10) + 1;
  await writeFile(counterPath, String(count), "utf8");
  if (count === 1) {
    process.stdout.write("passed; nextStep=passed\n");
    process.stderr.write("simulated gate failure\n");
    process.exit(1);
  }
}
process.stdout.write("native gate passed\n");

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
