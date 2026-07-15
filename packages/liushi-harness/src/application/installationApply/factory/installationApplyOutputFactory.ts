import { InstallationRevisionStatus } from "#domain/installation/index.js";
import type { InstallationApplyDisposition } from "#domain/installation/index.js";

import type { ApplyInstallPlanOutput } from "../contracts/index.js";
import type { CommittedInstallationRevisionState } from "../recovery/index.js";

/** 从已提交 Revision 生成稳定的 Apply 输出。 */
export function createInstallationApplyOutput(
  state: CommittedInstallationRevisionState,
  disposition: InstallationApplyDisposition,
  repositoryMutated: boolean,
): ApplyInstallPlanOutput {
  const plan = state.record.intent.plan;
  return {
    disposition,
    revisionId: state.record.revisionId,
    planId: plan.planId,
    planDigest: plan.planDigest,
    status: InstallationRevisionStatus.Committed,
    repositoryMutated,
  };
}
