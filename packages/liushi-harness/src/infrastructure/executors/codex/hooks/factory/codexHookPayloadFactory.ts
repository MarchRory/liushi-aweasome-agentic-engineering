import type { HookWorkspaceBinding } from "#application/index.js";
import { ActorKind, ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import {
  parseArtifactDigest,
  parseArtifactId,
  type ArtifactDigest,
  type ArtifactId,
} from "#domain/artifact/index.js";
import { ActionOutcome, type ActionJournalState } from "#domain/actionJournal/index.js";
import { parseTaskId, type TaskId } from "#domain/task/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

import { CodexHookEvent, CodexSupportedTool } from "../constants/index.js";
import type { CodexHookInput } from "../contracts/index.js";
import { deriveDeterministicHex, deriveDeterministicUlid } from "../identity/index.js";

/** 已通过格式校验、可交给 Canonical Dispatcher 的绑定身份。 */
export interface CodexHookBindingIdentity {
  /** 已绑定的 Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 已绑定的 Task 标识。 */
  readonly taskId: TaskId;
  /** 已批准 PlanRisk Artifact 标识。 */
  readonly actionPlanRiskArtifactId: ArtifactId;
  /** 已批准 PlanRisk Artifact 摘要。 */
  readonly actionPlanRiskArtifactDigest: ArtifactDigest;
}

/** 解析并校验 Hook Binding 中所有领域标识。 */
export function parseCodexHookBindingIdentity(
  binding: HookWorkspaceBinding,
): Result<CodexHookBindingIdentity, HarnessError> {
  const workspaceId = parseWorkspaceId(binding.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const taskId = parseTaskId(binding.taskId);
  if (taskId.status === ResultStatus.Failure) return taskId;
  const planRiskArtifactId = parseArtifactId(binding.planRiskArtifactId);
  if (planRiskArtifactId.status === ResultStatus.Failure) return planRiskArtifactId;
  const planRiskArtifactDigest = parseArtifactDigest(binding.planRiskArtifactDigest);
  if (planRiskArtifactDigest.status === ResultStatus.Failure) return planRiskArtifactDigest;
  return success({
    workspaceId: workspaceId.value,
    taskId: taskId.value,
    actionPlanRiskArtifactId: planRiskArtifactId.value,
    actionPlanRiskArtifactDigest: planRiskArtifactDigest.value,
  });
}

/** 生成一次 Hook 调用对应的确定性 Action ID。 */
export function deriveCodexActionId(binding: HookWorkspaceBinding, input: CodexHookInput): string {
  return deriveDeterministicUlid(
    `${binding.workspaceRoot}:${binding.taskId}:${input.session_id}:${input.turn_id}:${input.tool_use_id}`,
  );
}

/** 生成可重放的 Hook Command 或幂等键。 */
export function deriveCodexKey(
  binding: HookWorkspaceBinding,
  input: CodexHookInput,
  label: string,
): string {
  return `codex-${label}-${deriveDeterministicHex(`${binding.workspaceRoot}:${input.session_id}:${input.turn_id}:${input.tool_use_id}`, 48)}`;
}

/** 构造 Canonical Action Hook 的公共 Payload 字段。 */
export function createCodexBasePayload(
  input: CodexHookInput,
  binding: HookWorkspaceBinding,
  identity: CodexHookBindingIdentity,
  actionId: string,
  occurredAt: string | undefined,
  fallbackOccurredAt: string,
): Record<string, unknown> {
  const seed = `${binding.workspaceRoot}:${input.session_id}:${input.turn_id}:${input.tool_use_id}`;
  return {
    schemaVersion: "1.0.0",
    hookExecutionId: deriveCodexKey(binding, input, input.hook_event_name),
    executor: "codex",
    sessionId: input.session_id,
    turnId: input.turn_id,
    workspaceId: identity.workspaceId,
    taskId: identity.taskId,
    actionId,
    actor: { kind: ActorKind.Agent, actorId: binding.actorId },
    commandId: deriveCodexKey(
      binding,
      input,
      input.hook_event_name === CodexHookEvent.PreToolUse ? "pre-command" : "post-command",
    ),
    correlationId: `codex-turn-${deriveDeterministicHex(seed, 32)}`,
    occurredAt: occurredAt ?? fallbackOccurredAt,
  };
}

/** 仅返回当前适配器允许处理的工具枚举。 */
export function parseCodexSupportedTool(value: string): CodexSupportedTool | undefined {
  return Object.values(CodexSupportedTool).find((tool) => tool === (value as CodexSupportedTool));
}

/** 从 Action Intent 的稳定 JSON 表示中恢复目标文件集合。 */
export function parseCodexIntentTargets(state: ActionJournalState): readonly string[] {
  try {
    const parsed = JSON.parse(state.intent.target) as unknown;
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

/** 将 Codex 工具响应归一化为 Canonical Action Outcome。 */
export function classifyCodexToolOutcome(toolResponse: unknown): ActionOutcome {
  if (isRecord(toolResponse)) {
    if (toolResponse["success"] === false || toolResponse["ok"] === false) {
      return ActionOutcome.Failed;
    }
    const status = toolResponse["status"];
    if (status === "error" || status === "failed") return ActionOutcome.Failed;
    const exitCode = toolResponse["exit_code"];
    if (typeof exitCode === "number" && exitCode !== 0) return ActionOutcome.Failed;
  }
  return ActionOutcome.Succeeded;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
