#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parsePilotCli, pilotCliCommands } from "./cli/index.mjs";
import {
  approveCodexAgentPilot,
  approveCodexAgentPilotHost,
  prepareCodexAgentPilot,
  previewCodexAgentPilotHost,
  runCodexAgentPilotAgent,
} from "./service/index.mjs";

export * from "./activation/index.mjs";
export * from "./case/index.mjs";
export * from "./cli/index.mjs";
export * from "./constants/index.mjs";
export * from "./digest/index.mjs";
export * from "./harnessClient/index.mjs";
export * from "./host/index.mjs";
export * from "./project/index.mjs";
export * from "./service/index.mjs";
export * from "./state/index.mjs";
export * from "./validation/index.mjs";
export * from "./workflow/index.mjs";

export async function runCodexAgentPilot(argv, dependencies = {}) {
  const input = parsePilotCli(argv);
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  if (input.command === pilotCliCommands.prepare)
    return prepareCodexAgentPilot({ ...input, packageRoot }, dependencies);
  if (input.command === pilotCliCommands.approve)
    return approveCodexAgentPilot(input, dependencies);
  if (input.command === pilotCliCommands.approveHost)
    return approveCodexAgentPilotHost(input, dependencies);
  if (input.command === pilotCliCommands.runAgent)
    return runCodexAgentPilotAgent(input, dependencies);
  return previewCodexAgentPilotHost(input, dependencies);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await runCodexAgentPilot(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Codex Agent Pilot 失败。"}\n`,
    );
    process.exitCode = 1;
  }
}
