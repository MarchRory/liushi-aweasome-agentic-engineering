import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type { ReadExecutorCompatibilityReleaseArtifactInput } from "#application/ports/executorCompatibilityReleaseArtifactReader/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import {
  StrictJsonCanonicalPolicy,
  readStrictJsonFile,
} from "#infrastructure/strictJsonFileReader/index.js";

/** Reader 共享逻辑所需的最小 Artifact 形状。 */
export interface ValidatedReleaseArtifact {
  /** 已由对应领域校验器重算并确认的 Artifact 摘要。 */
  readonly artifactDigest: ContentDigest;
}

/** 对应 Artifact 的完整 rebuild/validation 函数。 */
export type ReleaseArtifactValidator<TArtifact extends ValidatedReleaseArtifact> = (
  input: unknown,
  digest: ContentDigestPort,
) => Result<TArtifact, HarnessError>;

/** 严格读取 canonical JSON、完整重建 Artifact 并钉住预期摘要。 */
export async function readValidatedReleaseArtifact<TArtifact extends ValidatedReleaseArtifact>(
  input: ReadExecutorCompatibilityReleaseArtifactInput,
  digest: ContentDigestPort,
  validate: ReleaseArtifactValidator<TArtifact>,
): Promise<Result<TArtifact, HarnessError>> {
  const parsed = await readStrictJsonFile({
    filePath: input.filePath,
    expectedByteLength: input.expectedByteLength,
    canonicalPolicy: StrictJsonCanonicalPolicy.Required,
  });
  if (parsed.status === ResultStatus.Failure) return parsed;
  const artifact = validate(parsed.value, digest);
  if (artifact.status === ResultStatus.Failure) return artifact;
  return artifact.value.artifactDigest === input.expectedArtifactDigest
    ? success(artifact.value)
    : failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Release Artifact Digest 与调用方预期不一致。",
        ),
      );
}
