/** Executor Compatibility 发布者身份策略的契约版本。 */
export const EXECUTOR_COMPATIBILITY_PUBLISHER_IDENTITY_POLICY_SCHEMA_VERSION =
  "liushi.executor-compatibility-publisher-identity-policy.v1";

/** Executor Compatibility 发布候选的契约版本。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_CANDIDATE_SCHEMA_VERSION =
  "liushi.executor-compatibility-release-candidate.v1";

/** Executor Compatibility G6 审批绑定的契约版本。 */
export const EXECUTOR_COMPATIBILITY_G6_APPROVAL_BINDING_SCHEMA_VERSION =
  "liushi.executor-compatibility-g6-approval-binding.v1";

/** Executor Compatibility Attestation Predicate 的契约版本。 */
export const EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_SCHEMA_VERSION =
  "liushi.executor-compatibility-attestation-predicate.v1";

/** in-toto Statement v1 的固定类型 URI。 */
export const IN_TOTO_STATEMENT_V1_TYPE = "https://in-toto.io/Statement/v1";

/** Sigstore DSSE Attestation 使用的 in-toto Payload Type。 */
export const IN_TOTO_ATTESTATION_PAYLOAD_TYPE = "application/vnd.in-toto+json";

/** Liushi Executor Compatibility Predicate 的稳定类型 URI。 */
export const EXECUTOR_COMPATIBILITY_ATTESTATION_PREDICATE_TYPE =
  "urn:liushi:attestation:executor-compatibility:v1";

/** Publication Bundle 在 in-toto Statement 中的稳定 Subject 名称。 */
export const EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SUBJECT_NAME =
  "executor-compatibility-publication-bundle";

/** G6 Release DecisionRequest 必须展示的精确动作。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_ACTION =
  "Confirm the exact Executor Compatibility release candidate and publication target.";

/** G6 Release Approval 完成后的稳定检查点名称。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_APPROVED_CHECKPOINT = "release_approved";

/** Release Manifest G6 DecisionRequest 必须展示的精确动作。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_APPROVAL_ACTION =
  "Confirm the exact Executor Compatibility release manifest and its publisher identity policy.";

/** Release Manifest G6 Approval 完成后的稳定检查点名称。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_APPROVED_CHECKPOINT =
  "release_manifest_approved";

/** 证书身份、Issuer 与发布目标 URI 的最大长度。 */
export const EXECUTOR_COMPATIBILITY_ATTESTATION_URI_MAX_LENGTH = 1024;

/** 证书 Email 身份的最大长度。 */
export const EXECUTOR_COMPATIBILITY_ATTESTATION_EMAIL_MAX_LENGTH = 320;

/** 证书扩展值的最大长度。 */
export const EXECUTOR_COMPATIBILITY_CERTIFICATE_EXTENSION_VALUE_MAX_LENGTH = 2048;

/** X.509 Object Identifier 的关闭式格式。 */
export const EXECUTOR_COMPATIBILITY_CERTIFICATE_OID_PATTERN = /^(?:0|1|2)(?:\.(?:0|[1-9]\d*))+$/u;

/** Sigstore 必须使用的 OIDC Issuer 扩展 OID。 */
export const SIGSTORE_CERTIFICATE_ISSUER_OID = "1.3.6.1.4.1.57264.1.8";

/** Sigstore Build Signer URI 扩展 OID。 */
export const SIGSTORE_BUILD_SIGNER_URI_OID = "1.3.6.1.4.1.57264.1.9";

/** Sigstore Runner Environment 扩展 OID。 */
export const SIGSTORE_RUNNER_ENVIRONMENT_OID = "1.3.6.1.4.1.57264.1.11";

/** Sigstore Source Repository URI 扩展 OID。 */
export const SIGSTORE_SOURCE_REPOSITORY_URI_OID = "1.3.6.1.4.1.57264.1.12";

/** Sigstore Source Repository Digest 扩展 OID。 */
export const SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID = "1.3.6.1.4.1.57264.1.13";

/** Publisher Identity Policy 至少要求的 CT Log 证明数量。 */
export const EXECUTOR_COMPATIBILITY_MINIMUM_CT_LOG_THRESHOLD = 1;

/** Publisher Identity Policy 至少要求的 Transparency Log 证明数量。 */
export const EXECUTOR_COMPATIBILITY_MINIMUM_TLOG_THRESHOLD = 1;

/** 单类验证日志允许配置的保守最大阈值。 */
export const EXECUTOR_COMPATIBILITY_MAXIMUM_LOG_THRESHOLD = 16;
