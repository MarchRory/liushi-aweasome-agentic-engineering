import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import type { PilotEnrollment, PilotSettlement } from "#domain/pilotMetrics/index.js";

import type {
  PilotMetricsApplicationDependencies,
  PilotMetricsBoundEvidence,
} from "../contracts/index.js";
import { bindPilotMetricsEvidence } from "../validation/index.js";

/** 从权威 Store 加载并交叉验证单 Session 的全部机器证据。 */
export async function loadPilotMetricsBoundEvidence(
  dependencies: PilotMetricsApplicationDependencies,
  enrollment: PilotEnrollment,
  settlement: PilotSettlement,
): Promise<Result<PilotMetricsBoundEvidence, HarnessError>> {
  const locator = {
    workspaceId: enrollment.workspaceId,
    sessionId: enrollment.sessionId,
  };
  const activation = await dependencies.activationRepository.load(locator);
  if (activation.status === ResultStatus.Failure) return activation;
  const processEvidence = await dependencies.processEvidenceStore.load(locator);
  if (processEvidence.status === ResultStatus.Failure) return processEvidence;
  const closeoutState = await dependencies.closeoutStateStore.load(locator);
  if (closeoutState.status === ResultStatus.Failure) return closeoutState;
  const verificationActionJournal = await dependencies.actionJournalRepository.load({
    workspaceId: enrollment.workspaceId,
    taskId: activation.value.sourceTaskId,
    actionId: settlement.verificationActionId,
  });
  if (verificationActionJournal.status === ResultStatus.Failure) {
    return verificationActionJournal;
  }
  const evidenceBundle = await dependencies.evidenceBundleStore.load({
    workspaceId: enrollment.workspaceId,
    codingTaskId: enrollment.codingTaskId,
    verificationRunId: settlement.verificationRunId,
  });
  if (evidenceBundle.status === ResultStatus.Failure) return evidenceBundle;
  return bindPilotMetricsEvidence(
    enrollment,
    settlement,
    activation.value,
    processEvidence.value,
    closeoutState.value,
    evidenceBundle.value,
    verificationActionJournal.value,
    dependencies.contentDigest,
  );
}
