/** Harness 存储的 Release Artifact 种类。 */
export enum ExecutorCompatibilityStoredReleaseArtifactKind {
  /** P3b 已签名 Attestation Artifact。 */
  SignedAttestation = "signed_attestation",
  /** P4b3 已签名 Manifest Artifact。 */
  SignedManifest = "signed_manifest",
}

/** Release Artifact Writer 的 create-only 写入处置。 */
export enum ExecutorCompatibilityReleaseArtifactWriteDisposition {
  /** 首次创建。 */
  Created = "created",
  /** 完全相同字节的既有文件复用。 */
  IdempotentReuse = "idempotent_reuse",
}
