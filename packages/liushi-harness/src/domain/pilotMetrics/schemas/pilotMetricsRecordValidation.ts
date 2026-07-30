import type { z } from "zod";

import type {
  PilotHumanTouchEntry,
  PilotPlannedStep,
  PilotQualityFact,
  PilotStepFact,
} from "../contracts/index.js";
import { PilotExecutionMode } from "../enums/index.js";

/** 校验 Enrollment 的步骤 ID 和预期执行方式。 */
export function validateEnrollment(
  value: { plannedSteps: readonly PilotPlannedStep[] },
  context: z.RefinementCtx,
): void {
  addDuplicateIssue(
    value.plannedSteps.map((step) => step.stepId),
    "plannedSteps.stepId",
    context,
  );
  value.plannedSteps.forEach((step, index) => {
    if (step.expectedExecutionMode === PilotExecutionMode.NotExecuted) {
      context.addIssue({
        code: "custom",
        path: ["plannedSteps", index, "expectedExecutionMode"],
        message: "预声明步骤不得使用 not_executed",
      });
    }
  });
}

/** 校验 Settlement 的 ID、Human Touch 区间和 settledAt。 */
export function validateSettlement(
  value: {
    humanTouchEntries: readonly PilotHumanTouchEntry[];
    stepFacts: readonly PilotStepFact[];
    qualityFacts: readonly (Omit<PilotQualityFact, "stepId"> & { stepId?: string | undefined })[];
    settledAt: string;
  },
  context: z.RefinementCtx,
): void {
  addDuplicateIssue(
    value.humanTouchEntries.map((entry) => entry.entryId),
    "humanTouchEntries.entryId",
    context,
  );
  addDuplicateIssue(
    value.stepFacts.map((fact) => fact.stepId),
    "stepFacts.stepId",
    context,
  );
  addDuplicateIssue(
    value.qualityFacts.map((fact) => fact.factId),
    "qualityFacts.factId",
    context,
  );
  const ordered = [...value.humanTouchEntries].sort(
    (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt),
  );
  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index];
    if (entry === undefined) continue;
    const duration = Date.parse(entry.completedAt) - Date.parse(entry.startedAt);
    if (entry.completedAt <= entry.startedAt || duration !== entry.durationMs) {
      context.addIssue({
        code: "custom",
        path: ["humanTouchEntries", index],
        message: "Human Touch 区间或 durationMs 无效",
      });
    }
    const previous = ordered[index - 1];
    if (previous !== undefined && Date.parse(entry.startedAt) < Date.parse(previous.completedAt)) {
      context.addIssue({
        code: "custom",
        path: ["humanTouchEntries", index],
        message: "Human Touch 区间重叠",
      });
    }
  }
  const latestCompletedAt = value.humanTouchEntries.reduce(
    (latest, entry) => Math.max(latest, Date.parse(entry.completedAt)),
    Number.NEGATIVE_INFINITY,
  );
  if (
    latestCompletedAt !== Number.NEGATIVE_INFINITY &&
    Date.parse(value.settledAt) < latestCompletedAt
  ) {
    context.addIssue({
      code: "custom",
      path: ["settledAt"],
      message: "settledAt 早于 Human Touch 区间结束",
    });
  }
}

/** 校验规范要求的毫秒精度 UTC 时间。 */
export function isIsoUtc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function addDuplicateIssue(
  values: readonly string[],
  path: string,
  context: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", path: path.split("."), message: "记录内 ID 必须唯一" });
  }
}
