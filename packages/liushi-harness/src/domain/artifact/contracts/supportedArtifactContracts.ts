import type {
  ProjectProfileProposal,
  ProjectProfileProposalArtifact,
} from "./profileProposalContracts.js";
import type {
  BusinessLogicChangeContractArtifact,
  BusinessLogicChangeContractProposal,
  PlanRiskArtifact,
  PlanRiskProposal,
  RequirementContractArtifact,
  RequirementContractProposal,
} from "./standardArtifactContracts.js";

/** 褰撳墠 Harness 鍒囩墖鏀寔鐨勬寮?Artifact union銆?*/
export type SupportedArtifact =
  | RequirementContractArtifact
  | BusinessLogicChangeContractArtifact
  | PlanRiskArtifact
  | ProjectProfileProposalArtifact;

/** 璁＄畻 Artifact Digest 鏃舵帓闄?digest 瀛楁鐨勮鑼冭緭鍏ャ€?*/
export type ArtifactDigestInput<TArtifact extends SupportedArtifact = SupportedArtifact> =
  TArtifact extends SupportedArtifact ? Omit<TArtifact, "digest"> : never;

/** 鍙敱涓嬩竴灞?Use Case 鎺ユ敹鐨?Proposal union銆?*/
export type ArtifactProposal =
  | RequirementContractProposal
  | BusinessLogicChangeContractProposal
  | PlanRiskProposal
  | ProjectProfileProposal;
