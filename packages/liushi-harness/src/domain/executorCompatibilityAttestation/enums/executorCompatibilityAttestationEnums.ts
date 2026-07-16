/** 发布者证书 Subject Alternative Name 的封闭身份类别。 */
export enum ExecutorCompatibilityCertificateIdentityKind {
  /** 证书 SAN 必须精确匹配 URI。 */
  Uri = "uri",
  /** 证书 SAN 必须精确匹配 Email。 */
  Email = "email",
}

/** Executor Compatibility 发布目标的封闭类别。 */
export enum ExecutorCompatibilityPublicationTargetKind {
  /** npm Registry 中的精确包目标。 */
  NpmRegistry = "npm_registry",
  /** GitHub Release 中的精确发布目标。 */
  GitHubRelease = "github_release",
  /** 企业或第三方 Artifact Registry 中的精确目标。 */
  ArtifactRegistry = "artifact_registry",
}
