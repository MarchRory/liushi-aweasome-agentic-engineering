import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import {
  PilotAttestation,
  PilotExecutionMode,
  PilotHumanTouchSource,
  PilotStepOutcome,
  type PilotEnrollment,
  type PilotSettlement,
} from "#domain/pilotMetrics/index.js";

/** 复验 Settlement 与预登记分母、时间边界和来源声明。 */
export function validatePilotMetricsSettlementBinding(
  enrollment: PilotEnrollment,
  settlement: PilotSettlement,
  allowObservedHumanTouch: boolean,
): Result<void, HarnessError> {
  if (!hasSameIdentity(enrollment, settlement)) {
    return invalid("Settlement 与 Enrollment 的身份或摘要不一致。");
  }
  if (Date.parse(settlement.settledAt) < Date.parse(enrollment.enrolledAt)) {
    return invalid("Settlement 时间不得早于 Enrollment。");
  }
  const touch = validateHumanTouch(enrollment, settlement, allowObservedHumanTouch);
  if (touch !== null) return touch;
  const steps = validateSteps(enrollment, settlement);
  if (steps !== null) return steps;
  const plannedStepIds = new Set(enrollment.plannedSteps.map((step) => step.stepId));
  if (
    settlement.qualityFacts.some(
      (fact) => fact.stepId !== undefined && !plannedStepIds.has(fact.stepId),
    )
  ) {
    return invalid("Quality Fact 引用了未预登记的步骤。");
  }
  return success(undefined);
}

function hasSameIdentity(enrollment: PilotEnrollment, settlement: PilotSettlement): boolean {
  return (
    enrollment.pilotId === settlement.pilotId &&
    enrollment.workspaceId === settlement.workspaceId &&
    enrollment.sessionId === settlement.sessionId &&
    enrollment.codingTaskId === settlement.codingTaskId &&
    enrollment.repositoryId === settlement.repositoryId &&
    enrollment.recordDigest === settlement.enrollmentDigest
  );
}

function validateHumanTouch(
  enrollment: PilotEnrollment,
  settlement: PilotSettlement,
  allowObservedHumanTouch: boolean,
): Result<void, HarnessError> | null {
  if (
    !allowObservedHumanTouch &&
    settlement.humanTouchEntries.some((entry) => entry.source === PilotHumanTouchSource.Observed)
  ) {
    return invalid("当前调用边界无权写入 observed Human Touch。");
  }
  const enrollmentTime = Date.parse(enrollment.enrolledAt);
  const settlementTime = Date.parse(settlement.settledAt);
  if (
    settlement.humanTouchEntries.some(
      (entry) =>
        Date.parse(entry.startedAt) < enrollmentTime ||
        Date.parse(entry.completedAt) > settlementTime,
    )
  ) {
    return invalid("Human Touch 必须位于 Enrollment 与 Settlement 的闭合边界内。");
  }
  if (
    settlement.attestation === PilotAttestation.NotMeasured &&
    settlement.humanTouchEntries.length > 0
  ) {
    return invalid("not_measured Settlement 不得同时携带 Human Touch 区间。");
  }
  return null;
}

function validateSteps(
  enrollment: PilotEnrollment,
  settlement: PilotSettlement,
): Result<void, HarnessError> | null {
  const planned = new Map(enrollment.plannedSteps.map((step) => [step.stepId, step]));
  const actual = new Map(settlement.stepFacts.map((fact) => [fact.stepId, fact]));
  if (
    planned.size !== actual.size ||
    [...planned.keys()].some((stepId) => !actual.has(stepId)) ||
    [...actual.keys()].some((stepId) => !planned.has(stepId))
  ) {
    return invalid("Settlement 必须为每个预登记步骤提供且只提供一条事实。");
  }
  for (const [stepId, step] of planned) {
    const fact = actual.get(stepId);
    if (fact === undefined) return invalid("Settlement 缺少预登记步骤事实。");
    if (
      step.required &&
      (fact.outcome === PilotStepOutcome.Skipped ||
        fact.outcome === PilotStepOutcome.NotMeasured ||
        fact.actualExecutionMode === PilotExecutionMode.NotExecuted)
    ) {
      return invalid("Required 步骤不得标记为 skipped、not_measured 或 not_executed。");
    }
  }
  return null;
}

function invalid(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, message));
}
