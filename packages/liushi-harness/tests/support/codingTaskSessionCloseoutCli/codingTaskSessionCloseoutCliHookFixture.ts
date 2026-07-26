import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ResultStatus } from "../../../src/index.js";
import type { createHarnessApplication } from "../../../src/index.js";

import {
  CLOSEOUT_CLI_SESSION_ID,
  CLOSEOUT_CLI_SOURCE_TASK_ID,
  CLOSEOUT_CLI_WORKSPACE_ID,
} from "./codingTaskSessionCloseoutCliConstants.js";

/** 通过真实 Codex Pre/Post Hook 产生 Admission、Journal 与 Trace Evidence。 */
export async function produceCloseoutCliHookEvidence(
  application: ReturnType<typeof createHarnessApplication>,
  storeRoot: string,
  worktreeRoot: string,
): Promise<void> {
  const toolInput = {
    command: "*** Begin Patch\n*** Update File: src/index.ts\n@@\n*** End Patch",
  };
  const input = {
    session_id: CLOSEOUT_CLI_SESSION_ID,
    cwd: worktreeRoot,
    hook_event_name: "PreToolUse",
    model: "gpt-5",
    permission_mode: "default",
    turn_id: "closeout-cli-turn",
    transcript_path: null,
    agent_id: "closeout-cli-agent",
    agent_type: "code_mode",
    tool_name: "apply_patch",
    tool_use_id: "closeout-cli-tool-use",
    tool_input: toolInput,
  };
  const pre = await application.handleCodexHook.execute(input);
  if (pre.status !== ResultStatus.Success) throw pre.error;
  // 文件写入模拟 Pre/Post 之间由外部 Coding Agent 执行的已准入工具副作用。
  await writeFile(join(worktreeRoot, "src", "index.ts"), "export const value = 2;\n", "utf8");
  const post = await application.handleCodexHook.execute({
    ...input,
    hook_event_name: "PostToolUse",
    tool_response: { success: true },
  });
  if (post.status !== ResultStatus.Success) throw post.error;
  const admission = JSON.parse(
    await readFile(
      join(
        storeRoot,
        "workspaces",
        CLOSEOUT_CLI_WORKSPACE_ID,
        "codingTaskSessions",
        CLOSEOUT_CLI_SESSION_ID,
        "admission.json",
      ),
      "utf8",
    ),
  ) as { readonly admittedActionIds?: readonly string[] };
  const actionId = admission.admittedActionIds?.[0];
  if (actionId === undefined) throw new Error("Hook 未产生 admitted action。");
  const journal = await application.getActionJournal.execute({
    workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
    taskId: CLOSEOUT_CLI_SOURCE_TASK_ID,
    actionId,
  });
  if (journal.status !== ResultStatus.Success) throw journal.error;
  if (journal.value.observations.length !== 1 || journal.value.resolutions.length !== 1) {
    throw new Error("Hook 未完整产生 Action Journal Observation/Resolution。");
  }
  const traces = await application.listTraceObservations.execute({
    workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
    taskId: CLOSEOUT_CLI_SOURCE_TASK_ID,
    actionId,
  });
  if (traces.status !== ResultStatus.Success) throw traces.error;
  if (traces.value.observations.length !== 1) throw new Error("Hook 未产生 Trace Observation。");
}
