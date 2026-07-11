import type { ClaimClassification, EvidenceKind } from "./evidenceEnums.js";

/** 可被 Claim 引用的证据条目。 */
export interface EvidenceRef {
  /** Evidence 在当前 Artifact Payload 内的稳定 ID。 */
  evidenceId: string;
  /** Evidence 的封闭来源类别。 */
  kind: EvidenceKind;
  /** Evidence 所属系统、仓库、命令或人工来源名称。 */
  source: string;
  /** 便于人工扫描的证据标题。 */
  title: string;
  /** 可选的文件路径、URL、提交哈希、命令摘要或外部定位符。 */
  locator?: string;
  /** 来源支持 Revision 时记录的不可变版本。 */
  revision?: string;
  /** Evidence 被观察或采集的 ISO 时间。 */
  observedAt?: string;
  /** 对实际采集内容计算的 Digest，不能用 Agent 摘要替代。 */
  contentDigest?: string;
}

/** 被契约明确陈述并可附带 Evidence 的声明。 */
export interface Claim {
  /** Claim 在当前 Artifact Payload 内的稳定 ID。 */
  claimId: string;
  /** Claim 的自然语言陈述。 */
  statement: string;
  /** Claim 对事实性或未知性的分类。 */
  classification: ClaimClassification;
  /** 支撑该 Claim 的 Evidence ID 列表。 */
  evidenceIds: readonly string[];
}
