import { join } from "node:path";

import { GATES, PILOT_METRICS_ENROLLMENT_NAME } from "../constants/index.mjs";
import {
  createCodexAgentPilotMetricsEnrollmentDraft,
  isSuccessfulPilotMetricsEnrollmentDisposition,
  validateCodexAgentPilotMetricsEnrollmentRecord,
} from "./pilotMetricsEnrollment.mjs";

/** 校验 Pilot 状态中 Enrollment 与已批准执行身份的绑定。 */
export function validateCodexAgentPilotMetricsEnrollmentState(state) {
  const approval = Array.isArray(state.approvals) ? state.approvals.at(-1) : undefined;
  const expectedDraft = createCodexAgentPilotMetricsEnrollmentDraft({
    fixedProject: state.fixedProject,
    task: state.task,
    profile: state.profile,
    identities: state.identities,
    manifest: state.activation?.manifest,
    enrolledAt: approval?.createdAt,
    actorId: state.actor?.humanActorId,
  });
  if (
    approval?.gate !== GATES.G4 ||
    state.metrics?.enrollmentFile !==
      join(state.paths?.controlRoot, PILOT_METRICS_ENROLLMENT_NAME) ||
    !isSuccessfulPilotMetricsEnrollmentDisposition(state.metrics?.disposition) ||
    state.effects?.metricsEnrollments !== 1
  ) {
    throw new Error("Pilot Metrics Enrollment 状态绑定无效。");
  }
  validateCodexAgentPilotMetricsEnrollmentRecord(state.metrics.enrollment, expectedDraft);
}
