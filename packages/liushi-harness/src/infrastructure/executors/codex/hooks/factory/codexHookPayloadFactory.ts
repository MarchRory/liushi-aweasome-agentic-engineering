import {
  CANONICAL_HOOK_SCHEMA_VERSION,
  CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
  CodexHookEvent,
  type HookBinding,
} from "#application/index.js";
import {
  ActorKind,
  ResultStatus,
  parseContentDigest,
  success,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "#common/index.js";
import {
  parseArtifactDigest,
  parseArtifactId,
  type ArtifactDigest,
  type ArtifactId,
} from "#domain/artifact/index.js";
import {
  ActionOutcome,
  SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
  type ActionJournalState,
} from "#domain/actionJournal/index.js";
import { parseTaskId, type TaskId } from "#domain/task/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

import { CodexSupportedTool } from "../constants/index.js";
import type { CodexHookInput } from "../contracts/index.js";
import { deriveDeterministicHex } from "../identity/index.js";

/** 已通过格式校验、可交给 Canonical Dispatcher 的绑定身份。 */
interface CodexHookBindingIdentityBase {
  /** 已绑定的 Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 已绑定的 Task 标识。 */
  readonly taskId: TaskId;
  /** 已批准 PlanRisk Artifact 标识。 */
  readonly actionPlanRiskArtifactId: ArtifactId;
  /** 已批准 PlanRisk Artifact 摘要。 */
  readonly actionPlanRiskArtifactDigest: ArtifactDigest;
}

/** 经过格式校验、可交给 Canonical Dispatcher 的绑定身份。 */
export type CodexHookBindingIdentity =
  | (CodexHookBindingIdentityBase & { readonly schemaVersion: "1.0.0" })
  | (CodexHookBindingIdentityBase & {
      readonly schemaVersion: "2.0.0";
      /** v2 持久化 Session 标识和 Binding Digest。 */
      readonly session: {
        readonly sessionId: string;
        readonly codingTaskId: string;
        readonly attemptNumber: number;
        readonly worktreeId: string;
        readonly worktreeRootDigest: ContentDigest;
        readonly activationBindingDigest: ContentDigest;
        readonly sessionBindingDigest: ContentDigest;
      };
    });

/** 解析并校验 Hook Binding 中所有领域标识。 */
export function parseCodexHookBindingIdentity(
  binding: HookBinding,
): Result<CodexHookBindingIdentity, HarnessError> {
  const workspaceId = parseWorkspaceId(binding.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const taskId = parseTaskId(binding.taskId);
  if (taskId.status === ResultStatus.Failure) return taskId;
  const planRiskArtifactId = parseArtifactId(binding.planRiskArtifactId);
  if (planRiskArtifactId.status === ResultStatus.Failure) return planRiskArtifactId;
  const planRiskArtifactDigest = parseArtifactDigest(binding.planRiskArtifactDigest);
  if (planRiskArtifactDigest.status === ResultStatus.Failure) return planRiskArtifactDigest;
  const identity = {
    workspaceId: workspaceId.value,
    taskId: taskId.value,
    actionPlanRiskArtifactId: planRiskArtifactId.value,
    actionPlanRiskArtifactDigest: planRiskArtifactDigest.value,
  };
  if (binding.schemaVersion === "1.0.0") {
    return success({ ...identity, schemaVersion: "1.0.0" as const });
  }
  const worktreeRootDigest = parseContentDigest(binding.worktreeRootDigest);
  if (worktreeRootDigest.status === ResultStatus.Failure) return worktreeRootDigest;
  const activationBindingDigest = parseContentDigest(binding.activationBindingDigest);
  if (activationBindingDigest.status === ResultStatus.Failure) return activationBindingDigest;
  const sessionBindingDigest = parseContentDigest(binding.sessionBindingDigest);
  if (sessionBindingDigest.status === ResultStatus.Failure) return sessionBindingDigest;
  return success({
    ...identity,
    schemaVersion: "2.0.0",
    session: {
      sessionId: binding.sessionId,
      codingTaskId: binding.codingTaskId,
      attemptNumber: binding.attemptNumber,
      worktreeId: binding.worktreeId,
      worktreeRootDigest: worktreeRootDigest.value,
      activationBindingDigest: activationBindingDigest.value,
      sessionBindingDigest: sessionBindingDigest.value,
    },
  });
}

/** 生成可重放的 Hook Command 或幂等键。 */
export function deriveCodexKey(invocationScopeId: ContentDigest, label: string): string {
  return `codex-${label}-${deriveDeterministicHex(invocationScopeId, 48)}`;
}

/** 构造 Canonical Action Hook 的公共 Payload 字段。 */
export function createCodexBasePayload(
  input: CodexHookInput,
  binding: HookBinding,
  identity: CodexHookBindingIdentity,
  actionId: string,
  invocationScopeId: ContentDigest,
  occurredAt: string | undefined,
  fallbackOccurredAt: string,
): Record<string, unknown> {
  const common = {
    hookExecutionId: deriveCodexKey(invocationScopeId, input.hook_event_name),
    executor: "codex",
    sessionId: input.session_id,
    turnId: input.turn_id,
    workspaceId: identity.workspaceId,
    taskId: identity.taskId,
    actionId,
    actor: { kind: ActorKind.Agent, actorId: binding.actorId },
    commandId: deriveCodexKey(
      invocationScopeId,
      input.hook_event_name === CodexHookEvent.PreToolUse ? "pre-command" : "post-command",
    ),
    correlationId: `codex-invocation-${deriveDeterministicHex(invocationScopeId, 32)}`,
    occurredAt: occurredAt ?? fallbackOccurredAt,
  };
  if (binding.schemaVersion === "1.0.0") {
    return { schemaVersion: CANONICAL_HOOK_SCHEMA_VERSION, ...common };
  }
  return {
    schemaVersion: CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
    ...common,
    sessionContext: {
      sessionId: binding.sessionId,
      sessionBindingDigest: binding.sessionBindingDigest,
    },
  };
}

/** 仅返回当前适配器允许处理的工具枚举。 */
export function parseCodexSupportedTool(value: string): CodexSupportedTool | undefined {
  return Object.values(CodexSupportedTool).find((tool) => tool === (value as CodexSupportedTool));
}

/** 从 Action Intent 的稳定 JSON 表示中恢复目标文件集合。 */
export function parseCodexIntentTargets(state: ActionJournalState): readonly string[] {
  if (state.intent.schemaVersion === SESSION_ACTION_JOURNAL_SCHEMA_VERSION) {
    return state.intent.targets;
  }
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
  if (!isRecord(toolResponse)) return ActionOutcome.OutcomeUnknown;

  const status =
    typeof toolResponse["status"] === "string" ? toolResponse["status"].toLowerCase() : undefined;
  const exitCode = toolResponse["exit_code"];
  if (
    toolResponse["success"] === false ||
    toolResponse["ok"] === false ||
    status === "error" ||
    status === "failed" ||
    (typeof exitCode === "number" && exitCode !== 0)
  ) {
    return ActionOutcome.Failed;
  }
  if (
    toolResponse["success"] === true ||
    toolResponse["ok"] === true ||
    status === "success" ||
    status === "succeeded" ||
    status === "completed" ||
    status === "ok" ||
    exitCode === 0
  ) {
    return ActionOutcome.Succeeded;
  }
  return ActionOutcome.OutcomeUnknown;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
