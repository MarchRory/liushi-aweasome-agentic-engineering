/** Release Manifest 中可被独立寻址的发布 Artifact 类型。 */
export enum ExecutorCompatibilityReleaseArtifactKind {
  /** 发布 npm 包的 Tarball。 */
  PackageTarball = "package_tarball",
  /** 已验证的 Executor Compatibility Publication Bundle。 */
  PublicationBundle = "publication_bundle",
  /** 已签名的 Release Attestation 及其 Sigstore Bundle。 */
  SignedReleaseAttestation = "signed_release_attestation",
}
