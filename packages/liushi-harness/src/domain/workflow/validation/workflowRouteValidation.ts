import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import { findRequirementCellDefinition } from "../definition/index.js";
import type { WorkflowRouteDecision, WorkflowRouteInput } from "../contracts/index.js";
import {
  FailureTaxonomy,
  WorkflowCellKind,
  WorkflowKind,
  WorkflowRouteKind,
} from "../enums/index.js";

/** 校验 RequirementWorkflow 的固定 Cell 路由和失败分类绑定。 */
export function validateWorkflowRoute(
  input: WorkflowRouteInput,
): Result<WorkflowRouteDecision, HarnessError> {
  if (input.workflowKind !== WorkflowKind.Requirement) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "当前只实现 RequirementWorkflow 路由。", {
        workflowKind: String(input.workflowKind),
      }),
    );
  }
  const definition = findRequirementCellDefinition(input.currentCell);
  const targetDefinition = findRequirementCellDefinition(input.targetCell);
  if (definition === undefined || targetDefinition === undefined) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Workflow Cell 不属于当前 Definition。"),
    );
  }
  if (!definition.allowedNextCells.includes(input.targetCell)) {
    return invalidTransition(input, "目标 Cell 不在当前 Cell 的合法路由中。", {
      currentCell: input.currentCell,
      targetCell: input.targetCell,
    });
  }
  if (input.currentCell !== WorkflowCellKind.Verification && input.failureTaxonomy !== undefined) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "只有 Verification 路由可以携带失败分类。", {
        currentCell: input.currentCell,
      }),
    );
  }
  const routeKind = validateVerificationClassification(input);
  if (routeKind.status === ResultStatus.Failure) return routeKind;
  return success({
    workflowKind: input.workflowKind,
    currentCell: input.currentCell,
    targetCell: input.targetCell,
    routeKind: routeKind.value,
    ...(input.failureTaxonomy === undefined ? {} : { failureTaxonomy: input.failureTaxonomy }),
    requiresHuman: input.targetCell === WorkflowCellKind.HumanDecision,
  });
}

function validateVerificationClassification(
  input: WorkflowRouteInput,
): Result<WorkflowRouteKind, HarnessError> {
  if (input.currentCell !== WorkflowCellKind.Verification) {
    return success(WorkflowRouteKind.Forward);
  }
  if (input.targetCell === WorkflowCellKind.HumanDecision) {
    if (
      input.failureTaxonomy === FailureTaxonomy.EnvironmentFailure ||
      input.failureTaxonomy === FailureTaxonomy.OutcomeUnknown
    ) {
      return success(WorkflowRouteKind.HumanEscalation);
    }
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "HumanDecision 只接受环境失败或结果未知。", {
        actual: String(input.failureTaxonomy ?? "missing"),
      }),
    );
  }
  const expected = expectedVerificationFailure(input.targetCell);
  if (expected === undefined) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Verification 路由缺少失败分类。", {
        targetCell: input.targetCell,
      }),
    );
  }
  if (input.failureTaxonomy !== expected) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Verification 失败分类与目标 Cell 不匹配。", {
        expected: expected,
        actual: String(input.failureTaxonomy ?? "missing"),
      }),
    );
  }
  return success(
    expected === FailureTaxonomy.EnvironmentFailure || expected === FailureTaxonomy.OutcomeUnknown
      ? WorkflowRouteKind.HumanEscalation
      : expected === FailureTaxonomy.Passed
        ? WorkflowRouteKind.Forward
        : WorkflowRouteKind.FailureRecovery,
  );
}

function expectedVerificationFailure(targetCell: WorkflowCellKind): FailureTaxonomy | undefined {
  switch (targetCell) {
    case WorkflowCellKind.CodingTask:
      return FailureTaxonomy.ImplementationDefect;
    case WorkflowCellKind.ProductAlignment:
      return FailureTaxonomy.RequirementOrSolutionGap;
    case WorkflowCellKind.HumanDecision:
      return undefined;
    case WorkflowCellKind.IndependentReview:
      return FailureTaxonomy.Passed;
    case WorkflowCellKind.PrdIntake:
    case WorkflowCellKind.ContextAssembly:
    case WorkflowCellKind.RequirementAnalysis:
    case WorkflowCellKind.TechnicalSolution:
    case WorkflowCellKind.TestDesign:
    case WorkflowCellKind.Verification:
    case WorkflowCellKind.PrReady:
    case WorkflowCellKind.LearningCandidate:
      return undefined;
  }
}

function invalidTransition(
  input: WorkflowRouteInput,
  message: string,
  details: Readonly<Record<string, string>>,
): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidStateTransition, message, details));
}
