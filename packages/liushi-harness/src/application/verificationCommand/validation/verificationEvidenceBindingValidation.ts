import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import { validateEvidenceBundle, type EvidenceBundle } from "#domain/verification/index.js";

import type { ValidatedRunVerificationPayload } from "./verificationCommandValidation.js";

/** 在接纳 Verification 状态前校验 Evidence 与权威 Plan 的完整身份绑定。 */
export function validateVerificationEvidenceBinding(
  input: unknown,
  payload: ValidatedRunVerificationPayload,
  expectedPlanDigest: ContentDigest,
): Result<EvidenceBundle, HarnessError> {
  const evidence = validateEvidenceBundle(input);
  if (evidence.status === ResultStatus.Failure) return evidence;
  const plan = payload.plan;
  if (
    evidence.value.verificationRunId !== payload.verificationRunId ||
    evidence.value.planId !== plan.planId ||
    evidence.value.repositoryId !== plan.repositoryId ||
    evidence.value.worktreeId !== plan.worktreeId ||
    evidence.value.baseRevision !== plan.baseRevision ||
    evidence.value.targetRevision !== plan.targetRevision ||
    evidence.value.planDigest !== expectedPlanDigest
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "EvidenceBundle 与本次权威 Verification Plan 不匹配。",
      ),
    );
  }
  return success(evidence.value);
}
