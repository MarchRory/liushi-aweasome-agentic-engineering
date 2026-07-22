import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  ExecutorCompatibilityReleaseArtifactWriteDisposition,
  type ExecutorCompatibilityReleaseArtifactWriteResult,
  type ExecutorCompatibilityStoredReleaseArtifactKind,
  type WriteExecutorCompatibilityReleaseArtifactInput,
} from "#application/ports/executorCompatibilityReleaseArtifactWriter/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ImmutableFileParentDirectoryPolicy,
  ImmutableFileWriteDisposition,
  createOnlyImmutableFile,
} from "#infrastructure/immutableFile/index.js";
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import {
  assertReleaseArtifactRootUnchanged,
  readReleaseArtifactRootIdentity,
  requireDirectChildPath,
} from "../validation/index.js";
import type {
  ReleaseArtifactValidator,
  ValidatedReleaseArtifact,
} from "./releaseArtifactReader.service.js";

/** Writer 共享逻辑所需的 Artifact 版本形状。 */
export interface VersionedReleaseArtifact extends ValidatedReleaseArtifact {
  /** 已由对应领域校验器确认的 Artifact Schema 版本。 */
  readonly schemaVersion: string;
}

/** 在 constructor 固定的 trusted root 下发布完整 canonical Artifact。 */
export async function writeValidatedReleaseArtifact<TArtifact extends VersionedReleaseArtifact>(
  outputRoot: string,
  input: WriteExecutorCompatibilityReleaseArtifactInput<TArtifact>,
  kind: ExecutorCompatibilityStoredReleaseArtifactKind,
  digest: ContentDigestPort,
  parentDirectoryDurability: ParentDirectoryDurability,
  validate: ReleaseArtifactValidator<TArtifact>,
): Promise<Result<ExecutorCompatibilityReleaseArtifactWriteResult, HarnessError>> {
  try {
    const beforeRoot = await readReleaseArtifactRootIdentity(outputRoot);
    const outputFilePath = requireDirectChildPath(beforeRoot.realPath, input.outputFilePath);
    const artifact = validate(input.artifact, digest);
    if (artifact.status === ResultStatus.Failure) return artifact;
    const content = Buffer.from(`${canonicalizeJson(artifact.value)}\n`, "utf8");
    const disposition = await createOnlyImmutableFile({
      outputFilePath,
      content,
      parentDirectoryDurability,
      parentDirectoryPolicy: ImmutableFileParentDirectoryPolicy.RequireExisting,
      commitOutcomeUnknownCode:
        HarnessErrorCode.ExecutorCompatibilityReleaseArtifactCommitOutcomeUnknown,
      conflictErrorCode: HarnessErrorCode.PreconditionNotMet,
      artifactName: "Release Artifact",
    });
    await requireUnchangedRootAfterWrite(outputRoot, outputFilePath, beforeRoot);
    return success({
      kind,
      disposition:
        disposition === ImmutableFileWriteDisposition.Created
          ? ExecutorCompatibilityReleaseArtifactWriteDisposition.Created
          : ExecutorCompatibilityReleaseArtifactWriteDisposition.IdempotentReuse,
      artifactDigest: artifact.value.artifactDigest,
      byteLength: content.byteLength,
      outputFilePath,
      schemaVersion: artifact.value.schemaVersion,
    });
  } catch (error) {
    return failure(
      error instanceof HarnessError
        ? error
        : new HarnessError(
            HarnessErrorCode.IoFailure,
            "Release Artifact 写入失败。",
            { outputRoot },
            error,
          ),
    );
  }
}

async function requireUnchangedRootAfterWrite(
  outputRoot: string,
  outputFilePath: string,
  beforeRoot: Awaited<ReturnType<typeof readReleaseArtifactRootIdentity>>,
): Promise<void> {
  try {
    const afterRoot = await readReleaseArtifactRootIdentity(outputRoot);
    assertReleaseArtifactRootUnchanged(beforeRoot, afterRoot, outputRoot);
    requireDirectChildPath(afterRoot.realPath, outputFilePath);
  } catch (error) {
    if (
      error instanceof HarnessError &&
      error.code === HarnessErrorCode.ExecutorCompatibilityReleaseArtifactCommitOutcomeUnknown
    ) {
      throw error;
    }
    throw new HarnessError(
      HarnessErrorCode.ExecutorCompatibilityReleaseArtifactCommitOutcomeUnknown,
      "Release Artifact 发布后无法确认 trusted outputRoot 身份与 containment。",
      { outputRoot, outputFilePath },
      error,
    );
  }
}
