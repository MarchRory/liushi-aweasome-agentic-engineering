import type { HarnessError, Result, ContentDigest } from "#common/index.js";
import type {
  ExecutorCompatibilityPublisherCertificateExtension,
  ExecutorCompatibilityPublisherCertificateIdentity,
} from "#domain/executorCompatibilityAttestation/index.js";
import type { ExecutorCompatibilityReleaseSubject } from "#domain/executorCompatibilityPublication/index.js";
import type { ExecutorCompatibilityPublicationTarget } from "#domain/executorCompatibilityAttestation/index.js";
import type { ExecutorSupportLevel } from "#domain/executorCompatibility/index.js";

import type {
  EXECUTOR_COMPATIBILITY_PUBLISHER_TRUST_POLICY_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_SCHEMA_VERSION,
} from "../constants/index.js";

/** Publisher Trust Policy 中排除自身摘要的规范输入。 */
export interface ExecutorCompatibilityPublisherTrustPolicyDigestInput {
  /** Publisher Trust Policy 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_PUBLISHER_TRUST_POLICY_SCHEMA_VERSION;
  /** 证书中必须精确匹配的 OIDC Issuer。 */
  readonly certificateIssuer: string;
  /** 证书中必须精确匹配的 SAN 身份。 */
  readonly certificateIdentity: ExecutorCompatibilityPublisherCertificateIdentity;
  /** 证书中必须精确匹配的 Runner Environment。 */
  readonly runnerEnvironment: string;
  /** 验证所需的最少 Certificate Transparency Log 证明数量。 */
  readonly ctLogThreshold: number;
  /** 验证所需的最少 Signature Transparency Log 证明数量。 */
  readonly tlogThreshold: number;
  /** 可配置且不属于受管语义的稳定证书扩展。 */
  readonly additionalCertificateExtensions: readonly ExecutorCompatibilityPublisherCertificateExtension[];
}

/** 安装方稳定信任的 Publisher Trust Policy。 */
export interface ExecutorCompatibilityPublisherTrustPolicy extends ExecutorCompatibilityPublisherTrustPolicyDigestInput {
  /** 排除自身后的 Publisher Trust Policy 摘要。 */
  readonly publisherTrustPolicyDigest: ContentDigest;
}

/** 创建 Publisher Trust Policy 所需的输入。 */
export type CreateExecutorCompatibilityPublisherTrustPolicyInput = Omit<
  ExecutorCompatibilityPublisherTrustPolicyDigestInput,
  "schemaVersion"
>;

/** Trust Profile 中排除自身摘要的规范输入。 */
export interface ExecutorCompatibilityReleaseTrustProfileDigestInput {
  /** Trust Profile 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_SCHEMA_VERSION;
  /** 关闭式 ASCII 小写 Profile 标识。 */
  readonly profileId: string;
  /** 受信任的精确 npm 包名。 */
  readonly packageName: string;
  /** 受信任的规范源码仓库 URI。 */
  readonly repositoryUri: string;
  /** 受信任的精确发布目标。 */
  readonly target: ExecutorCompatibilityPublicationTarget;
  /** 不绑定具体 Release Revision 的稳定发布者授权策略。 */
  readonly publisherTrustPolicy: ExecutorCompatibilityPublisherTrustPolicy;
  /** 外部提供并单独校验的 Trusted Root 摘要。 */
  readonly trustedRootDigest: ContentDigest;
  /** 消费者允许接受的最低支持等级。 */
  readonly minimumSupportLevel: ExecutorSupportLevel;
  /** 首次安装时信任的 Bootstrap Manifest 摘要。 */
  readonly bootstrapManifestDigest: ContentDigest;
}

/** 完整的 Consumer Trust Profile。 */
export interface ExecutorCompatibilityReleaseTrustProfile extends ExecutorCompatibilityReleaseTrustProfileDigestInput {
  /** 排除自身后的 Trust Profile 摘要。 */
  readonly profileDigest: ContentDigest;
}

/** 创建 Trust Profile 所需的输入。 */
export type CreateExecutorCompatibilityReleaseTrustProfileInput = Omit<
  ExecutorCompatibilityReleaseTrustProfileDigestInput,
  "schemaVersion"
>;

/** 由 Trust Profile 为一个具体 Release 派生身份策略所需的输入。 */
export interface DeriveExecutorCompatibilityPublisherIdentityPolicyInput {
  /** 已通过摘要校验的 Trust Profile。 */
  readonly profile: ExecutorCompatibilityReleaseTrustProfile;
  /** Manifest 中携带的本次 Release Subject。 */
  readonly releaseSubject: ExecutorCompatibilityReleaseSubject;
}

/** 用于构建 Profile 摘要的无副作用端口。 */
export interface ExecutorCompatibilityReleaseTrustDigestPort {
  /** 对 JSON 兼容内容计算 RFC 8785 SHA-256 摘要。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}
