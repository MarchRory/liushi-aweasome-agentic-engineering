import {
  PilotAttestation,
  PilotQualityFactKind,
  type PilotEnrollment,
  type PilotSettlement,
} from "#domain/pilotMetrics/index.js";
import { VerificationStatus } from "#domain/verification/index.js";

import type {
  PilotMetricsBoundEvidence,
  PilotMetricsEvidenceProjection,
  PilotMetricsReport,
} from "../contracts/index.js";
import {
  PilotMetricsClaimEligibility,
  PilotMetricsMissingFact,
  PilotMetricsReportStatus,
} from "../enums/index.js";

/** 为缺失 Enrollment 的 Session 构造稳定报告。 */
export function createMissingEnrollmentReport(): PilotMetricsReport {
  return {
    status: PilotMetricsReportStatus.NotMeasured,
    claimEligibility: PilotMetricsClaimEligibility.Blocked,
    missingFacts: [PilotMetricsMissingFact.Enrollment, PilotMetricsMissingFact.Settlement],
    enrollment: null,
    settlement: null,
    evidence: null,
  };
}

/** 为尚未 Settlement 的预登记 Session 构造稳定报告。 */
export function createMissingSettlementReport(enrollment: PilotEnrollment): PilotMetricsReport {
  return {
    status: PilotMetricsReportStatus.NotMeasured,
    claimEligibility: PilotMetricsClaimEligibility.Blocked,
    missingFacts: [PilotMetricsMissingFact.Settlement],
    enrollment,
    settlement: null,
    evidence: null,
  };
}

/** 从全部已验证原始事实构造单 Session 描述性报告。 */
export function createDescriptivePilotMetricsReport(
  enrollment: PilotEnrollment,
  settlement: PilotSettlement,
  boundEvidence: PilotMetricsBoundEvidence,
): PilotMetricsReport {
  return {
    status: PilotMetricsReportStatus.DescriptiveAvailable,
    claimEligibility: isClaimBlocked(settlement, boundEvidence)
      ? PilotMetricsClaimEligibility.Blocked
      : PilotMetricsClaimEligibility.DescriptiveOnly,
    missingFacts: [],
    enrollment,
    settlement,
    evidence: projectEvidence(boundEvidence),
  };
}

function projectEvidence(bound: PilotMetricsBoundEvidence): PilotMetricsEvidenceProjection {
  return {
    activationBindingDigest: bound.activation.bindingDigest,
    processEvidenceDigest: bound.processEvidence.evidenceDigest,
    checkpointBindingDigest: bound.checkpointBindingDigest,
    evidenceBundleDigest: bound.evidenceBundleDigest,
    verificationActionId: bound.verificationActionJournal.intent.actionId,
    verificationActionStatus: bound.verificationActionJournal.status,
    machineDurationMs: bound.processEvidence.durationMs,
    executorId: bound.processEvidence.executorId,
    executorVersion: bound.processEvidence.executorVersion,
    modelId: bound.processEvidence.modelId,
    permissionMode: bound.processEvidence.permissionMode,
    repositoryBaseRevision: bound.evidenceBundle.baseRevision,
    repositoryTargetRevision: bound.evidenceBundle.targetRevision,
    verificationStatus: bound.evidenceBundle.status,
  };
}

function isClaimBlocked(
  settlement: PilotSettlement,
  boundEvidence: PilotMetricsBoundEvidence,
): boolean {
  if (
    settlement.attestation !== PilotAttestation.Complete ||
    boundEvidence.evidenceBundle.status !== VerificationStatus.Passed
  ) {
    return true;
  }
  const blockingKinds = new Set([
    PilotQualityFactKind.EscapedDefect,
    PilotQualityFactKind.SecurityIncident,
    PilotQualityFactKind.PrivacyIncident,
    PilotQualityFactKind.OutcomeUnknown,
  ]);
  return settlement.qualityFacts.some((fact) => blockingKinds.has(fact.kind));
}
