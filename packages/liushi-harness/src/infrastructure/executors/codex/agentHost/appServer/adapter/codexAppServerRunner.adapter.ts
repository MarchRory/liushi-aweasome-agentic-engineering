import { createCodexAppServerProtocol } from "../protocol/index.js";
import { runCodexAppServerProcess } from "../process/index.js";
import type {
  CodexAppServerRunnerOverrides,
  CodexAppServerRunnerResult,
} from "../contracts/index.js";
import { validateCodexAppServerInput } from "../validation/index.js";

/** 运行正式 Codex App Server Runner 并保留旧入口结果形状。 */
export async function runCodexAgentAppServer(
  input: unknown,
  overrides: CodexAppServerRunnerOverrides = {},
): Promise<CodexAppServerRunnerResult> {
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

/** 兼容旧调用方的 Runner 别名。 */
export const runCodexAppServer = runCodexAgentAppServer;

/** 兼容旧调用方的 Runner 别名。 */
export const runCodexAgentAppServerRunner = runCodexAgentAppServer;
