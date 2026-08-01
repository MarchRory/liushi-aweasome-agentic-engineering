import { PilotExecutionMode, PilotStepPhase, PilotTaskClass } from "../../../dist/index.js";

import { PILOT_CASE_METRICS_IDENTIFIER_PATTERN } from "./pilotCaseConstants.mjs";

/** 校验 Pilot Case 中由 Human 提供的量化分母。 */
export function normalizePilotCaseMetrics(input) {
  const record = requireRecord(input, "metrics");
  const plannedSteps = requirePlannedSteps(record.plannedSteps);
  return {
    pilotId: requireIdentifier(record.pilotId, "metrics.pilotId"),
    taskClass: requireEnum(record.taskClass, PilotTaskClass, "metrics.taskClass"),
    plannedSteps,
  };
}

function requirePlannedSteps(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("metrics.plannedSteps 至少需要一个预登记步骤。");
  }
  const steps = input.map((step, index) => {
    const record = requireRecord(step, `metrics.plannedSteps[${index}]`);
    const expectedExecutionMode = requireEnum(
      record.expectedExecutionMode,
      PilotExecutionMode,
      `metrics.plannedSteps[${index}].expectedExecutionMode`,
    );
    if (expectedExecutionMode === PilotExecutionMode.NotExecuted) {
      throw new Error("metrics.plannedSteps 不得预登记 not_executed。");
    }
    if (typeof record.required !== "boolean") {
      throw new Error(`metrics.plannedSteps[${index}].required 必须是布尔值。`);
    }
    return {
      stepId: requireIdentifier(record.stepId, `metrics.plannedSteps[${index}].stepId`),
      phase: requireEnum(record.phase, PilotStepPhase, `metrics.plannedSteps[${index}].phase`),
      required: record.required,
      expectedExecutionMode,
    };
  });
  if (new Set(steps.map((step) => step.stepId)).size !== steps.length) {
    throw new Error("metrics.plannedSteps.stepId 必须唯一。");
  }
  return steps;
}

function requireIdentifier(value, label) {
  if (typeof value !== "string" || !PILOT_CASE_METRICS_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${label} 不是安全标识符。`);
  }
  return value;
}

function requireEnum(value, enumType, label) {
  if (!Object.values(enumType).includes(value)) throw new Error(`${label} 不在允许枚举中。`);
  return value;
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象。`);
  }
  return value;
}
