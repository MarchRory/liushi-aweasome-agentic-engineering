import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  CODING_TASK_EVENT_SCHEMA_VERSION,
  failure,
  success,
  type Clock,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type { CodingTaskLocator } from "#application/ports/index.js";
import {
  parseCodingTaskEventId,
  parseCodingTaskId,
  type CodingTaskEventId,
  type CodingTaskEventDraftBase,
  type CodingTaskId,
} from "#domain/codingTask/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";
import type { CodingTaskCommandPayload } from "../commands/index.js";

/** 将 Command 的 Aggregate ID 和 Workspace 解析为 CodingTask Locator。 */
export function parseCodingTaskLocator(
  idValue: string,
  workspaceValue: string,
): Result<CodingTaskLocator, HarnessError> {
  const task = parseCodingTaskId(idValue);
  if (task.status === ResultStatus.Failure) return task;
  const workspace = parseWorkspaceId(workspaceValue);
  if (workspace.status === ResultStatus.Failure) return workspace;
  return success({ codingTaskId: task.value, workspaceId: workspace.value });
}
/** 生成并校验 CodingTask Event ID。 */
export function nextCodingTaskEventId(
  generator: IdGenerator,
): Result<CodingTaskEventId, HarnessError> {
  try {
    return parseCodingTaskEventId(generator.next());
  } catch (error) {
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "CodingTask Event ID 生成失败。", {}, error),
    );
  }
}
/** 构造由 Store 补齐序号、前置 Hash 和最终 Hash 的 Event 公共字段。 */
export function createCodingTaskEventMetadata(
  command: CommandEnvelope<CodingTaskCommandPayload>,
  codingTaskId: CodingTaskId,
  workspaceId: WorkspaceId,
  eventId: CodingTaskEventId,
  clock: Clock,
): Omit<CodingTaskEventDraftBase, "type"> {
  return {
    schemaVersion: CODING_TASK_EVENT_SCHEMA_VERSION,
    eventId,
    codingTaskId,
    workspaceId,
    commandId: command.commandId,
    correlationId: command.correlationId,
    ...(command.causationId === undefined ? {} : { causationId: command.causationId }),
    occurredAt: clock.now().toISOString(),
    actor: command.actor,
  };
}
/** 创建稳定的 CodingTask Aggregate 版本冲突错误。 */
export function codingTaskVersionConflict(
  expectedVersion: number,
  actualVersion: number,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.VersionConflict,
    "CodingTask Aggregate Version 已变化。",
    { expectedVersion: String(expectedVersion), actualVersion: String(actualVersion) },
  );
}
