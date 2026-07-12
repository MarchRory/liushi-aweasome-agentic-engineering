import {
  ActionKind,
  ActionOutcome,
  ActorKind,
  CANONICAL_HOOK_SCHEMA_VERSION,
  HarnessHookEvent,
  HookExecutorKind,
} from "../../../src/index.js";

export const hookFixtureIds = {
  workspaceId: "workspace-hook",
  taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  actionId: "01ARZ3NDEKTSV4RRFFQ69G5FB0",
  alternateActionId: "01ARZ3NDEKTSV4RRFFQ69G5FB1",
  planRiskArtifactId: "01ARZ3NDEKTSV4RRFFQ69G5FC0",
  traceId: "0123456789abcdef0123456789abcdef",
  spanId: "0123456789abcdef",
} as const;

const DIGEST_A = `sha256:${"1".repeat(64)}`;
const DIGEST_B = `sha256:${"2".repeat(64)}`;
const OCCURRED_AT = "2026-07-12T08:00:00.000Z";

/** 构造可按字段覆盖的有效 PreAction 原始输入。 */
export function createPreActionHookInput(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    schemaVersion: CANONICAL_HOOK_SCHEMA_VERSION,
    event: HarnessHookEvent.PreAction,
    hookExecutionId: "hook-pre-1",
    executor: HookExecutorKind.Codex,
    sessionId: "session-1",
    turnId: "turn-1",
    workspaceId: hookFixtureIds.workspaceId,
    taskId: hookFixtureIds.taskId,
    actionId: hookFixtureIds.actionId,
    actor: { kind: ActorKind.Agent, actorId: "coding-agent" },
    commandId: "command-pre-1",
    correlationId: "correlation-1",
    occurredAt: OCCURRED_AT,
    idempotencyKey: "action-idempotency-1",
    actionKind: ActionKind.FileMutation,
    targets: ["packages/liushi-harness/src/index.ts"],
    inputDigest: DIGEST_A,
    postconditionDigest: DIGEST_B,
    recoveryGuidance: "检查目标文件和 Git diff 后交由 Human 决策。",
    planRiskArtifactId: hookFixtureIds.planRiskArtifactId,
    planRiskArtifactDigest: DIGEST_A,
    ...overrides,
  };
}

/** 构造可按字段覆盖的有效 PostAction 原始输入。 */
export function createPostActionHookInput(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    schemaVersion: CANONICAL_HOOK_SCHEMA_VERSION,
    event: HarnessHookEvent.PostAction,
    hookExecutionId: "hook-post-1",
    executor: HookExecutorKind.Codex,
    sessionId: "session-1",
    turnId: "turn-1",
    workspaceId: hookFixtureIds.workspaceId,
    taskId: hookFixtureIds.taskId,
    actionId: hookFixtureIds.actionId,
    actor: { kind: ActorKind.Agent, actorId: "coding-agent" },
    commandId: "command-post-1",
    correlationId: "correlation-1",
    causationId: "command-pre-1",
    occurredAt: OCCURRED_AT,
    outcome: ActionOutcome.Succeeded,
    evidenceIds: ["evidence-diff-1"],
    outputDigest: DIGEST_B,
    traceId: hookFixtureIds.traceId,
    spanId: hookFixtureIds.spanId,
    toolName: "apply_patch",
    toolCallId: "tool-call-1",
    startedAt: "2026-07-12T07:59:59.000Z",
    endedAt: OCCURRED_AT,
    ...overrides,
  };
}
