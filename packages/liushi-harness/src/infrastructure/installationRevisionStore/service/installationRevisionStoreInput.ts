import type {
  FindInstallationRevisionByApprovalInput,
  InstallationRevisionLocator,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
  type ContentDigest,
} from "#common/index.js";
import {
  parseInstallationRevisionId,
  parseInstallPlanId,
  type InstallationRevisionId,
  type InstallationRevisionIntent,
  type InstallPlanId,
} from "#domain/installation/index.js";
import {
  parseRepositoryId,
  parseWorkspaceId,
  type RepositoryId,
  type WorkspaceId,
} from "#domain/workspace/index.js";

/** 经过标识符解析的 Revision 定位输入。 */
export interface ValidatedInstallationRevisionLocator {
  /** Revision 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Revision 唯一写入的 Repository。 */
  readonly repositoryId: RepositoryId;
  /** 经过解析的 Revision ID。 */
  readonly revisionId: InstallationRevisionId;
}

/** 经过标识符和摘要解析的 approval 查询输入。 */
export type ValidatedApprovalLookup = FindInstallationRevisionByApprovalInput & {
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryId;
  readonly planId: InstallPlanId;
  readonly planDigest: ContentDigest;
};

/** 校验 Revision 定位输入中的 Workspace、Repository 和 Revision ID。 */
export function validateInstallationRevisionLocator(
  input: InstallationRevisionLocator,
): Result<ValidatedInstallationRevisionLocator, HarnessErrorType> {
  const workspaceId = parseWorkspaceId(input.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const repositoryId = parseRepositoryId(input.repositoryId);
  if (repositoryId.status === ResultStatus.Failure) return repositoryId;
  const revisionId = parseInstallationRevisionId(input.revisionId);
  return revisionId.status === ResultStatus.Failure
    ? revisionId
    : success({
        workspaceId: workspaceId.value,
        repositoryId: repositoryId.value,
        revisionId: revisionId.value,
      });
}

/** 校验 approval 查询的标识符、摘要和必填字符串。 */
export function validateInstallationRevisionApprovalLookup(
  input: FindInstallationRevisionByApprovalInput,
): Result<ValidatedApprovalLookup, HarnessErrorType> {
  const workspaceId = parseWorkspaceId(input.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const repositoryId = parseRepositoryId(input.repositoryId);
  if (repositoryId.status === ResultStatus.Failure) return repositoryId;
  const planId = parseInstallPlanId(input.planId);
  if (planId.status === ResultStatus.Failure) return planId;
  const planDigest = parseContentDigest(input.planDigest);
  if (planDigest.status === ResultStatus.Failure) return planDigest;
  if (input.actorId.length === 0 || input.idempotencyKey.length === 0)
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Approval actor and idempotency key are required.",
      ),
    );
  return success({
    ...input,
    workspaceId: workspaceId.value,
    repositoryId: repositoryId.value,
    planId: planId.value,
    planDigest: planDigest.value,
  });
}

/** 判断已加载 Intent 是否完全属于当前 approval 查询范围。 */
export function hasInstallationRevisionApprovalScope(
  intent: InstallationRevisionIntent,
  input: ValidatedApprovalLookup,
): boolean {
  return (
    intent.plan.workspaceId === input.workspaceId &&
    intent.plan.repositoryId === input.repositoryId &&
    intent.approval.planId === input.planId &&
    intent.approval.planDigest === input.planDigest &&
    intent.approval.actorId === input.actorId &&
    intent.approval.idempotencyKey === input.idempotencyKey
  );
}
