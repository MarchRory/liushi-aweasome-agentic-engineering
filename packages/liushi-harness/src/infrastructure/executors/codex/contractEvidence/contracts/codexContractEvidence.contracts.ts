import type {
  CodexContractEvidenceProjection as ApplicationCodexContractEvidenceProjection,
  ProjectCodexContractEvidenceInput as ApplicationProjectCodexContractEvidenceInput,
} from "#application/ports/codexContractEvidenceProjector/index.js";
import type { ContentDigest } from "#common/index.js";
import type {
  ExecutorCapability,
  ExecutorEvidenceOutcome,
  ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";

import type { CodexContractCheckOutcome } from "../enums/index.js";

/** 固定 Contract Case 的版本化定义。 */
export interface CodexContractCaseDefinition {
  /** 稳定且版本化的 Case 标识。 */
  readonly caseId: string;
  /** 该 Case 唯一证明的规范能力。 */
  readonly capability: ExecutorCapability;
  /** 按语义顺序固定的 Check 标识。 */
  readonly checkIds: readonly string[];
}

/** 可重算摘要的固定 Contract Suite 定义。 */
export interface CodexContractSuiteDefinition {
  /** Suite 的稳定标识。 */
  readonly suiteId: string;
  /** Suite 定义版本。 */
  readonly version: string;
  /** 按语义顺序固定的五个 Case。 */
  readonly cases: readonly CodexContractCaseDefinition[];
}

/** Artifact 中持久化的 Contract Suite 定义与摘要绑定。 */
export interface CodexContractSuiteDescriptor extends CodexContractSuiteDefinition {
  /** 排除自身后对完整 Suite Definition 计算的摘要。 */
  readonly definitionDigest: ContentDigest;
}

/** 一项固定 Check 的脱敏结果。 */
export interface CodexContractCheckResult {
  /** 与 Suite Definition 精确对应的 Check 标识。 */
  readonly checkId: string;
  /** Check 的机械结果。 */
  readonly outcome: CodexContractCheckOutcome;
}

/** 一个 Contract Case 的完整结果。 */
export interface CodexContractCaseResult {
  /** 与 Suite Definition 精确对应的 Case 标识。 */
  readonly caseId: string;
  /** 与 Suite Definition 精确对应的能力。 */
  readonly capability: ExecutorCapability;
  /** 仅由全部 Check 机械聚合出的结果。 */
  readonly outcome: ExecutorEvidenceOutcome;
  /** 按定义顺序保存的完整 Check 结果。 */
  readonly checks: readonly CodexContractCheckResult[];
}

/** 独立、严格且不承载原始 Hook Payload 的 Contract Evidence Artifact。 */
export interface CodexContractEvidenceArtifact {
  /** Artifact Schema 版本。 */
  readonly schemaVersion: string;
  /** 固定的 Managed File Mutation Hook Profile。 */
  readonly profileId: string;
  /** 从可信 Host Projector 接收的精确作用域。 */
  readonly scope: ExecutorHostScope;
  /** 可信 Host Artifact 的摘要绑定。 */
  readonly hostArtifactDigest: ContentDigest;
  /** 完整 Suite Definition 与其摘要。 */
  readonly suite: CodexContractSuiteDescriptor;
  /** 从可信 Host Evidence 继承的确定性观察锚点。 */
  readonly observationAnchor: string;
  /** 五个 Case 的完整脱敏结果。 */
  readonly caseResults: readonly CodexContractCaseResult[];
}

/** Infrastructure 与 Application 共享的受信输入类型。 */
export type ProjectCodexContractEvidenceInput = ApplicationProjectCodexContractEvidenceInput;

/** 带有严格 Artifact 类型的 Codex Contract Evidence 投影。 */
export interface CodexContractEvidenceProjection extends ApplicationCodexContractEvidenceProjection {
  /** 已通过严格 Schema 校验的 Contract Evidence Artifact。 */
  readonly artifact: CodexContractEvidenceArtifact;
}
