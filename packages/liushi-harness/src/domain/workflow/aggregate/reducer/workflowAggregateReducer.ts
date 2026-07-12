import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  WORKFLOW_AGGREGATE_SCHEMA_VERSION,
} from "#common/index.js";
import {
  validateWorkflowControl,
  validateWorkflowRoute,
} from "#domain/workflow/validation/index.js";
import type { WorkflowControlDecision, WorkflowRouteDecision } from "../../contracts/index.js";

import type {
  WorkflowCellRoutedEvent,
  WorkflowControlAppliedEvent,
  WorkflowCreatedEvent,
  WorkflowEvent,
} from "../../events/index.js";
import { WorkflowEventType } from "../../events/index.js";
import { WorkflowCellKind, WorkflowRunState } from "../../enums/index.js";
import type { RequirementWorkflowAggregate } from "#domain/workflow/aggregate/contracts/index.js";

/** 从 WorkflowCreated Event 建立初始 Aggregate。 */
export function createInitialWorkflowAggregate(
  event: WorkflowCreatedEvent,
): RequirementWorkflowAggregate {
  if (event.sequence !== 1) {
    throw corrupt("WorkflowCreated Event 必须是第一条 Event。", {
      sequence: String(event.sequence),
    });
  }
  if (
    event.payload.initialCell !== WorkflowCellKind.PrdIntake ||
    event.payload.initialState !== WorkflowRunState.Active
  ) {
    throw corrupt("WorkflowCreated Event 的初始 Cell 或状态不符合固定定义。", {});
  }
  return {
    schemaVersion: WORKFLOW_AGGREGATE_SCHEMA_VERSION,
    workflowId: event.workflowId,
    workspaceId: event.workspaceId,
    workflowKind: event.payload.workflowKind,
    currentCell: event.payload.initialCell,
    runState: event.payload.initialState,
    version: event.sequence,
    createdBy: event.actor,
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
    effectiveRevisionSet: event.payload.effectiveRevisionSet,
    inputBindingSet: event.payload.inputBindingSet,
    contextManifest: event.payload.contextManifest,
  };
}

/** 将一条已经完成 Schema 校验的 Event 应用到 Aggregate。 */
export function applyWorkflowEvent(
  aggregate: RequirementWorkflowAggregate,
  event: WorkflowEvent,
): RequirementWorkflowAggregate {
  assertEventTail(aggregate, event);
  switch (event.type) {
    case WorkflowEventType.WorkflowCreated:
      throw corrupt("已创建的 Workflow 不能再次应用 WorkflowCreated Event。", {});
    case WorkflowEventType.CellRouted:
      return applyCellRoute(aggregate, event);
    case WorkflowEventType.ControlApplied:
      return applyControl(aggregate, event);
  }
}

function applyCellRoute(
  aggregate: RequirementWorkflowAggregate,
  event: WorkflowCellRoutedEvent,
): RequirementWorkflowAggregate {
  if (aggregate.runState === WorkflowRunState.Paused) {
    throw invalidTransition("Paused Workflow 不允许执行 Cell 路由。", {});
  }
  if (
    aggregate.runState === WorkflowRunState.Completed ||
    aggregate.runState === WorkflowRunState.Cancelled
  ) {
    throw invalidTransition("终态 Workflow 不允许执行 Cell 路由。", {
      runState: aggregate.runState,
    });
  }
  if (
    aggregate.currentCell === WorkflowCellKind.HumanDecision &&
    (aggregate.runState !== WorkflowRunState.WaitingHuman || event.actor.kind !== ActorKind.Human)
  ) {
    throw new HarnessError(
      HarnessErrorCode.OperationForbidden,
      "HumanDecision 只能由 Human 完成决策后继续。",
      { actorKind: event.actor.kind, runState: aggregate.runState },
    );
  }
  if (
    aggregate.currentCell !== WorkflowCellKind.HumanDecision &&
    aggregate.runState !== WorkflowRunState.Active
  ) {
    throw invalidTransition("当前 Workflow 状态不允许执行 Cell 路由。", {
      runState: aggregate.runState,
    });
  }

  const decision = validateWorkflowRoute({
    workflowKind: aggregate.workflowKind,
    currentCell: event.payload.fromCell,
    targetCell: event.payload.toCell,
    ...(event.payload.failureTaxonomy === undefined
      ? {}
      : { failureTaxonomy: event.payload.failureTaxonomy }),
  });
  if (decision.status === ResultStatus.Failure) {
    throw corrupt("Cell 路由 Event 未通过固定 Workflow Policy。", decision.error.details);
  }
  assertRouteDecision(decision.value, event);

  return {
    ...aggregate,
    currentCell: event.payload.toCell,
    runState: routeState(event.payload.toCell),
    version: event.sequence,
    updatedAt: event.occurredAt,
  };
}

function applyControl(
  aggregate: RequirementWorkflowAggregate,
  event: WorkflowControlAppliedEvent,
): RequirementWorkflowAggregate {
  const decision = validateWorkflowControl({
    action: event.payload.action,
    currentState: aggregate.runState,
    actorKind: event.actor.kind,
  });
  if (decision.status === ResultStatus.Failure) {
    throw corrupt("Human 控制 Event 未通过固定 Workflow Policy。", decision.error.details);
  }
  assertControlDecision(decision.value, event);
  return {
    ...aggregate,
    runState: event.payload.toState,
    version: event.sequence,
    updatedAt: event.occurredAt,
  };
}

function routeState(targetCell: WorkflowCellKind): WorkflowRunState {
  if (targetCell === WorkflowCellKind.HumanDecision) return WorkflowRunState.WaitingHuman;
  if (targetCell === WorkflowCellKind.LearningCandidate) return WorkflowRunState.Completed;
  return WorkflowRunState.Active;
}

function assertEventTail(aggregate: RequirementWorkflowAggregate, event: WorkflowEvent): void {
  if (event.workflowId !== aggregate.workflowId || event.workspaceId !== aggregate.workspaceId) {
    throw corrupt("Workflow Event 不属于当前 Aggregate。", {});
  }
  if (event.sequence !== aggregate.version + 1) {
    throw corrupt("Workflow Event Sequence 不连续。", {
      expected: String(aggregate.version + 1),
      actual: String(event.sequence),
    });
  }
}

function assertRouteDecision(
  decision: WorkflowRouteDecision,
  event: WorkflowCellRoutedEvent,
): void {
  if (
    decision.currentCell !== event.payload.fromCell ||
    decision.targetCell !== event.payload.toCell ||
    decision.routeKind !== event.payload.routeKind ||
    decision.requiresHuman !== event.payload.requiresHuman ||
    decision.failureTaxonomy !== event.payload.failureTaxonomy
  ) {
    throw corrupt("Workflow Cell 路由 Event 与确定性 Policy 结果不一致。", {});
  }
}

function assertControlDecision(
  decision: WorkflowControlDecision,
  event: WorkflowControlAppliedEvent,
): void {
  if (
    decision.action !== event.payload.action ||
    decision.currentState !== event.payload.fromState ||
    decision.nextState !== event.payload.toState ||
    decision.requiresHuman !== event.payload.requiresHuman
  ) {
    throw corrupt("Workflow Human 控制 Event 与确定性 Policy 结果不一致。", {});
  }
}

function invalidTransition(
  message: string,
  details: Readonly<Record<string, string>>,
): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidStateTransition, message, details);
}

function corrupt(message: string, details: Readonly<Record<string, string>>): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message, details);
}
