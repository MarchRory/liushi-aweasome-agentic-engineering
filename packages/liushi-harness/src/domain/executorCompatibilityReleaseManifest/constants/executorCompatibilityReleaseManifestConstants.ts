import { ExecutorCompatibilityReleaseArtifactKind } from "../enums/index.js";

/** Executor Compatibility Release Manifest 的契约版本。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_SCHEMA_VERSION =
  "liushi.executor-compatibility-release-manifest.v1";

/** Release Manifest Artifact 的唯一规范顺序。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ARTIFACT_ORDER = [
  ExecutorCompatibilityReleaseArtifactKind.PackageTarball,
  ExecutorCompatibilityReleaseArtifactKind.PublicationBundle,
  ExecutorCompatibilityReleaseArtifactKind.SignedReleaseAttestation,
] as const;

/** Release Manifest 必须包含的 Artifact 数量。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ARTIFACT_COUNT =
  EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_ARTIFACT_ORDER.length;
