import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { ApprovalRecord, DecisionRequest } from "#domain/approval/index.js";
import type { ExecutorHostScope } from "#domain/executorCompatibility/index.js";
import type {
  ExecutorCompatibilityPublicationBundle,
  ExecutorCompatibilityReleaseSubject,
} from "#domain/executorCompatibilityPublication/index.js";
import type { GateId } from "#domain/policy/index.js";

import type {
  EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_TYPE,
  EXECUTOR_COMPATIBILITY_G6_APPROVAL_BINDING_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_PUBLISHER_IDENTITY_POLICY_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_CANDIDATE_SCHEMA_VERSION,
  IN_TOTO_STATEMENT_V1_TYPE,
} from "../constants/index.js";
import type {
  ExecutorCompatibilityCertificateIdentityKind,
  ExecutorCompatibilityPublicationTargetKind,
} from "../enums/index.js";

/** 发布者证书中必须存在且精确匹配的一项扩展。 */
export interface ExecutorCompatibilityPublisherCertificateExtension {
  /** X.509 对象标识符（Object Identifier）。 */
  readonly oid: string;
  /** 证书扩展中必须精确匹配的 UTF-8 值。 */
  readonly value: string;
}

/** 发布者证书 SAN 的精确身份。 */
export interface ExecutorCompatibilityPublisherCertificateIdentity {
  /** SAN 使用 URI 或 Email。 */
  readonly kind: ExecutorCompatibilityCertificateIdentityKind;
  /** 不使用正则表达式的精确 SAN 值。 */
  readonly value: string;
}

/** 计算 Publisher Identity Policy Digest 时排除自身字段的规范输入。 */
export interface ExecutorCompatibilityPublisherIdentityPolicyDigestInput {
  /** Publisher Identity Policy 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_PUBLISHER_IDENTITY_POLICY_SCHEMA_VERSION;
  /** 证书中必须精确匹配的 OIDC Issuer。 */
  readonly certificateIssuer: string;
  /** 证书中必须精确匹配的 SAN 身份。 */
  readonly certificateIdentity: ExecutorCompatibilityPublisherCertificateIdentity;
  /** 按 OID 稳定排序的证书扩展约束。 */
  readonly certificateExtensions: readonly ExecutorCompatibilityPublisherCertificateExtension[];
  /** 验证所需的最少 Certificate Transparency Log 证明数量。 */
  readonly ctLogThreshold: number;
  /** 验证所需的最少 Signature Transparency Log 证明数量。 */
  readonly tlogThreshold: number;
}

/** 安装方显式信任的固定发布者身份策略。 */
export interface ExecutorCompatibilityPublisherIdentityPolicy extends ExecutorCompatibilityPublisherIdentityPolicyDigestInput {
  /** 排除自身后对规范化策略计算的摘要。 */
  readonly identityPolicyDigest: ContentDigest;
}

/** Executor Compatibility Release 的精确外部目标。 */
export interface ExecutorCompatibilityPublicationTarget {
  /** 发布目标的封闭类别。 */
  readonly kind: ExecutorCompatibilityPublicationTargetKind;
  /** 不含凭据、Query 或 Fragment 的规范 HTTPS URI。 */
  readonly uri: string;
}

/** 计算 Release Candidate Digest 时排除自身字段的规范输入。 */
export interface ExecutorCompatibilityReleaseCandidateDigestInput {
  /** Release Candidate 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_RELEASE_CANDIDATE_SCHEMA_VERSION;
  /** 被批准的完整 Publication Bundle Digest。 */
  readonly bundleDigest: ContentDigest;
  /** 被批准的精确 Compatibility Matrix Digest。 */
  readonly matrixDigest: ContentDigest;
  /** 被批准的实际 npm Tarball Digest。 */
  readonly packageDigest: ContentDigest;
  /** 被批准的固定发布者身份策略 Digest。 */
  readonly publisherIdentityPolicyDigest: ContentDigest;
  /** 被批准的精确外部发布目标。 */
  readonly target: ExecutorCompatibilityPublicationTarget;
}

/** G6 Human Approval 唯一允许授权的不可变发布候选。 */
export interface ExecutorCompatibilityReleaseCandidate extends ExecutorCompatibilityReleaseCandidateDigestInput {
  /** 排除自身后对规范化 Candidate 计算的摘要。 */
  readonly candidateDigest: ContentDigest;
}

/** G6 Human Decision 与精确 Release Candidate 的不可变绑定。 */
export interface ExecutorCompatibilityG6ApprovalBinding {
  /** G6 Approval Binding 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_G6_APPROVAL_BINDING_SCHEMA_VERSION;
  /** 只允许 G6 Merge/Release Gate。 */
  readonly gate: GateId.G6MergeRelease;
  /** 已重新计算并匹配的 DecisionRequest Digest。 */
  readonly decisionRequestDigest: ContentDigest;
  /** 已重新计算并匹配的 ApprovalRecord Digest。 */
  readonly approvalRecordDigest: ContentDigest;
  /** DecisionRequest 与 ApprovalRecord 共同批准的 Candidate Digest。 */
  readonly releaseCandidateDigest: ContentDigest;
}

/** in-toto Statement 中不可变 Subject 的最小描述。 */
export interface ExecutorCompatibilityInTotoSubject {
  /** Statement 内唯一且稳定的 Subject 名称。 */
  readonly name: string;
  /** 不带算法前缀的 lowercase SHA-256 十六进制摘要。 */
  readonly digest: Readonly<{ sha256: string }>;
}

/** Executor Compatibility Release Attestation 的自定义 Predicate。 */
export interface ExecutorCompatibilityAttestationPredicate {
  /** Predicate 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_SCHEMA_VERSION;
  /** 获得 G6 Approval 的完整 Release Candidate。 */
  readonly releaseCandidate: ExecutorCompatibilityReleaseCandidate;
  /** Publication Bundle 中的包与源码来源。 */
  readonly releaseSubject: ExecutorCompatibilityReleaseSubject;
  /** Matrix 不允许外推的精确 Executor Host Scope。 */
  readonly executorScope: ExecutorHostScope;
  /** Candidate 引用的完整固定发布者身份策略。 */
  readonly publisherIdentityPolicy: ExecutorCompatibilityPublisherIdentityPolicy;
  /** Human 对精确 Candidate 的 G6 Approval 绑定。 */
  readonly g6Approval: ExecutorCompatibilityG6ApprovalBinding;
}

/** 交给 Sigstore DSSE 签名的 in-toto Statement v1。 */
export interface ExecutorCompatibilityAttestationStatement {
  /** in-toto Statement v1 的固定类型 URI。 */
  readonly _type: typeof IN_TOTO_STATEMENT_V1_TYPE;
  /** 固定绑定 Publication Bundle 与 npm Tarball 的两个 Subject。 */
  readonly subject: readonly [
    ExecutorCompatibilityInTotoSubject,
    ExecutorCompatibilityInTotoSubject,
  ];
  /** Liushi Executor Compatibility Predicate 的稳定类型 URI。 */
  readonly predicateType: typeof EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_TYPE;
  /** 自包含但尚未签名的发布声明。 */
  readonly predicate: ExecutorCompatibilityAttestationPredicate;
}

/** 创建 Publisher Identity Policy 所需的规范输入。 */
export type CreateExecutorCompatibilityPublisherIdentityPolicyInput =
  ExecutorCompatibilityPublisherIdentityPolicyDigestInput;

/** 创建 Release Candidate 所需的已复验输入。 */
export interface CreateExecutorCompatibilityReleaseCandidateInput {
  /** 已通过完整 Publication Bundle 校验的候选。 */
  readonly bundle: ExecutorCompatibilityPublicationBundle;
  /** 安装方准备信任的固定发布者身份策略。 */
  readonly publisherIdentityPolicy: ExecutorCompatibilityPublisherIdentityPolicy;
  /** Human 将要批准的精确发布目标。 */
  readonly target: ExecutorCompatibilityPublicationTarget;
}

/** 创建 G6 Approval Binding 所需的真实决策记录。 */
export interface CreateExecutorCompatibilityG6ApprovalBindingInput {
  /** Human 实际批准的不可变 Release Candidate。 */
  readonly releaseCandidate: ExecutorCompatibilityReleaseCandidate;
  /** Core 创建并绑定 Candidate Digest 的 DecisionRequest。 */
  readonly decisionRequest: DecisionRequest;
  /** Human 对该 DecisionRequest 创建的 ApprovalRecord。 */
  readonly approvalRecord: ApprovalRecord;
}

/** 创建未签名 Release Attestation Draft 所需的完整输入。 */
export interface CreateExecutorCompatibilityReleaseAttestationDraftInput {
  /** 已通过完整 Publication Bundle 校验的候选。 */
  readonly bundle: ExecutorCompatibilityPublicationBundle;
  /** 已通过自身摘要与结构校验的发布者身份策略。 */
  readonly publisherIdentityPolicy: ExecutorCompatibilityPublisherIdentityPolicy;
  /** 已通过自身摘要及 Bundle 绑定校验的 Release Candidate。 */
  readonly releaseCandidate: ExecutorCompatibilityReleaseCandidate;
  /** Core 创建并绑定 Candidate Digest 的 DecisionRequest。 */
  readonly decisionRequest: DecisionRequest;
  /** Human 对该 DecisionRequest 创建的 ApprovalRecord。 */
  readonly approvalRecord: ApprovalRecord;
}

/** P3a 生成且等待 Sigstore Adapter 签名的完整确定性 Draft。 */
export interface ExecutorCompatibilityReleaseAttestationDraft {
  /** Draft 绑定且已关闭式复验的 Publication Bundle。 */
  readonly bundle: ExecutorCompatibilityPublicationBundle;
  /** 固定发布者身份策略。 */
  readonly publisherIdentityPolicy: ExecutorCompatibilityPublisherIdentityPolicy;
  /** Human 已批准的精确 Release Candidate。 */
  readonly releaseCandidate: ExecutorCompatibilityReleaseCandidate;
  /** 已重算摘要并绑定 Candidate 的 G6 DecisionRequest。 */
  readonly decisionRequest: DecisionRequest;
  /** 已重算摘要且由 Human 明确批准的 ApprovalRecord。 */
  readonly approvalRecord: ApprovalRecord;
  /** Human Approval 与 Candidate 的不可变绑定。 */
  readonly g6Approval: ExecutorCompatibilityG6ApprovalBinding;
  /** 尚未签名的 in-toto Statement。 */
  readonly statement: ExecutorCompatibilityAttestationStatement;
}

/** Attestation Domain 使用的 RFC 8785 SHA-256 摘要端口。 */
export interface ExecutorCompatibilityAttestationDigestPort {
  /** 对 JSON-compatible 输入计算带算法前缀的规范摘要。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}
