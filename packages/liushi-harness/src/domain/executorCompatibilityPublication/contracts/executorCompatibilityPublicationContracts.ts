import type { ContentDigest } from "#common/index.js";
import type {
  ExecutorCapabilityEvidence,
  ExecutorCompatibilityDigestPort,
  ExecutorCompatibilityMatrix,
  ExecutorCompatibilityPolicy,
} from "#domain/executorCompatibility/index.js";

import type { EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SCHEMA_VERSION } from "../constants/index.js";

/** npm 发布物与源码来源的稳定身份。 */
export interface ExecutorCompatibilityReleaseSubject {
  /** npm 包名。 */
  readonly packageName: string;
  /** 精确 npm 包版本。 */
  readonly packageVersion: string;
  /** 实际 npm Tarball 的内容摘要。 */
  readonly packageDigest: ContentDigest;
  /** 规范化的 HTTPS 源码仓库 URI。 */
  readonly repositoryUri: string;
  /** 发布物对应的完整 Git Revision。 */
  readonly sourceRevision: string;
}

/** 可发布 Bundle 中的一项脱敏来源投影。 */
export interface ExecutorCompatibilityPublishedProjection {
  /** 已由来源 Projector 脱敏的 Artifact。 */
  readonly artifact: unknown;
  /** 脱敏 Artifact 的稳定内容摘要。 */
  readonly artifactDigest: ContentDigest;
  /** 由该 Artifact 投影且完成摘要绑定的 Evidence。 */
  readonly evidence: readonly ExecutorCapabilityEvidence[];
}

/** 尚未获得发布者身份的确定性兼容性发布候选。 */
export interface ExecutorCompatibilityPublicationBundle {
  /** Publication Bundle 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SCHEMA_VERSION;
  /** npm 发布物与源码来源。 */
  readonly releaseSubject: ExecutorCompatibilityReleaseSubject;
  /** 已由受信 Policy 编译并重新证明的 Matrix。 */
  readonly matrix: ExecutorCompatibilityMatrix;
  /** 编译 Matrix 时使用的完整受信 Policy。 */
  readonly policy: ExecutorCompatibilityPolicy;
  /** 按 Artifact Digest 稳定排序的完整脱敏 Projection。 */
  readonly projections: readonly ExecutorCompatibilityPublishedProjection[];
  /** 排除自身后对规范化 Bundle 内容计算的摘要。 */
  readonly bundleDigest: ContentDigest;
}

/** 创建 Publication Bundle 所需的已复验输入。 */
export interface CreateExecutorCompatibilityPublicationBundleInput {
  /** npm 发布物与源码来源。 */
  readonly releaseSubject: ExecutorCompatibilityReleaseSubject;
  /** 已重新证明的 Matrix。 */
  readonly matrix: ExecutorCompatibilityMatrix;
  /** 与 Matrix 精确绑定的受信 Policy。 */
  readonly policy: ExecutorCompatibilityPolicy;
  /** 已通过来源专属集合复验的 Projection。 */
  readonly projections: readonly ExecutorCompatibilityPublishedProjection[];
}

/** Publication Bundle 使用的摘要端口。 */
export type ExecutorCompatibilityPublicationDigestPort = ExecutorCompatibilityDigestPort;

/** 计算 Bundle Digest 时排除自身字段的规范输入。 */
export type ExecutorCompatibilityPublicationBundleDigestInput = Omit<
  ExecutorCompatibilityPublicationBundle,
  "bundleDigest"
>;
