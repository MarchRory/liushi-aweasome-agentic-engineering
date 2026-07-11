import type { Claim, EvidenceRef } from "#domain/evidence/index.js";
import type { GateId, RiskLevel } from "#domain/policy/index.js";

import type { ArtifactDigest } from "../digest/index.js";
import type { ArtifactStatus, ArtifactType } from "../enums/index.js";
import type { ArtifactEnvelope } from "./artifactEnvelopeContracts.js";

/** 宸叉彁浜?Requirement Contract Artifact銆?*/
export type RequirementContractArtifact = ArtifactEnvelope<
  ArtifactType.RequirementContract,
  RequirementContractPayload
>;

/** 宸叉彁浜?Business Logic Change Contract Artifact銆?*/
export type BusinessLogicChangeContractArtifact = ArtifactEnvelope<
  ArtifactType.BusinessLogicChangeContract,
  BusinessLogicChangeContractPayload
>;

/** 宸叉彁浜?PlanRisk Artifact銆?*/
export type PlanRiskArtifact = ArtifactEnvelope<ArtifactType.PlanRisk, PlanRiskPayload>;

/** Requirement Contract 鐨勪弗鏍?Payload銆?*/
export interface RequirementContractPayload {
  /** 褰撳墠浠诲姟瑕佽В鍐崇殑闂銆?*/
  problem: string;
  /** 褰撳墠浠诲姟鏄庣‘杩芥眰鐨勭洰鏍囥€?*/
  goals: readonly string[];
  /** 褰撳墠浠诲姟鏄庣‘涓嶈拷姹傜殑鐩爣銆?*/
  nonGoals: readonly string[];
  /** 鍙瀵熻涓哄眰闈㈢殑楠屾敹鎻忚堪銆?*/
  observableBehaviors: readonly string[];
  /** 鍙墽琛屾垨鍙鏌ョ殑楠屾敹鏍囧噯銆?*/
  acceptanceCriteria: readonly string[];
  /** 褰撳墠浠诲姟鍏佽鍖呭惈鐨勮寖鍥淬€?*/
  includedScopes: readonly string[];
  /** 褰撳墠浠诲姟绂佹瑙︾鐨勮寖鍥淬€?*/
  forbiddenScopes: readonly string[];
  /** 褰撳墠浠诲姟娑夊強鐨勪粨搴撴爣璇嗐€?*/
  repositories: readonly string[];
  /** 宸茶瘑鍒殑杈圭晫鍦烘櫙銆?*/
  edgeCases: readonly string[];
  /** 鍏煎鎬х害鏉熷拰涓嶅彲鐮村潖鐨勮涓恒€?*/
  compatibilityConstraints: readonly string[];
  /** 鏀拺闇€姹傚绾︾殑璇佹嵁銆?*/
  evidence: readonly EvidenceRef[];
  /** 闇€姹傚绾︿腑鐨勫０鏄庛€?*/
  claims: readonly Claim[];
  /** 灏氭湭纭浣嗗凡鏄惧紡璁板綍鐨勯棶棰樸€?*/
  unknowns: readonly string[];
  /** Human 宸插洖绛斿苟绾冲叆濂戠害鐨勯棶棰樸€?*/
  humanAnswers: readonly string[];
}

/** 涓氬姟閫昏緫褰撳墠琛屼负鐨勪簨瀹炰笌鎺ㄦ柇銆?*/
export interface BusinessLogicCurrentBehavior {
  /** 宸叉湁涓氬姟閫昏緫涓彲琚瘉鎹敮鎾戠殑浜嬪疄銆?*/
  facts: readonly Claim[];
  /** 鍩轰簬浜嬪疄鎺ㄥ鍑虹殑褰撳墠琛屼负鍒ゆ柇銆?*/
  inferences: readonly Claim[];
}

/** Business Logic Change Contract 鐨勪弗鏍?Payload銆?*/
export interface BusinessLogicChangeContractPayload {
  /** 鍙樻洿鍓嶄笟鍔￠€昏緫鐨勪簨瀹炰笌鎺ㄦ柇銆?*/
  currentBehavior: BusinessLogicCurrentBehavior;
  /** 鍙樻洿鍚庤鍒掑憟鐜扮殑涓氬姟琛屼负銆?*/
  plannedBehavior: readonly string[];
  /** 鏂版棫涓氬姟琛屼负涔嬮棿鐨勫樊寮傘€?*/
  differences: readonly string[];
  /** 鍙兘鍙楀埌褰卞搷鐨勮皟鐢ㄦ柟銆佺敤鎴锋垨绯荤粺銆?*/
  affectedConsumers: readonly string[];
  /** 鍙樻洿鍚庡繀椤讳繚鎸佹垚绔嬬殑涓嶅彉閲忋€?*/
  invariants: readonly string[];
  /** 涓氬姟閫昏緫鍙樻洿鐨勫洖閫€鏂瑰紡銆?*/
  rollback: readonly string[];
  /** 鏀拺涓氬姟閫昏緫濂戠害鐨勮瘉鎹€?*/
  evidence: readonly EvidenceRef[];
  /** 灏氭湭纭鐨勪笟鍔￠€昏緫闂銆?*/
  unknowns: readonly string[];
}

/** PlanRisk 涓殑鎵ц姝ラ銆?*/
export interface PlanRiskStep {
  /** 姝ラ鐨勭ǔ瀹氬簭鍙枫€?*/
  order: number;
  /** 姝ラ瑕佸畬鎴愮殑鍔ㄤ綔銆?*/
  action: string;
}

/** PlanRisk 涓殑椋庨櫓鏉＄洰銆?*/
export interface PlanRiskItem {
  /** 椋庨櫓鐨勭畝鐭弿杩般€?*/
  description: string;
  /** 椋庨櫓鐨勭紦瑙ｆ帾鏂姐€?*/
  mitigation: string;
}

/** PlanRisk 涓殑椋庨櫓鎿嶄綔鏉＄洰銆?*/
export interface RiskOperation {
  /** 椋庨櫓鎿嶄綔鐨勮矾寰勩€佸懡浠ゆ垨璧勬簮鍚嶇О銆?*/
  target: string;
  /** 璇ユ搷浣滀负浣曞叿鏈夐闄┿€?*/
  reason: string;
}

/** PlanRisk 鐨勪弗鏍?Payload銆?*/
export interface PlanRiskPayload {
  /** 璁″垝鎵ц鐨勬湁搴忔楠ゃ€?*/
  steps: readonly PlanRiskStep[];
  /** 璁″垝闇€瑕佽鍙栫殑鏂囦欢銆佺洰褰曟垨璧勬簮銆?*/
  readSet: readonly string[];
  /** 璁″垝鍏佽鍐欏叆鐨勬枃浠躲€佺洰褰曟垨璧勬簮銆?*/
  writeSet: readonly string[];
  /** 璁″垝宸茶瘑鍒殑椋庨櫓銆?*/
  risks: readonly PlanRiskItem[];
  /** 璁″垝澹版槑鐨勯闄╃瓑绾с€?*/
  riskLevel: RiskLevel;
  /** 褰撳墠璁″垝鏄惁娑夊強鍘嗗彶涓氬姟閫昏緫鍙樻洿銆?*/
  historicalLogicChange: boolean;
  /** 璁″垝鍖呭惈鐨勯珮椋庨櫓鎿嶄綔銆?*/
  riskOperations: readonly RiskOperation[];
  /** 璁″垝瀹屾垚鍚庣殑楠岃瘉鏂规銆?*/
  testPlan: readonly string[];
  /** 璁″垝澶辫触鎴栧洖閫€鏃剁殑澶勭悊鏂瑰紡銆?*/
  rollbackPlan: readonly string[];
  /** AI 璁や负闇€瑕佺殑 Gate锛涘悗缁?Core 浼氶噸鏂拌绠椼€?*/
  requiredGates: readonly GateId[];
  /** 鍘嗗彶涓氬姟閫昏緫鍙樻洿鎵€缁戝畾鐨?Business Logic Artifact Digest銆?*/
  businessLogicArtifactDigest?: ArtifactDigest;
}

/** Requirement Contract Proposal銆?*/
export interface RequirementContractProposal {
  /** Proposal 鐨?Artifact 绫诲瀷 discriminator銆?*/
  artifactType: ArtifactType.RequirementContract;
  /** Proposal 鍒濆鐘舵€侊紝浠呭厑璁?Proposed銆?*/
  status: ArtifactStatus.Proposed;
  /** Requirement Contract 鐨勪弗鏍?Payload銆?*/
  payload: RequirementContractPayload;
}

/** Business Logic Change Contract Proposal銆?*/
export interface BusinessLogicChangeContractProposal {
  /** Proposal 鐨?Artifact 绫诲瀷 discriminator銆?*/
  artifactType: ArtifactType.BusinessLogicChangeContract;
  /** Proposal 鍒濆鐘舵€侊紝浠呭厑璁?Proposed銆?*/
  status: ArtifactStatus.Proposed;
  /** Business Logic Change Contract 鐨勪弗鏍?Payload銆?*/
  payload: BusinessLogicChangeContractPayload;
}

/** PlanRisk Proposal銆?*/
export interface PlanRiskProposal {
  /** Proposal 鐨?Artifact 绫诲瀷 discriminator銆?*/
  artifactType: ArtifactType.PlanRisk;
  /** Proposal 鍒濆鐘舵€侊紝浠呭厑璁?Proposed銆?*/
  status: ArtifactStatus.Proposed;
  /** PlanRisk 鐨勪弗鏍?Payload銆?*/
  payload: PlanRiskPayload;
}
