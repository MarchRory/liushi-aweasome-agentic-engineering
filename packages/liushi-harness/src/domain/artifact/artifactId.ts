import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { ARTIFACT_ID_PATTERN } from "./artifactConstants.js";

declare const artifactIdBrand: unique symbol;

/** 经 ULID 格式校验的 Artifact ID。 */
export type ArtifactId = string & { readonly [artifactIdBrand]: true };

/** 将外部字符串校验并转换为 Artifact ID。 */
export function parseArtifactId(value: string): Result<ArtifactId, HarnessError> {
  if (!ARTIFACT_ID_PATTERN.test(value)) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Artifact ID must be an uppercase ULID.", {
        field: "artifactId",
      }),
    );
  }

  return success(value as ArtifactId);
}
