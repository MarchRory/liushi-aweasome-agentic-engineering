import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type {
  ExecutorHostScope,
  ExecutorSupportLevel,
} from "#domain/executorCompatibility/index.js";
import type {
  ExecutorCompatibilityReleaseAttestationDraft,
  ExecutorCompatibilityPublicationTarget,
} from "#domain/executorCompatibilityAttestation/index.js";
import type { ExecutorCompatibilityReleaseSubject } from "#domain/executorCompatibilityPublication/index.js";

import type { EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SCHEMA_VERSION } from "../constants/index.js";
import type { ExecutorCompatibilityReleaseArtifactKind } from "../enums/index.js";

/** Release Manifest 中一个可独立读取的 Artifact 引用。 */
export interface ExecutorCompatibilityReleaseArtifactReference {
  /** Artifact 的固定种类。 */
  readonly kind: ExecutorCompatibilityReleaseArtifactKind;
  /** 不带凭据、查询、片段和尾斜杠的 HTTPS 资源 URI。 */
  readonly uri: string;
  /** Artifact 内容的 SHA-256 摘要。 */
  readonly digest: ContentDigest;
  /** Artifact 的精确字节长度，必须是正安全整数。 */
  readonly byteLength: number;
}

/** 必须由 P3b 完整性校验结果提供的签名发布证明绑定。 */
export interface ExecutorCompatibilityVerifiedReleaseAttestationBinding {
  /** 已复验 Signed Release Attestation Artifact 的内容摘要。 */
  readonly artifactDigest: ContentDigest;
  /** 已复验 in-toto Statement 的内容摘要。 */
  readonly statementDigest: ContentDigest;
  /** 已复验 Sigstore Bundle 的内容摘要。 */
  readonly sigstoreBundleDigest: ContentDigest;
}

/** 排除自身摘要后用于 RFC 8785 摘要计算的 Manifest 输入。 */
export interface ExecutorCompatibilityReleaseManifestDigestInput {
  /** Manifest 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SCHEMA_VERSION;
  /** 可选的已接受前一份 Manifest 摘要。 */
  readonly predecessorManifestDigest?: ContentDigest;
  /** 发布包与源代码的稳定主体。 */
  readonly releaseSubject: ExecutorCompatibilityReleaseSubject;
  /** 精确的外部发布目标。 */
  readonly target: ExecutorCompatibilityPublicationTarget;
  /** G6 批准的 Release Candidate 摘要。 */
  readonly releaseCandidateDigest: ContentDigest;
  /** 发布者身份策略摘要。 */
  readonly publisherIdentityPolicyDigest: ContentDigest;
  /** 不得向其他版本或平台传播的 Executor Scope。 */
  readonly executorScope: ExecutorHostScope;
  /** Matrix 得出的支持等级。 */
  readonly supportLevel: ExecutorSupportLevel;
  /** 精确 Compatibility Matrix 摘要。 */
  readonly matrixDigest: ContentDigest;
  /** 未签名 in-toto Statement 的精确摘要。 */
  readonly attestationStatementDigest: ContentDigest;
  /** Sigstore Bundle 的内容摘要。 */
  readonly sigstoreBundleDigest: ContentDigest;
  /** 按固定 Artifact Kind 顺序排列的三个引用。 */
  readonly artifacts: readonly ExecutorCompatibilityReleaseArtifactReference[];
}

/** 完整的 Executor Compatibility Release Manifest。 */
export interface ExecutorCompatibilityReleaseManifest extends ExecutorCompatibilityReleaseManifestDigestInput {
  /** 排除自身字段后计算得到的 Manifest 摘要。 */
  readonly manifestDigest: ContentDigest;
}

/** 创建 Release Manifest 所需的最小输入。 */
export interface CreateExecutorCompatibilityReleaseManifestInput {
  /** 完整且已通过重建校验的 Release Attestation Draft。 */
  readonly draft: ExecutorCompatibilityReleaseAttestationDraft;
  /** npm Tarball 的 Artifact 引用。 */
  readonly packageTarball: ExecutorCompatibilityReleaseArtifactReference;
  /** Publication Bundle 的 Artifact 引用。 */
  readonly publicationBundle: ExecutorCompatibilityReleaseArtifactReference;
  /** 完整 Signed Release Attestation Artifact 的引用。 */
  readonly signedReleaseAttestation: ExecutorCompatibilityReleaseArtifactReference;
  /** 由 P3b 完整性校验结果派生的签名发布证明绑定。 */
  readonly verifiedAttestation: ExecutorCompatibilityVerifiedReleaseAttestationBinding;
  /** 可选的已接受前一份 Manifest 摘要。 */
  readonly predecessorManifestDigest?: ContentDigest;
}

/** Release Manifest 使用的 RFC 8785 SHA-256 摘要端口。 */
export interface ExecutorCompatibilityReleaseManifestDigestPort {
  /** 对 JSON-compatible 输入计算带 sha256 前缀的摘要。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}
