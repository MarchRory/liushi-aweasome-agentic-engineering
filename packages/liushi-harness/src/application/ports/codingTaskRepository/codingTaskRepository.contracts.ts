import type { HarnessError, Result } from "#common/index.js";
import type {
  CodingTaskAggregateRecord,
  CodingTaskEventDraft,
  CodingTaskId,
} from "#domain/codingTask/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** CodingTask 的稳定定位键。 */
export interface CodingTaskLocator {
  /** Workspace 稳定标识。 */
  workspaceId: WorkspaceId;
  /** CodingTask 稳定标识。 */
  codingTaskId: CodingTaskId;
}

/** 一次 CodingTask Event 追加请求。 */
export interface CodingTaskEventAppendInput {
  /** Event 所属 CodingTask。 */
  locator: CodingTaskLocator;
  /** 调用方读取到的 Aggregate Version。 */
  expectedVersion: number;
  /** 由 Application Policy 生成的 Event Draft。 */
  event: CodingTaskEventDraft;
}

/** 追加成功后返回的 Aggregate Record。 */
export interface CodingTaskRepositoryAppendOutput {
  /** 完整 Event Replay 得到的 Aggregate Record。 */
  record: CodingTaskAggregateRecord;
}

/** CodingTask Event 持久化与 Replay Port。 */
export interface CodingTaskRepository {
  /** 读取完整 Event Log 并重建 CodingTask Aggregate。 */
  load(locator: CodingTaskLocator): Promise<Result<CodingTaskAggregateRecord, HarnessError>>;
  /** 在乐观版本校验通过后提交一条 Semantic Event。 */
  append(
    input: CodingTaskEventAppendInput,
  ): Promise<Result<CodingTaskRepositoryAppendOutput, HarnessError>>;
}
