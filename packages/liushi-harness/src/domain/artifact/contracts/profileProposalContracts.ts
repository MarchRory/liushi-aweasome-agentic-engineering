import type { ContentDigest } from "#common/index.js";
import type { RepositoryRole } from "#domain/projectDiscovery/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type { ArtifactStatus, ArtifactType } from "../enums/index.js";
import type { ArtifactEnvelope } from "./artifactEnvelopeContracts.js";

/** Project Profile Proposal 涓厑璁?Human 纭鐨?Repository 瑙掕壊銆?*/
export type ProjectProfileConfirmedRole = Exclude<RepositoryRole, RepositoryRole.Unknown>;

/** Human Profile Proposal 瀵瑰崟涓?Repository 鐨勫彲楠岃瘉閫夋嫨銆?*/
export interface ProjectProfileRepositorySelection {
  /** 琚‘璁ょ殑 Repository 绋冲畾 ID銆?*/
  repositoryId: RepositoryId;
  /** Repository Profile Candidate 缁戝畾鐨勬簮鐮佷慨璁€?*/
  repositoryRevision: string;
  /** 琚?Human 瀹￠槄鐨?Project Profile Candidate Digest銆?*/
  profileCandidateDigest: ContentDigest;
  /** Human 纭鐨?Repository 瑙掕壊锛屼笉鍏佽 Unknown銆?*/
  confirmedRole: ProjectProfileConfirmedRole;
  /** Human 鎺ュ彈鐨?Rule Candidate ID锛屾寜瀛楀吀搴忕ǔ瀹氭帓鍒椼€?*/
  acceptedRuleIds: readonly string[];
  /** Human 鎷掔粷鐨?Rule Candidate ID锛屾寜瀛楀吀搴忕ǔ瀹氭帓鍒椼€?*/
  rejectedRuleIds: readonly string[];
  /** Human 鎺ュ彈鐨?Architecture Mechanism Candidate ID锛屾寜瀛楀吀搴忕ǔ瀹氭帓鍒椼€?*/
  acceptedMechanismCandidateIds: readonly string[];
  /** Human 鎷掔粷鐨?Architecture Mechanism Candidate ID锛屾寜瀛楀吀搴忕ǔ瀹氭帓鍒椼€?*/
  rejectedMechanismCandidateIds: readonly string[];
}

/** Human Profile Proposal 鐨?Artifact Payload銆?*/
export interface ProjectProfileProposalPayload {
  /** Human 瀹￠槄鎵€缁戝畾鐨?Project Discovery Report Digest銆?*/
  discoveryReportDigest: ContentDigest;
  /** Human 瀹￠槄鎵€缁戝畾鐨?Workspace Graph Revision銆?*/
  workspaceGraphRevision: string;
  /** 鎸?Repository ID 绋冲畾鎺掑垪鐨?Profile 閫夋嫨闆嗗悎銆?*/
  repositorySelections: readonly ProjectProfileRepositorySelection[];
}

/** 宸叉彁浜ょ殑 Project Profile Proposal Artifact銆?*/
export type ProjectProfileProposalArtifact = ArtifactEnvelope<
  ArtifactType.ProjectProfileProposal,
  ProjectProfileProposalPayload
>;

/** Project Profile Proposal 杈撳叆銆?*/
export interface ProjectProfileProposal {
  /** Proposal 鐨?Artifact 绫诲瀷 discriminator銆?*/
  artifactType: ArtifactType.ProjectProfileProposal;
  /** Proposal 鍒濆鐘舵€侊紝浠呭厑璁?Proposed銆?*/
  status: ArtifactStatus.Proposed;
  /** Human Profile Proposal 鐨勪弗鏍?Payload銆?*/
  payload: ProjectProfileProposalPayload;
}

/** 璁＄畻 Project Profile Proposal Digest 鏃舵帓闄?digest 瀛楁鐨勮鑼冭緭鍏ャ€?*/
export type ProjectProfileProposalDigestInput = Omit<ProjectProfileProposalArtifact, "digest">;
