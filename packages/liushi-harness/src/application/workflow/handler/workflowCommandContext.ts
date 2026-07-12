import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  WORKFLOW_EVENT_SCHEMA_VERSION,
  failure,
  success,
  type Clock,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type { WorkflowLocator } from "#application/ports/index.js";
import {
  parseWorkflowId,
  parseWorkflowEventId,
  type WorkflowCellRoutedEventDraft,
  type WorkflowEventDraftBase,
  type WorkflowEventId,
  type WorkflowId,
  type WorkflowRouteDecision,
} from "#domain/workflow/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";
import type { WorkflowCommandPayload } from "../commands/index.js";

/** 将 Command 的 Aggregate ID 和 Payload Workspace 解析为 Workflow Locator。 */
export function parseWorkflowLocator(
  workflowIdValue: string,
  workspaceIdValue: string,
): Result<WorkflowLocator, HarnessError> {
  const workflowId = parseWorkflowId(workflowIdValue);
  if (workflowId.status === ResultStatus.Failure) return workflowId;
  const workspaceId = parseWorkspaceId(workspaceIdValue);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  return success({ workflowId: workflowId.value, workspaceId: workspaceId.value });
}

/** 生成并校验 Workflow Event ID，失败时不创建 Event 草稿。 */
export function nextWorkflowEventId(
  eventIdGenerator: IdGenerator,
): Result<WorkflowEventId, HarnessError> {
  try {
    return parseWorkflowEventId(eventIdGenerator.next());
  } catch (error) {
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Workflow Event ID 生成失败。", {}, error),
    );
  }
}

/** 构造由 Store 补齐 Sequence、Previous Hash 和最终 Hash 的 Event 公共字段。 */
export function createWorkflowEventMetadata(
  command: CommandEnvelope<WorkflowCommandPayload>,
  workflowId: WorkflowId,
  workspaceId: WorkspaceId,
  eventId: WorkflowEventId,
  clock: Clock,
): WorkflowEventDraftBase {
  return {
    schemaVersion: WORKFLOW_EVENT_SCHEMA_VERSION,
    eventId,
    workflowId,
    workspaceId,
    commandId: command.commandId,
    correlationId: command.correlationId,
    ...(command.causationId === undefined ? {} : { causationId: command.causationId }),
    occurredAt: clock.now().toISOString(),
    actor: command.actor,
  };
}

/** 将确定性路由决策转换成 CellRouted Event Payload。 */
export function createWorkflowRoutePayload(
  decision: WorkflowRouteDecision,
): WorkflowCellRoutedEventDraft["payload"] {
  return {
    fromCell: decision.currentCell,
    toCell: decision.targetCell,
    routeKind: decision.routeKind,
    ...(decision.failureTaxonomy === undefined
      ? {}
      : { failureTaxonomy: decision.failureTaxonomy }),
    requiresHuman: decision.requiresHuman,
  };
}

/** 创建稳定的 Aggregate 版本冲突错误。 */
export function workflowVersionConflict(
  expectedVersion: number,
  actualVersion: number,
): HarnessError {
  return new HarnessError(HarnessErrorCode.VersionConflict, "Workflow Aggregate Version 已变化。", {
    expectedVersion: String(expectedVersion),
    actualVersion: String(actualVersion),
  });
}
