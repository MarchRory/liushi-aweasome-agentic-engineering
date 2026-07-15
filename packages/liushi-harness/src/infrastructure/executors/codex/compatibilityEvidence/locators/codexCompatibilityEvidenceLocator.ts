import {
  failure,
  HarnessError,
  HarnessErrorCode,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import {
  ExecutorEvidenceLocatorKind,
  type ExecutorEvidenceLocator,
} from "#domain/executorCompatibility/index.js";

const SHA256_DIGEST_PREFIX = "sha256:";

/** 根据脱敏 Artifact 摘要生成稳定且不包含原始宿主标识的 Locator。 */
export function createCodexCompatibilityEvidenceLocator(
  kind: ExecutorEvidenceLocatorKind,
  artifactDigest: ContentDigest,
): Result<ExecutorEvidenceLocator, HarnessError> {
  const digestHex = artifactDigest.slice(SHA256_DIGEST_PREFIX.length);
  switch (kind) {
    case ExecutorEvidenceLocatorKind.RepositoryPath:
      return success({
        kind,
        value: `artifacts/executorCompatibility/codex/${digestHex}.json`,
      });
    case ExecutorEvidenceLocatorKind.RuntimeStore:
      return success({
        kind,
        value: `executorCompatibility/codex/${digestHex}.json`,
      });
    case ExecutorEvidenceLocatorKind.ExternalUri:
      return success({ kind, value: `urn:liushi:artifact:${artifactDigest}` });
    default:
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Codex compatibility evidence locator kind is unsupported.",
        ),
      );
  }
}
