import type {
  ContextManifest,
  EffectiveRevisionSet,
  InputBindingSet,
  WorkflowCellKind,
  WorkflowControlAction,
  WorkflowKind,
  FailureTaxonomy,
} from "#domain/workflow/index.js";

/** 创建 RequirementWorkflow 的 Command Payload。 */
export interface CreateRequirementWorkflowPayload {
  /** Workflow 所属 Workspace。 */
  workspaceId: string;
  /** 当前仅允许创建 Requirement Workflow。 */
  workflowKind: WorkflowKind.Requirement;
  /** 显式绑定的有效 Artifact Revision。 */
  effectiveRevisionSet: EffectiveRevisionSet;
  /** 显式绑定的 Workflow 输入。 */
  inputBindingSet: InputBindingSet;
  /** 显式选择的 Repository、Wiki、Ticket 等上下文来源。 */
  contextManifest: ContextManifest;
}

/** 路由 RequirementWorkflow Cell 的 Command Payload。 */
export interface RouteWorkflowCellPayload {
  /** Workflow 所属 Workspace。 */
  workspaceId: string;
  /** 目标 Cell。 */
  targetCell: WorkflowCellKind;
  /** Verification 失败分类。 */
  failureTaxonomy?: FailureTaxonomy;
}

/** 控制 RequirementWorkflow 生命周期的 Command Payload。 */
export interface ControlWorkflowPayload {
  /** Workflow 所属 Workspace。 */
  workspaceId: string;
  /** Human 控制动作。 */
  action: WorkflowControlAction;
}

/** Workflow Command Payload 联合类型。 */
export type WorkflowCommandPayload =
  CreateRequirementWorkflowPayload | RouteWorkflowCellPayload | ControlWorkflowPayload;
