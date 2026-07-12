import type { HarnessError, Result } from "#common/index.js";
import type {
  WorkflowAggregateRecord,
  WorkflowEventDraft,
  WorkflowId,
} from "#domain/workflow/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** Workflow Store 的稳定定位键。 */
export interface WorkflowLocator {
  /** Workflow 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** Workflow 稳定 ID。 */
  workflowId: WorkflowId;
}

/** 一次 Workflow Event Append 的输入。 */
export interface WorkflowEventAppendInput {
  /** Event 所属 Workflow。 */
  locator: WorkflowLocator;
  /** 调用方读取到的 Aggregate Version。 */
  expectedVersion: number;
  /** 已由 Application Policy 生成的 Event 草稿。 */
  event: WorkflowEventDraft;
}

/** Event Append 成功后的权威 Aggregate。 */
export interface WorkflowRepositoryAppendOutput {
  /** 由完整 Event Replay 得到的 Aggregate Record。 */
  record: WorkflowAggregateRecord;
}

/** Workflow 持久化与 Replay Port。 */
export interface WorkflowRepository {
  /** 读取完整 Event Log 并重建 Workflow Aggregate。 */
  load(locator: WorkflowLocator): Promise<Result<WorkflowAggregateRecord, HarnessError>>;
  /** 在乐观版本校验通过后提交一条 Semantic Event。 */
  append(
    input: WorkflowEventAppendInput,
  ): Promise<Result<WorkflowRepositoryAppendOutput, HarnessError>>;
}
