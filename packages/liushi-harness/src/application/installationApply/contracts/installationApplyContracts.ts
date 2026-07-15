import type { ContentDigest } from "#common/index.js";
import type {
  InstallationApplyDisposition,
  InstallationRevisionId,
  InstallationRevisionStatus,
  InstallPlanId,
} from "#domain/installation/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

/** Human 对精确 InstallPlan 发起 G0 Apply 的外部输入。 */
export interface ApplyInstallPlanInput {
  /** 计划所属 Workspace。 */
  readonly workspaceId: string;
  /** 计划唯一写入的 Repository。 */
  readonly repositoryId: string;
  /** 已人工审阅的 InstallPlan ID。 */
  readonly planId: string;
  /** 已人工审阅的精确 InstallPlan 摘要。 */
  readonly planDigest: string;
  /** 发起批准的 Human 审计身份。 */
  readonly actorId: string;
  /** 同一批准重试时保持稳定的幂等键。 */
  readonly idempotencyKey: string;
}

/** 完成边界校验后的强类型 G0 Apply 输入。 */
export interface ValidatedApplyInstallPlanInput {
  /** 已校验且品牌化的 Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 已校验且品牌化的 Repository 标识。 */
  readonly repositoryId: RepositoryId;
  /** 已校验且品牌化的 InstallPlan 标识。 */
  readonly planId: InstallPlanId;
  /** 已校验且品牌化的 InstallPlan 摘要。 */
  readonly planDigest: ContentDigest;
  /** 已清理且非空的 Human 审计身份。 */
  readonly actorId: string;
  /** 已清理且非空的批准幂等键。 */
  readonly idempotencyKey: string;
}

/** G0 Apply 的稳定输出。 */
export interface ApplyInstallPlanOutput {
  /** 本次真正执行 Apply，或复用此前完成的同一批准。 */
  readonly disposition: InstallationApplyDisposition;
  /** 权威 Installation Revision。 */
  readonly revisionId: InstallationRevisionId;
  /** 被批准的 InstallPlan。 */
  readonly planId: InstallPlanId;
  /** 被批准的精确计划摘要。 */
  readonly planDigest: ContentDigest;
  /** 成功返回时固定为已提交。 */
  readonly status: InstallationRevisionStatus.Committed;
  /** 本次调用是否修改了 Repository。 */
  readonly repositoryMutated: boolean;
}
