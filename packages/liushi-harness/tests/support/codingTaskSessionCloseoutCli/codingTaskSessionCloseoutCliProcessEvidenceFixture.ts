import {
  AgentSessionProcessHostSurface,
  AgentSessionProcessOutcome,
  ResultStatus,
  parseCodingTaskSessionId,
  parseWorkspaceId,
  type createHarnessApplication,
} from "../../../src/index.js";

import {
  CLOSEOUT_CLI_SESSION_ID,
  CLOSEOUT_CLI_WORKSPACE_ID,
} from "./codingTaskSessionCloseoutCliConstants.js";
import { digestCloseoutCliValue } from "./codingTaskSessionCloseoutCliDigestFixture.js";

/** 模拟受信 Host 在 Agent 进程退出后提交不可变进程事实。 */
export async function recordCloseoutCliProcessEvidence(
  application: ReturnType<typeof createHarnessApplication>,
): Promise<void> {
  const workspaceId = parseWorkspaceId(CLOSEOUT_CLI_WORKSPACE_ID);
  if (workspaceId.status === ResultStatus.Failure) throw workspaceId.error;
  const sessionId = parseCodingTaskSessionId(CLOSEOUT_CLI_SESSION_ID);
  if (sessionId.status === ResultStatus.Failure) throw sessionId.error;
  const result = await application.recordAgentSessionProcessEvidence.execute({
    workspaceId: workspaceId.value,
    sessionId: sessionId.value,
    claimedExecutorSessionIdDigest: digestCloseoutCliValue(CLOSEOUT_CLI_SESSION_ID),
    executorId: "openai-codex",
    executorVersion: "0.0.0-e2e",
    executableDigest: digestCloseoutCliValue({ executable: "codex-e2e" }),
    hostSurface: AgentSessionProcessHostSurface.Cli,
    modelId: "gpt-5.6-sol",
    reasoningEffort: "medium",
    permissionMode: "workspace-write",
    promptDigest: digestCloseoutCliValue({ prompt: "closeout-e2e" }),
    hookConfigDigest: digestCloseoutCliValue({ hooks: ["PreToolUse", "PostToolUse"] }),
    startedAt: "2026-07-27T00:00:01.000Z",
    completedAt: "2026-07-27T00:00:02.000Z",
    durationMs: 1_000,
    outcome: AgentSessionProcessOutcome.Completed,
    exitCode: 0,
    signal: null,
    timedOut: false,
  });
  if (result.status === ResultStatus.Failure) throw result.error;
}
