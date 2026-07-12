import type { WorkflowCellDefinition, WorkflowDefinition } from "../contracts/index.js";
import { WorkflowCellKind, WorkflowKind } from "../enums/index.js";

const cells: readonly WorkflowCellDefinition[] = [
  { cell: WorkflowCellKind.PrdIntake, allowedNextCells: [WorkflowCellKind.ContextAssembly] },
  {
    cell: WorkflowCellKind.ContextAssembly,
    allowedNextCells: [WorkflowCellKind.RequirementAnalysis],
  },
  {
    cell: WorkflowCellKind.RequirementAnalysis,
    allowedNextCells: [WorkflowCellKind.ProductAlignment],
  },
  {
    cell: WorkflowCellKind.ProductAlignment,
    allowedNextCells: [WorkflowCellKind.TechnicalSolution],
  },
  {
    cell: WorkflowCellKind.TechnicalSolution,
    allowedNextCells: [WorkflowCellKind.TestDesign],
  },
  { cell: WorkflowCellKind.TestDesign, allowedNextCells: [WorkflowCellKind.CodingTask] },
  { cell: WorkflowCellKind.CodingTask, allowedNextCells: [WorkflowCellKind.Verification] },
  {
    cell: WorkflowCellKind.Verification,
    allowedNextCells: [
      WorkflowCellKind.CodingTask,
      WorkflowCellKind.ProductAlignment,
      WorkflowCellKind.HumanDecision,
      WorkflowCellKind.IndependentReview,
    ],
  },
  {
    cell: WorkflowCellKind.HumanDecision,
    allowedNextCells: [WorkflowCellKind.ProductAlignment],
  },
  {
    cell: WorkflowCellKind.IndependentReview,
    allowedNextCells: [WorkflowCellKind.PrReady],
  },
  { cell: WorkflowCellKind.PrReady, allowedNextCells: [WorkflowCellKind.LearningCandidate] },
  { cell: WorkflowCellKind.LearningCandidate, allowedNextCells: [] },
];

const definition: WorkflowDefinition = {
  kind: WorkflowKind.Requirement,
  cells,
};

/** 返回固定的 RequirementWorkflow Definition。 */
export function getRequirementWorkflowDefinition(): WorkflowDefinition {
  return definition;
}

/** 查找 RequirementWorkflow 中一个 Cell 的静态定义。 */
export function findRequirementCellDefinition(
  cell: WorkflowCellKind,
): WorkflowCellDefinition | undefined {
  return definition.cells.find((candidate) => candidate.cell === cell);
}
