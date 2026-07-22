import type {
  ExecutorCompatibilitySigstoreBundleJson,
  ExecutorCompatibilityTrustedRootJson,
  ExecutorCompatibilityVerifiedSignerIdentity,
} from "#application/executorCompatibilityAttestation/index.js";
import type {
  ExecutorCompatibilityInTotoStatement,
  ExecutorCompatibilityPublisherIdentityPolicy,
  IN_TOTO_ATTESTATION_PAYLOAD_TYPE,
} from "#domain/executorCompatibilityAttestation/index.js";

/** Signer Port 只接收已经过 G6 复验的规范 Statement。 */
export interface SignExecutorCompatibilityAttestationInput {
  /** Sigstore DSSE Envelope 内的固定 Payload Type。 */
  readonly payloadType: typeof IN_TOTO_ATTESTATION_PAYLOAD_TYPE;
  /** 需要由官方 Sigstore 客户端签名的完整 in-toto Statement。 */
  readonly statement: ExecutorCompatibilityInTotoStatement;
}

/** Verifier Port 所需的全部显式离线输入。 */
export interface VerifyExecutorCompatibilityAttestationInput {
  /** 需要验证的完整 Sigstore Bundle JSON。 */
  readonly sigstoreBundle: ExecutorCompatibilitySigstoreBundleJson;
  /** 通过受信通道提供且禁止 Adapter 自动更新的 Trusted Root。 */
  readonly trustedRoot: ExecutorCompatibilityTrustedRootJson;
  /** DSSE Payload 必须逐字节匹配的受信 Statement。 */
  readonly statement: ExecutorCompatibilityInTotoStatement;
  /** 证书 Issuer、SAN、OID 与日志阈值的精确策略。 */
  readonly publisherIdentityPolicy: ExecutorCompatibilityPublisherIdentityPolicy;
}

/** Signer Port 成功后返回的规范 Sigstore Bundle。 */
export interface ExecutorCompatibilityAttestationSigningResult {
  /** 已由官方 Parser 重建的 Sigstore Bundle JSON。 */
  readonly sigstoreBundle: ExecutorCompatibilitySigstoreBundleJson;
}

/** Verifier Port 成功后返回的实际证书身份。 */
export interface ExecutorCompatibilityAttestationCryptographicVerificationResult {
  /** 已通过证书链、CT、TLog、签名和策略验证的身份。 */
  readonly signerIdentity: ExecutorCompatibilityVerifiedSignerIdentity;
}
