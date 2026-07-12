import { describe, expect, it } from "vitest";

import { ActorKind, ResultStatus } from "../../src/common/index.js";
import {
  FailureTaxonomy,
  WorkflowCellKind,
  WorkflowControlAction,
  WorkflowKind,
  WorkflowRouteKind,
  WorkflowRunState,
  getRequirementWorkflowDefinition,
  validateWorkflowControl,
  validateWorkflowRoute,
} from "../../src/domain/workflow/index.js";

describe("RequirementWorkflow Cell route policy", () => {
  it("按固定 Definition 允许完整正向链路", () => {
    const definition = getRequirementWorkflowDefinition();
    const cells = definition.cells.map((item) => item.cell);

    expect(definition.kind).toBe(WorkflowKind.Requirement);
    expect(cells).toEqual([
      WorkflowCellKind.PrdIntake,
      WorkflowCellKind.ContextAssembly,
      WorkflowCellKind.RequirementAnalysis,
      WorkflowCellKind.ProductAlignment,
      WorkflowCellKind.TechnicalSolution,
      WorkflowCellKind.TestDesign,
      WorkflowCellKind.CodingTask,
      WorkflowCellKind.Verification,
      WorkflowCellKind.HumanDecision,
      WorkflowCellKind.IndependentReview,
      WorkflowCellKind.PrReady,
      WorkflowCellKind.LearningCandidate,
    ]);

    const forwardRoutes = [
      [WorkflowCellKind.PrdIntake, WorkflowCellKind.ContextAssembly],
      [WorkflowCellKind.ContextAssembly, WorkflowCellKind.RequirementAnalysis],
      [WorkflowCellKind.RequirementAnalysis, WorkflowCellKind.ProductAlignment],
      [WorkflowCellKind.ProductAlignment, WorkflowCellKind.TechnicalSolution],
      [WorkflowCellKind.TechnicalSolution, WorkflowCellKind.TestDesign],
      [WorkflowCellKind.TestDesign, WorkflowCellKind.CodingTask],
      [WorkflowCellKind.CodingTask, WorkflowCellKind.Verification],
      [WorkflowCellKind.IndependentReview, WorkflowCellKind.PrReady],
      [WorkflowCellKind.PrReady, WorkflowCellKind.LearningCandidate],
    ] as const;

    for (const [currentCell, targetCell] of forwardRoutes) {
      const result = validateWorkflowRoute({
        workflowKind: WorkflowKind.Requirement,
        currentCell,
        targetCell,
      });
      expect(result.status).toBe(ResultStatus.Success);
      if (result.status === ResultStatus.Success) {
        expect(result.value.routeKind).toBe(WorkflowRouteKind.Forward);
        expect(result.value.requiresHuman).toBe(false);
      }
    }
  });

  it.each([
    [
      FailureTaxonomy.ImplementationDefect,
      WorkflowCellKind.CodingTask,
      WorkflowRouteKind.FailureRecovery,
    ],
    [
      FailureTaxonomy.RequirementOrSolutionGap,
      WorkflowCellKind.ProductAlignment,
      WorkflowRouteKind.FailureRecovery,
    ],
    [
      FailureTaxonomy.EnvironmentFailure,
      WorkflowCellKind.HumanDecision,
      WorkflowRouteKind.HumanEscalation,
    ],
    [
      FailureTaxonomy.OutcomeUnknown,
      WorkflowCellKind.HumanDecision,
      WorkflowRouteKind.HumanEscalation,
    ],
    [FailureTaxonomy.Passed, WorkflowCellKind.IndependentReview, WorkflowRouteKind.Forward],
  ])("按 FailureTaxonomy 路由 Verification: %s", (failureTaxonomy, targetCell, routeKind) => {
    const result = validateWorkflowRoute({
      workflowKind: WorkflowKind.Requirement,
      currentCell: WorkflowCellKind.Verification,
      targetCell,
      failureTaxonomy,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.routeKind).toBe(routeKind);
      expect(result.value.failureTaxonomy).toBe(failureTaxonomy);
      expect(result.value.requiresHuman).toBe(targetCell === WorkflowCellKind.HumanDecision);
    }
  });

  it("拒绝缺失、错配和绕过固定路由的验证结果", () => {
    const missing = validateWorkflowRoute({
      workflowKind: WorkflowKind.Requirement,
      currentCell: WorkflowCellKind.Verification,
      targetCell: WorkflowCellKind.CodingTask,
    });
    const mismatch = validateWorkflowRoute({
      workflowKind: WorkflowKind.Requirement,
      currentCell: WorkflowCellKind.Verification,
      targetCell: WorkflowCellKind.HumanDecision,
      failureTaxonomy: FailureTaxonomy.ImplementationDefect,
    });
    const bypass = validateWorkflowRoute({
      workflowKind: WorkflowKind.Requirement,
      currentCell: WorkflowCellKind.PrdIntake,
      targetCell: WorkflowCellKind.CodingTask,
    });

    expect(missing.status).toBe(ResultStatus.Failure);
    expect(mismatch.status).toBe(ResultStatus.Failure);
    expect(bypass.status).toBe(ResultStatus.Failure);
  });

  it("相同输入返回相同路由结果", () => {
    const input = {
      workflowKind: WorkflowKind.Requirement,
      currentCell: WorkflowCellKind.Verification,
      targetCell: WorkflowCellKind.CodingTask,
      failureTaxonomy: FailureTaxonomy.ImplementationDefect,
    } as const;

    expect(validateWorkflowRoute(input)).toEqual(validateWorkflowRoute(input));
  });
});

describe("Workflow Human control policy", () => {
  it.each([
    [WorkflowControlAction.Pause, WorkflowRunState.Active, WorkflowRunState.Paused],
    [WorkflowControlAction.Resume, WorkflowRunState.Paused, WorkflowRunState.Active],
    [WorkflowControlAction.Cancel, WorkflowRunState.Active, WorkflowRunState.Cancelled],
    [WorkflowControlAction.Cancel, WorkflowRunState.WaitingHuman, WorkflowRunState.Cancelled],
  ])("允许 Human 控制 %s", (action, currentState, nextState) => {
    const result = validateWorkflowControl({
      action,
      currentState,
      actorKind: ActorKind.Human,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.nextState).toBe(nextState);
      expect(result.value.requiresHuman).toBe(true);
    }
  });

  it("拒绝非 Human、终态和非法状态控制", () => {
    const agent = validateWorkflowControl({
      action: WorkflowControlAction.Pause,
      currentState: WorkflowRunState.Active,
      actorKind: ActorKind.Agent,
    });
    const completed = validateWorkflowControl({
      action: WorkflowControlAction.Cancel,
      currentState: WorkflowRunState.Completed,
      actorKind: ActorKind.Human,
    });
    const invalidResume = validateWorkflowControl({
      action: WorkflowControlAction.Resume,
      currentState: WorkflowRunState.WaitingHuman,
      actorKind: ActorKind.Human,
    });

    expect(agent).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: "operation_forbidden" },
    });
    expect(completed).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: "invalid_state_transition" },
    });
    expect(invalidResume).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: "invalid_state_transition" },
    });
  });
});
