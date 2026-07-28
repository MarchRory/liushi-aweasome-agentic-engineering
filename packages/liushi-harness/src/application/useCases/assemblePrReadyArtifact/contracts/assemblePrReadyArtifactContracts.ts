import type { EvidenceBundleLocator } from "#application/ports/index.js";
import type { ContentDigest } from "#common/index.js";

/** 组装 PR-ready Artifact 所允许的唯一调用输入。 */
export interface AssemblePrReadyArtifactInput {
  /** CodingTask 所属 Workspace 标识。 */
  readonly workspaceId: EvidenceBundleLocator["workspaceId"];
  /** 已完成 CodingTask 的稳定标识。 */
  readonly codingTaskId: EvidenceBundleLocator["codingTaskId"];
  /** EvidenceBundle 的稳定 Verification Run 标识。 */
  readonly verificationRunId: EvidenceBundleLocator["verificationRunId"];
  /** 本次权威选择产生的 Verification Plan 摘要。 */
  readonly expectedPlanDigest: ContentDigest;
}
