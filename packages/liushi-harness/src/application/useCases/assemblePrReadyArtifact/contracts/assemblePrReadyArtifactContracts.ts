import type { EvidenceBundleLocator } from "#application/ports/index.js";

/** 组装 PR-ready Artifact 所允许的唯一调用输入。 */
export interface AssemblePrReadyArtifactInput {
  /** CodingTask 所属 Workspace 标识。 */
  readonly workspaceId: EvidenceBundleLocator["workspaceId"];
  /** 已完成 CodingTask 的稳定标识。 */
  readonly codingTaskId: EvidenceBundleLocator["codingTaskId"];
  /** EvidenceBundle 的稳定 Verification Run 标识。 */
  readonly verificationRunId: EvidenceBundleLocator["verificationRunId"];
}
