import type { ActorRef, WORKFLOW_AGGREGATE_SCHEMA_VERSION } from "#common/index.js";
import type {
  ContextManifest,
  EffectiveRevisionSet,
  InputBindingSet,
} from "#domain/workflow/contracts/index.js";
import type {
  WorkflowCellKind,
  WorkflowKind,
  WorkflowRunState,
} from "#domain/workflow/enums/index.js";
import type { WorkflowId } from "#domain/workflow/identifiers/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** 可由 Workflow Event Replay 重建的 RequirementWorkflow Aggregate。 */
export interface RequirementWorkflowAggregate {
  /** Aggregate Schema 版本。 */
  schemaVersion: typeof WORKFLOW_AGGREGATE_SCHEMA_VERSION;
  /** Workflow 稳定 ID。 */
  workflowId: WorkflowId;
  /** Workflow 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 当前实现的 Workflow 类型。 */
  workflowKind: WorkflowKind.Requirement;
  /** 当前 Cell。 */
  currentCell: WorkflowCellKind;
  /** 当前运行状态。 */
  runState: WorkflowRunState;
  /** 已应用的 Event 数量。 */
  version: number;
  /** 创建 Workflow 的 Actor。 */
  createdBy: ActorRef;
  /** 创建时间。 */
  createdAt: string;
  /** 最近一次状态变化时间。 */
  updatedAt: string;
  /** 当前有效 Artifact Revision 集合。 */
  effectiveRevisionSet: EffectiveRevisionSet;
  /** 当前输入与 Artifact Revision 的绑定集合。 */
  inputBindingSet: InputBindingSet;
  /** 当前可重建的上下文来源清单。 */
  contextManifest: ContextManifest;
}

/** Workflow Aggregate 及其 Event Tail。 */
export interface WorkflowAggregateRecord {
  /** 由完整 Event Replay 得到的 Aggregate。 */
  aggregate: RequirementWorkflowAggregate;
  /** 已应用的最后 Event 序号。 */
  lastSequence: number;
  /** 已应用的最后 Event Hash。 */
  lastEventHash: string;
}
