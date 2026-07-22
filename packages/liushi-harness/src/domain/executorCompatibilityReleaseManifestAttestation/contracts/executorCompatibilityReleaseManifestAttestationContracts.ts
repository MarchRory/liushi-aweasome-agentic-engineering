import type { ContentDigest } from "#common/index.js";
import type { ApprovalRecord, DecisionRequest } from "#domain/approval/index.js";
import type {
  ExecutorCompatibilityInTotoSubject,
  ExecutorCompatibilityInTotoStatement,
  ExecutorCompatibilityPublisherIdentityPolicy,
  IN_TOTO_STATEMENT_V1_TYPE,
} from "#domain/executorCompatibilityAttestation/index.js";
import type {
  ExecutorCompatibilityReleaseManifest,
  ExecutorCompatibilityReleaseManifestDigestPort,
} from "#domain/executorCompatibilityReleaseManifest/index.js";
import type { GateId } from "#domain/policy/index.js";

import type {
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_TYPE,
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_G6_APPROVAL_BINDING_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SUBJECT_NAME,
} from "../constants/index.js";

/** Release Manifest 专用的 G6 Approval Binding。 */
export interface ExecutorCompatibilityReleaseManifestG6ApprovalBinding {
  /** 独立的 Manifest G6 Binding 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_G6_APPROVAL_BINDING_SCHEMA_VERSION;
  /** 只允许 G6 Merge/Release Gate。 */
  readonly gate: GateId.G6MergeRelease;
  /** 已重算且匹配的 DecisionRequest Digest。 */
  readonly decisionRequestDigest: ContentDigest;
  /** 已重算且匹配的 ApprovalRecord Digest。 */
  readonly approvalRecordDigest: ContentDigest;
  /** G6 记录共同批准的 Manifest Digest。 */
  readonly manifestDigest: ContentDigest;
}

/** Release Manifest Attestation 的完整 Predicate。 */
export interface ExecutorCompatibilityReleaseManifestAttestationPredicate {
  /** 独立的 Manifest Predicate 契约版本。 */
  readonly schemaVersion: typeof EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_SCHEMA_VERSION;
  /** 完整且已复验自身摘要的 Release Manifest。 */
  readonly manifest: ExecutorCompatibilityReleaseManifest;
  /** 完整且已复验自身摘要的 Publisher Identity Policy。 */
  readonly publisherIdentityPolicy: ExecutorCompatibilityPublisherIdentityPolicy;
  /** 独立的 Manifest G6 Approval Binding。 */
  readonly g6Approval: ExecutorCompatibilityReleaseManifestG6ApprovalBinding;
}

/** Release Manifest Attestation 的单一 in-toto Subject。 */
export interface ExecutorCompatibilityReleaseManifestAttestationSubject extends ExecutorCompatibilityInTotoSubject {
  /** Subject 名称固定为 Release Manifest。 */
  readonly name: typeof EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SUBJECT_NAME;
}

/** Release Manifest Attestation 使用的单 Subject in-toto Statement。 */
export interface ExecutorCompatibilityReleaseManifestAttestationStatement extends ExecutorCompatibilityInTotoStatement {
  /** in-toto Statement v1 固定类型 URI。 */
  readonly _type: typeof IN_TOTO_STATEMENT_V1_TYPE;
  /** 只允许唯一 Manifest Subject。 */
  readonly subject: readonly [ExecutorCompatibilityReleaseManifestAttestationSubject];
  /** 独立的 Manifest Predicate 类型 URI。 */
  readonly predicateType: typeof EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ATTESTATION_PREDICATE_TYPE;
  /** 完整 Manifest、Identity Policy 与 G6 Binding。 */
  readonly predicate: ExecutorCompatibilityReleaseManifestAttestationPredicate;
}

/** Release Manifest Attestation Statement 校验所需的受信上下文。 */
export interface ExecutorCompatibilityReleaseManifestAttestationStatementContext {
  /** 已通过 Manifest Integrity 校验的 Manifest。 */
  readonly manifest: ExecutorCompatibilityReleaseManifest;
  /** 已通过自身摘要校验的 Identity Policy。 */
  readonly publisherIdentityPolicy: ExecutorCompatibilityPublisherIdentityPolicy;
  /** 必须由 Statement Validator 重算的原始 DecisionRequest。 */
  readonly decisionRequest: DecisionRequest;
  /** 必须由 Statement Validator 重算的原始 Human ApprovalRecord。 */
  readonly approvalRecord: ApprovalRecord;
}

/** 从已复验记录创建 Manifest G6 Binding 值的内部输入。 */
export interface CreateExecutorCompatibilityReleaseManifestG6ApprovalBindingValueInput {
  /** 被批准的精确 Manifest 摘要。 */
  readonly manifestDigest: ContentDigest;
  /** 已重算的 DecisionRequest 摘要。 */
  readonly decisionRequestDigest: ContentDigest;
  /** 已重算的 ApprovalRecord 摘要。 */
  readonly approvalRecordDigest: ContentDigest;
}

/** 创建 Manifest-specific G6 Binding 所需的输入。 */
export interface CreateExecutorCompatibilityReleaseManifestG6ApprovalBindingInput {
  /** G6 审批绑定的完整 Manifest。 */
  readonly manifest: ExecutorCompatibilityReleaseManifest;
  /** Core 创建的 DecisionRequest。 */
  readonly decisionRequest: DecisionRequest;
  /** Human 创建的 ApprovalRecord。 */
  readonly approvalRecord: ApprovalRecord;
}

/** 创建 Manifest Attestation Draft 所需的完整输入。 */
export interface CreateExecutorCompatibilityReleaseManifestAttestationDraftInput {
  /** 完整且已通过自身摘要校验的 Release Manifest。 */
  readonly manifest: ExecutorCompatibilityReleaseManifest;
  /** 完整且已通过自身摘要校验的 Publisher Identity Policy。 */
  readonly publisherIdentityPolicy: ExecutorCompatibilityPublisherIdentityPolicy;
  /** Core 创建的 DecisionRequest。 */
  readonly decisionRequest: DecisionRequest;
  /** Human 创建的 ApprovalRecord。 */
  readonly approvalRecord: ApprovalRecord;
}

/** Release Manifest Attestation 的可持久化 Draft。 */
export interface ExecutorCompatibilityReleaseManifestAttestationDraft extends CreateExecutorCompatibilityReleaseManifestAttestationDraftInput {
  /** 独立的 Manifest G6 Approval Binding。 */
  readonly g6Approval: ExecutorCompatibilityReleaseManifestG6ApprovalBinding;
  /** 尚未签名的单 Subject in-toto Statement。 */
  readonly statement: ExecutorCompatibilityReleaseManifestAttestationStatement;
}

/** Manifest Attestation 复用的 RFC 8785 SHA-256 摘要端口。 */
export type ExecutorCompatibilityReleaseManifestAttestationDigestPort =
  ExecutorCompatibilityReleaseManifestDigestPort;
