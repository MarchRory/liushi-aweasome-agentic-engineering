import type {
  ExecutorCompatibilitySigstoreBundleJson,
  ExecutorCompatibilityVerifiedSignerIdentity,
} from "#application/executorCompatibilityAttestation/index.js";
import type { ContentDigest } from "#common/index.js";
import type { ExecutorCompatibilityReleaseManifestAttestationDraft } from "#domain/executorCompatibilityReleaseManifestAttestation/index.js";

import type {
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_VERIFICATION_RECEIPT_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_SIGNED_RELEASE_MANIFEST_ARTIFACT_SCHEMA_VERSION,
} from "../constants/index.js";

/** 计算 Signed Manifest Artifact 摘要时排除自身字段的规范输入。 */
export interface ExecutorCompatibilitySignedReleaseManifestArtifactDigestInput {
  /** Signed Manifest Artifact 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_SIGNED_RELEASE_MANIFEST_ARTIFACT_SCHEMA_VERSION;
  /** 已重建 Manifest、Identity Policy 与独立 Human G6 的完整 Draft。 */
  readonly draft: ExecutorCompatibilityReleaseManifestAttestationDraft;
  /** Manifest in-toto Statement 的规范内容摘要。 */
  readonly statementDigest: ContentDigest;
  /** Signer Port 返回并由官方 Parser 负责密码学复验的 Bundle JSON。 */
  readonly sigstoreBundle: ExecutorCompatibilitySigstoreBundleJson;
  /** 完整 Sigstore Bundle JSON 的规范内容摘要。 */
  readonly sigstoreBundleDigest: ContentDigest;
}

/** 自包含 Manifest、G6 记录、Statement 与 Sigstore 材料的签名 Artifact。 */
export interface ExecutorCompatibilitySignedReleaseManifestArtifact extends ExecutorCompatibilitySignedReleaseManifestArtifactDigestInput {
  /** 排除自身字段后对完整 Artifact 计算的规范内容摘要。 */
  readonly artifactDigest: ContentDigest;
}

/** 创建 Signed Manifest Artifact 所需的最小输入。 */
export interface CreateExecutorCompatibilitySignedReleaseManifestArtifactInput {
  /** 已获独立 Human G6 Approval 的完整 Manifest Draft。 */
  readonly draft: ExecutorCompatibilityReleaseManifestAttestationDraft;
  /** Signer Port 返回的 Sigstore Bundle JSON。 */
  readonly sigstoreBundle: ExecutorCompatibilitySigstoreBundleJson;
}

/** 完整离线验证链成功后返回的窄审计回执。 */
export interface ExecutorCompatibilityReleaseManifestVerificationReceipt {
  /** Manifest 验证回执契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_VERIFICATION_RECEIPT_SCHEMA_VERSION;
  /** 已通过完整性与 DSSE 验证的 Signed Manifest Artifact 摘要。 */
  readonly manifestArtifactDigest: ContentDigest;
  /** 已通过 DSSE Payload 精确比较的 Manifest Statement 摘要。 */
  readonly manifestStatementDigest: ContentDigest;
  /** 已通过密码学验证的 Manifest Sigstore Bundle 摘要。 */
  readonly manifestSigstoreBundleDigest: ContentDigest;
  /** 调用方钉住且通过完整交叉验证的 Release Manifest 摘要。 */
  readonly manifestDigest: ContentDigest;
  /** 已通过真实 P3b 离线验证的 Signed Release Attestation Artifact 摘要。 */
  readonly releaseAttestationArtifactDigest: ContentDigest;
  /** 已通过真实 P3b 离线验证的 Release Statement 摘要。 */
  readonly releaseAttestationStatementDigest: ContentDigest;
  /** 已通过真实 P3b 离线验证的 Release Sigstore Bundle 摘要。 */
  readonly releaseAttestationSigstoreBundleDigest: ContentDigest;
  /** Human 在 P3a G6 中批准的 Release Candidate 摘要。 */
  readonly releaseCandidateDigest: ContentDigest;
  /** 从 Trust Profile 与签名 Release Subject 派生的 Identity Policy 摘要。 */
  readonly publisherIdentityPolicyDigest: ContentDigest;
  /** 已通过自身摘要复验的消费者 Trust Profile 摘要。 */
  readonly profileDigest: ContentDigest;
  /** 与 Trust Profile 精确匹配的显式 Trusted Root 摘要。 */
  readonly trustedRootDigest: ContentDigest;
  /** Manifest 证书中恢复并与派生策略精确匹配的发布者身份。 */
  readonly signerIdentity: ExecutorCompatibilityVerifiedSignerIdentity;
}
