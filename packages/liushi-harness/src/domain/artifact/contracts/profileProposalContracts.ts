import type { ContentDigest, PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION } from "#common/index.js";
import type { RepositoryRole } from "#domain/projectDiscovery/index.js";
import type { ProjectVerificationCheck } from "#domain/verification/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type { ArtifactStatus, ArtifactType } from "../enums/index.js";
import type { ArtifactEnvelope } from "./artifactEnvelopeContracts.js";

/** Project Profile Proposal 中由 Human 确认的仓库角色。 */
export type ProjectProfileConfirmedRole = Exclude<RepositoryRole, RepositoryRole.Unknown>;

/** Human 对单个仓库作出的 Project Profile 选择。 */
export interface ProjectProfileRepositorySelection {
  /** 目标仓库 ID。 */
  repositoryId: RepositoryId;
  /** 选择所绑定的仓库版本。 */
  repositoryRevision: string;
  /** Human 审核的 Project Profile Candidate 摘要。 */
  profileCandidateDigest: ContentDigest;
  /** Human 确认的仓库角色，不允许 Unknown。 */
  confirmedRole: ProjectProfileConfirmedRole;
  /** Human 接受的 Rule Candidate ID。 */
  acceptedRuleIds: readonly string[];
  /** Human 拒绝的 Rule Candidate ID。 */
  rejectedRuleIds: readonly string[];
  /** Human 接受的 Architecture Mechanism Candidate ID。 */
  acceptedMechanismCandidateIds: readonly string[];
  /** Human 拒绝的 Architecture Mechanism Candidate ID。 */
  rejectedMechanismCandidateIds: readonly string[];
  /** Human/G8 确认的项目验证检查。 */
  verificationChecks: readonly ProjectVerificationCheck[];
}

/** Human 确认的 Project Profile Proposal Payload。 */
export interface ProjectProfileProposalPayload {
  /** Payload Schema 版本。 */
  schemaVersion: typeof PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION;
  /** Human 审核的 Project Discovery Report 摘要。 */
  discoveryReportDigest: ContentDigest;
  /** Human 审核的 Workspace Graph 版本。 */
  workspaceGraphRevision: string;
  /** 按仓库 ID 排序的 Profile 选择。 */
  repositorySelections: readonly ProjectProfileRepositorySelection[];
}

/** 持久化的 Project Profile Proposal Artifact。 */
export type ProjectProfileProposalArtifact = ArtifactEnvelope<
  ArtifactType.ProjectProfileProposal,
  ProjectProfileProposalPayload
>;

/** 待持久化的 Project Profile Proposal。 */
export interface ProjectProfileProposal {
  /** Artifact 类型判别字段。 */
  artifactType: ArtifactType.ProjectProfileProposal;
  /** Proposal 只能处于 Proposed 状态。 */
  status: ArtifactStatus.Proposed;
  /** Human 确认的 Payload。 */
  payload: ProjectProfileProposalPayload;
}

/** 排除自引用 digest 的 Project Profile Proposal 摘要输入。 */
export type ProjectProfileProposalDigestInput = Omit<ProjectProfileProposalArtifact, "digest">;
