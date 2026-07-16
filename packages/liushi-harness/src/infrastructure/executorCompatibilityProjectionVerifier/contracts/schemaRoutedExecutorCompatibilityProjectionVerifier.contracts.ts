import type { ExecutorCompatibilityEvidenceProjectionVerifierPort } from "#application/ports/index.js";
import type { ExecutorEvidenceKind } from "#domain/executorCompatibility/index.js";

/** 一个受支持 Artifact Schema 的精确 verifier 注册。 */
export interface ExecutorCompatibilityProjectionSchemaRegistration {
  /** 从 Artifact 本身读取并精确匹配的 Schema 版本。 */
  readonly schemaVersion: string;
  /** 完整 Projection 集合中该 Schema 必须出现的精确次数。 */
  readonly exactCount: number;
  /** 负责该 Schema 确定性重投影的来源专属 verifier。 */
  readonly verifier: ExecutorCompatibilityEvidenceProjectionVerifierPort;
}

/** 两种已验证 Projection 之间必须满足的父子绑定规则。 */
export interface ExecutorCompatibilityProjectionBindingRule {
  /** 被依赖来源的精确 Artifact Schema。 */
  readonly parentSchemaVersion: string;
  /** 声明父来源绑定的精确 Artifact Schema。 */
  readonly dependentSchemaVersion: string;
  /** dependent Artifact 中保存父 Artifact Digest 的字段。 */
  readonly dependentArtifactDigestField: string;
  /** dependent Artifact 中保存动态观察锚点的字段。 */
  readonly dependentObservationAnchorField: string;
  /** 父 Projection 中共同决定观察锚点的动态 Evidence 类型。 */
  readonly parentObservationKinds: readonly ExecutorEvidenceKind[];
}
