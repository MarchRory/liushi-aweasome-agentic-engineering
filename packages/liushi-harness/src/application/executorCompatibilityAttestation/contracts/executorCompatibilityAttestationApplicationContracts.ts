import type { ContentDigest } from "#common/index.js";
import type {
  ExecutorCompatibilityPublisherCertificateExtension,
  ExecutorCompatibilityReleaseAttestationDraft,
} from "#domain/executorCompatibilityAttestation/index.js";

import type {
  EXECUTOR_COMPATIBILITY_ATTESTATION_VERIFICATION_RECEIPT_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_SIGNED_ATTESTATION_ARTIFACT_SCHEMA_VERSION,
} from "../constants/index.js";

/** 通过 Sigstore protobuf JSON 编码承载的签名 Bundle。 */
export type ExecutorCompatibilitySigstoreBundleJson = Readonly<Record<string, unknown>> & {
  /** Sigstore Bundle 的精确媒体类型。 */
  readonly mediaType: string;
};

/** 调用方通过受信通道提供的 Sigstore Trusted Root JSON。 */
export type ExecutorCompatibilityTrustedRootJson = Readonly<Record<string, unknown>> & {
  /** Sigstore Trusted Root 的精确媒体类型。 */
  readonly mediaType: string;
};

/** 计算签名 Artifact Digest 时排除自身字段的规范输入。 */
export interface ExecutorCompatibilitySignedAttestationArtifactDigestInput {
  /** 签名 Artifact 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_SIGNED_ATTESTATION_ARTIFACT_SCHEMA_VERSION;
  /** 已重新构建并通过 G6 关闭式复验的完整 Draft。 */
  readonly draft: ExecutorCompatibilityReleaseAttestationDraft;
  /** 待签名 in-toto Statement 的规范内容摘要。 */
  readonly statementDigest: ContentDigest;
  /** Sigstore 客户端生成并重新规范化的完整 Bundle JSON。 */
  readonly sigstoreBundle: ExecutorCompatibilitySigstoreBundleJson;
  /** 完整 Sigstore Bundle JSON 的规范内容摘要。 */
  readonly sigstoreBundleDigest: ContentDigest;
}

/** 自包含 G6 记录、Statement 与 Sigstore 验证材料的签名 Artifact。 */
export interface ExecutorCompatibilitySignedAttestationArtifact extends ExecutorCompatibilitySignedAttestationArtifactDigestInput {
  /** 排除自身后对完整 Artifact 计算的规范内容摘要。 */
  readonly artifactDigest: ContentDigest;
}

/** 创建签名 Artifact 所需的受信 Draft 与 Sigstore Bundle。 */
export interface CreateExecutorCompatibilitySignedAttestationArtifactInput {
  /** 已获 Human G6 Approval 的完整 Release Attestation Draft。 */
  readonly draft: ExecutorCompatibilityReleaseAttestationDraft;
  /** Signer Port 返回的 Sigstore Bundle JSON。 */
  readonly sigstoreBundle: ExecutorCompatibilitySigstoreBundleJson;
}

/** Sigstore Verifier 从证书中恢复的实际发布者身份。 */
export interface ExecutorCompatibilityVerifiedSignerIdentity {
  /** 实际证书中的 OIDC Issuer。 */
  readonly certificateIssuer: string;
  /** 实际证书中的 SAN URI 或 Email。 */
  readonly certificateIdentity: string;
  /** 实际证书中可供关闭式策略匹配的扩展。 */
  readonly certificateExtensions: readonly ExecutorCompatibilityPublisherCertificateExtension[];
}

/** 离线验证成功后返回的窄审计回执。 */
export interface ExecutorCompatibilityAttestationVerificationReceipt {
  /** 验证回执契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_ATTESTATION_VERIFICATION_RECEIPT_SCHEMA_VERSION;
  /** 已通过完整性复验的签名 Artifact Digest。 */
  readonly artifactDigest: ContentDigest;
  /** 已通过 DSSE Payload 精确比较的 Statement Digest。 */
  readonly statementDigest: ContentDigest;
  /** 已通过密码学验证的 Sigstore Bundle Digest。 */
  readonly sigstoreBundleDigest: ContentDigest;
  /** Human 实际批准的 Release Candidate Digest。 */
  readonly releaseCandidateDigest: ContentDigest;
  /** 安装方显式提供的 Trusted Root Digest。 */
  readonly trustedRootDigest: ContentDigest;
  /** 从签名证书恢复并精确匹配的发布者身份。 */
  readonly signerIdentity: ExecutorCompatibilityVerifiedSignerIdentity;
}
