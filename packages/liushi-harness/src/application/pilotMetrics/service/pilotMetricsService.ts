import type { PilotMetricsLocator } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  createPilotMetricsEnrollment,
  createPilotMetricsSettlement,
} from "#domain/pilotMetrics/index.js";
import { parseCodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import type {
  PilotMetricsApplicationDependencies,
  PilotMetricsEnrollmentResult,
  PilotMetricsReportResult,
  PilotMetricsSettlementResult,
} from "../contracts/index.js";
import { validatePilotMetricsSettlementBinding } from "../validation/index.js";
import { loadPilotMetricsBoundEvidence } from "./pilotMetricsEvidenceLoader.js";
import {
  createDescriptivePilotMetricsReport,
  createMissingEnrollmentReport,
  createMissingSettlementReport,
} from "./pilotMetricsReportFactory.js";

/** 管理 Pilot Enrollment、Settlement 与只读描述性报告。 */
export class PilotMetricsService {
  public constructor(private readonly dependencies: PilotMetricsApplicationDependencies) {}

  /** 在 Session Activation 前创建不可变 Enrollment。 */
  public async enroll(input: unknown): Promise<PilotMetricsEnrollmentResult> {
    const enrollment = createPilotMetricsEnrollment(input, this.dependencies.contentDigest);
    if (enrollment.status === ResultStatus.Failure) return enrollment;
    const locator = toLocator(enrollment.value);
    const existing = await this.dependencies.pilotMetricsStore.findEnrollment(locator);
    if (existing.status === ResultStatus.Failure) return existing;
    if (existing.value !== null) {
      return this.dependencies.pilotMetricsStore.createEnrollment(enrollment.value);
    }
    const activation = await this.dependencies.activationRepository.load(locator);
    if (activation.status === ResultStatus.Success) {
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Pilot Metrics Enrollment 必须在 Session Activation 前创建。",
        ),
      );
    }
    if (activation.error.code !== HarnessErrorCode.PreconditionNotMet) {
      return failure(activation.error);
    }
    return this.dependencies.pilotMetricsStore.createEnrollment(enrollment.value);
  }

  /** 在权威 Verification 形成后提交 Human 原始事实并绑定全部证据。 */
  public async settle(input: unknown): Promise<PilotMetricsSettlementResult> {
    const settlement = createPilotMetricsSettlement(input, this.dependencies.contentDigest);
    if (settlement.status === ResultStatus.Failure) return settlement;
    const locator = toLocator(settlement.value);
    const existing = await this.dependencies.pilotMetricsStore.findSettlement(locator);
    if (existing.status === ResultStatus.Failure) return existing;
    if (existing.value !== null) {
      return this.dependencies.pilotMetricsStore.createSettlement(settlement.value);
    }
    const enrollment = await this.dependencies.pilotMetricsStore.loadEnrollment(locator);
    if (enrollment.status === ResultStatus.Failure) return enrollment;
    const binding = validatePilotMetricsSettlementBinding(
      enrollment.value,
      settlement.value,
      this.dependencies.allowObservedHumanTouch ?? false,
    );
    if (binding.status === ResultStatus.Failure) return binding;
    const evidence = await loadPilotMetricsBoundEvidence(
      this.dependencies,
      enrollment.value,
      settlement.value,
    );
    if (evidence.status === ResultStatus.Failure) return evidence;
    return this.dependencies.pilotMetricsStore.createSettlement(settlement.value);
  }

  /** 查询单 Session 原始事实；不计算自动化率、HTT 降幅或跨任务聚合。 */
  public async report(locatorInput: {
    readonly workspaceId: string;
    readonly sessionId: string;
  }): Promise<PilotMetricsReportResult> {
    const locator = parseLocator(locatorInput);
    if (locator.status === ResultStatus.Failure) return locator;
    const enrollment = await this.dependencies.pilotMetricsStore.findEnrollment(locator.value);
    if (enrollment.status === ResultStatus.Failure) return enrollment;
    const settlement = await this.dependencies.pilotMetricsStore.findSettlement(locator.value);
    if (settlement.status === ResultStatus.Failure) return settlement;
    if (enrollment.value === null) {
      if (settlement.value !== null) {
        return failure(
          new HarnessError(
            HarnessErrorCode.CorruptStore,
            "Pilot Metrics Store 存在无 Enrollment 的孤立 Settlement。",
          ),
        );
      }
      return success(createMissingEnrollmentReport());
    }
    if (settlement.value === null) {
      return success(createMissingSettlementReport(enrollment.value));
    }
    const binding = validatePilotMetricsSettlementBinding(
      enrollment.value,
      settlement.value,
      this.dependencies.allowObservedHumanTouch ?? false,
    );
    if (binding.status === ResultStatus.Failure) return binding;
    const evidence = await loadPilotMetricsBoundEvidence(
      this.dependencies,
      enrollment.value,
      settlement.value,
    );
    if (evidence.status === ResultStatus.Failure) return evidence;
    return success(
      createDescriptivePilotMetricsReport(enrollment.value, settlement.value, evidence.value),
    );
  }
}

function toLocator(input: {
  readonly workspaceId: PilotMetricsLocator["workspaceId"];
  readonly sessionId: PilotMetricsLocator["sessionId"];
}): PilotMetricsLocator {
  return { workspaceId: input.workspaceId, sessionId: input.sessionId };
}

function parseLocator(input: {
  readonly workspaceId: string;
  readonly sessionId: string;
}): Result<PilotMetricsLocator, HarnessError> {
  const workspaceId = parseWorkspaceId(input.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return failure(workspaceId.error);
  const sessionId = parseCodingTaskSessionId(input.sessionId);
  if (sessionId.status === ResultStatus.Failure) return failure(sessionId.error);
  return success({ workspaceId: workspaceId.value, sessionId: sessionId.value });
}
