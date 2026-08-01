#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { bindPilotCliInput, parsePilotCli, pilotCliCommands } from "./cli/index.mjs";
import { createPilotPaths } from "./service/shared/index.mjs";
import {
  approveCodexAgentPilot,
  approveCodexAgentPilotHost,
  completeCodexAgentPilot,
  closeoutCodexAgentPilot,
  prepareCodexAgentPilot,
  previewCodexAgentPilotHost,
  runCodexAgentPilotAgent,
  settleCodexAgentPilot,
} from "./service/index.mjs";
import { readStateChain } from "./state/index.mjs";
import { requireExistingDirectory } from "./validation/index.mjs";

export * from "./activation/index.mjs";
export * from "./case/index.mjs";
export * from "./cli/index.mjs";
export * from "./constants/index.mjs";
export * from "./digest/index.mjs";
export * from "./harnessClient/index.mjs";
export * from "./host/index.mjs";
export * from "./metrics/index.mjs";
export * from "./project/index.mjs";
export * from "./service/index.mjs";
export * from "./state/index.mjs";
export * from "./validation/index.mjs";
export * from "./workflow/index.mjs";

export async function runCodexAgentPilot(argv, dependencies = {}) {
  const parsed = parsePilotCli(argv);
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  if (parsed.command === pilotCliCommands.prepare)
    return prepareCodexAgentPilot({ ...parsed, packageRoot }, dependencies);
  const root = await requireExistingDirectory(parsed.root, "--root");
  const input = bindPilotCliInput(
    { ...parsed, root },
    await readStateChain(createPilotPaths(root).stateRoot),
  );
  if (input.command === pilotCliCommands.approve)
    return approveCodexAgentPilot(input, dependencies);
  if (input.command === pilotCliCommands.approveHost)
    return approveCodexAgentPilotHost(input, dependencies);
  if (input.command === pilotCliCommands.runAgent)
    return runCodexAgentPilotAgent(input, dependencies);
  if (input.command === pilotCliCommands.closeout)
    return closeoutCodexAgentPilot(input, dependencies);
  if (input.command === pilotCliCommands.complete)
    return completeCodexAgentPilot(input, dependencies);
  if (input.command === pilotCliCommands.settle) return settleCodexAgentPilot(input, dependencies);
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
