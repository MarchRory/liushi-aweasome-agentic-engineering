import type { ContentDigest } from "#common/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type { ArtifactDigest } from "./artifactDigest.js";
import type { ArtifactEnvelope } from "./artifactContracts.js";
import { ArtifactStatus, ArtifactType } from "./artifactEnums.js";

/** Project Profile Proposal 中允许 Human 确认的 Repository 角色。 */
export type ProjectProfileConfirmedRole =
  | "application"
  | "shared_infrastructure"
  | "library"
  | "contract"
  | "documentation";

/** Human Profile Proposal 对单个 Repository 的可验证选择。 */
export interface ProjectProfileRepositorySelection {
  /** 被确认的 Repository 稳定 ID。 */
  repositoryId: RepositoryId;
  /** Repository Profile Candidate 绑定的源码修订。 */
  repositoryRevision: string;
  /** 被 Human 审阅的 Project Profile Candidate Digest。 */
  profileCandidateDigest: ContentDigest;
  /** Human 确认的 Repository 角色，不允许 Unknown。 */
  confirmedRole: ProjectProfileConfirmedRole;
  /** Human 接受的 Rule Candidate ID，按字典序稳定排列。 */
  acceptedRuleIds: readonly string[];
  /** Human 拒绝的 Rule Candidate ID，按字典序稳定排列。 */
  rejectedRuleIds: readonly string[];
  /** Human 接受的 Architecture Mechanism Candidate ID，按字典序稳定排列。 */
  acceptedMechanismCandidateIds: readonly string[];
  /** Human 拒绝的 Architecture Mechanism Candidate ID，按字典序稳定排列。 */
  rejectedMechanismCandidateIds: readonly string[];
}

/** Human Profile Proposal 的 Artifact Payload。 */
export interface ProjectProfileProposalPayload {
  /** Human 审阅所绑定的 Project Discovery Report Digest。 */
  discoveryReportDigest: ContentDigest;
  /** Human 审阅所绑定的 Workspace Graph Revision。 */
  workspaceGraphRevision: string;
  /** 按 Repository ID 稳定排列的 Profile 选择集合。 */
  repositorySelections: readonly ProjectProfileRepositorySelection[];
}

/** 已提交的 Project Profile Proposal Artifact。 */
export type ProjectProfileProposalArtifact = ArtifactEnvelope<
  ArtifactType.ProjectProfileProposal,
  ProjectProfileProposalPayload
>;

/** Project Profile Proposal 输入。 */
export interface ProjectProfileProposal {
  /** Proposal 的 Artifact 类型 discriminator。 */
  artifactType: ArtifactType.ProjectProfileProposal;
  /** Proposal 初始状态，仅允许 Proposed。 */
  status: ArtifactStatus.Proposed;
  /** Human Profile Proposal 的严格 Payload。 */
  payload: ProjectProfileProposalPayload;
}

/** 计算 Project Profile Proposal Digest 时排除 digest 字段的规范输入。 */
export type ProjectProfileProposalDigestInput = Omit<ProjectProfileProposalArtifact, "digest">;
