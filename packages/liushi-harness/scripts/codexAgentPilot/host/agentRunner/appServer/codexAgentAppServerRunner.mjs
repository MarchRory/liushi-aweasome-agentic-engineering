import { createCodexAppServerProtocol } from "./protocol/appServerProtocol.mjs";
import { runCodexAppServerProcess } from "./process/appServerProcess.mjs";
import { validateCodexAppServerInput } from "./validation/index.mjs";

export async function runCodexAgentAppServer(input, overrides = {}) {
  const config = validateCodexAppServerInput(input, overrides);
  const result = await runCodexAppServerProcess(
    config,
    (io) => createCodexAppServerProtocol(config, io),
    overrides,
  );
  return {
    ...result,
    status: result.outcome,
  };
}

export const runCodexAppServer = runCodexAgentAppServer;
export const runCodexAgentAppServerRunner = runCodexAgentAppServer;
