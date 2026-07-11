import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";

/** 供 Artifact 契约使用的 Content Digest 语义别名。 */
export type ArtifactDigest = ContentDigest;

/** 将外部字符串校验并转换为 Artifact Digest。 */
export function parseArtifactDigest(value: string): Result<ArtifactDigest, HarnessError> {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Artifact digest must use sha256:<64 lowercase hex> format.",
        { field: "artifactDigest" },
      ),
    );
  }

  return success(parsed.value);
}
