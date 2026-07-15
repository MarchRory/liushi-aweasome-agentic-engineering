import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type Result,
} from "#common/index.js";
import { parseInstallPlanId } from "#domain/installation/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";

import type { ApplyInstallPlanInput, ValidatedApplyInstallPlanInput } from "../contracts/index.js";

/** 校验并品牌化 G0 Apply 的外部字符串输入。 */
export function validateApplyInstallPlanInput(
  input: ApplyInstallPlanInput,
): Result<ValidatedApplyInstallPlanInput, HarnessError> {
  const actorId = input.actorId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (actorId.length === 0 || idempotencyKey.length === 0)
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Apply actorId and idempotencyKey must be non-empty.",
      ),
    );
  const workspaceId = parseWorkspaceId(input.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const repositoryId = parseRepositoryId(input.repositoryId);
  if (repositoryId.status === ResultStatus.Failure) return repositoryId;
  const planId = parseInstallPlanId(input.planId);
  if (planId.status === ResultStatus.Failure) return planId;
  const planDigest = parseContentDigest(input.planDigest);
  if (planDigest.status === ResultStatus.Failure) return planDigest;
  return success({
    workspaceId: workspaceId.value,
    repositoryId: repositoryId.value,
    planId: planId.value,
    planDigest: planDigest.value,
    actorId,
    idempotencyKey,
  });
}
