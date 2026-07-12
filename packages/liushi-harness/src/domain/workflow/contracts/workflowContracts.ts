import type { ActorKind } from "#common/index.js";

import type {
  FailureTaxonomy,
  WorkflowCellKind,
  WorkflowControlAction,
  WorkflowKind,
  WorkflowRouteKind,
  WorkflowRunState,
} from "../enums/index.js";

/** 一个固定 Workflow Cell 的静态路由定义。 */
export interface WorkflowCellDefinition {
  /** 当前 Cell 类型。 */
  cell: WorkflowCellKind;
  /** 允许从当前 Cell 进入的目标 Cell。 */
  allowedNextCells: readonly WorkflowCellKind[];
}

/** 一个版本化 Workflow Definition 的不可变部分。 */
export interface WorkflowDefinition {
  /** Definition 所属 Workflow 类型。 */
  kind: WorkflowKind;
  /** 按固定顺序声明的全部 Cell。 */
  cells: readonly WorkflowCellDefinition[];
}

/** 一次 Workflow Cell 路由校验请求。 */
export interface WorkflowRouteInput {
  /** 当前 Workflow 类型。 */
  workflowKind: WorkflowKind;
  /** 当前所在 Cell。 */
  currentCell: WorkflowCellKind;
  /** 请求进入的目标 Cell。 */
  targetCell: WorkflowCellKind;
  /** Verification 失败时的精确分类。 */
  failureTaxonomy?: FailureTaxonomy;
}

/** 一次合法 Workflow 路由的确定性结果。 */
export interface WorkflowRouteDecision {
  /** 当前 Workflow 类型。 */
  workflowKind: WorkflowKind;
  /** 当前所在 Cell。 */
  currentCell: WorkflowCellKind;
  /** 获准进入的目标 Cell。 */
  targetCell: WorkflowCellKind;
  /** 路由语义分类。 */
  routeKind: WorkflowRouteKind;
  /** 触发本次路由的失败分类。 */
  failureTaxonomy?: FailureTaxonomy;
  /** 是否需要 Human 介入才能继续。 */
  requiresHuman: boolean;
}

/** 一次 Human Workflow 控制请求。 */
export interface WorkflowControlInput {
  /** Human 控制动作。 */
  action: WorkflowControlAction;
  /** 控制前的运行态。 */
  currentState: WorkflowRunState;
  /** 发起控制的 Actor 类型。 */
  actorKind: ActorKind;
}

/** 一次合法 Human 控制动作的确定性结果。 */
export interface WorkflowControlDecision {
  /** 已接受的控制动作。 */
  action: WorkflowControlAction;
  /** 控制前的运行态。 */
  currentState: WorkflowRunState;
  /** 控制后的运行态。 */
  nextState: WorkflowRunState;
  /** 当前动作需要 Human 身份。 */
  requiresHuman: true;
}
