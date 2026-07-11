import type { ArtifactDigestPort } from "#application/ports/index.js";
import {
  ARTIFACT_SCHEMA_VERSION,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ActorRef,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import {
  ArtifactStatus,
  ArtifactType,
  FIRST_ARTIFACT_REVISION,
  parseArtifactId,
  type ArtifactProposal,
  type ArtifactId,
  type BusinessLogicChangeContractArtifact,
  type PlanRiskArtifact,
  type RequirementContractArtifact,
  type SupportedArtifact,
} from "#domain/artifact/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** 从已校验 Proposal 创建并 Digest 一个正式 Artifact Envelope。 */
export function createArtifact(
  proposal: ArtifactProposal,
  identity: { workspaceId: WorkspaceId; taskId: TaskId },
  actor: ActorRef,
  createdAt: string,
  previousRevision: SupportedArtifact | undefined,
  artifactIdGenerator: IdGenerator,
  digestPort: ArtifactDigestPort,
): Result<SupportedArtifact, HarnessError> {
  if (previousRevision !== undefined && previousRevision.artifactType !== proposal.artifactType) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidStateTransition,
        "Artifact revision type must match its previous revision.",
      ),
    );
  }
  const artifactId =
    previousRevision === undefined
      ? nextArtifactId(artifactIdGenerator)
      : success(previousRevision.artifactId);
  if (artifactId.status === ResultStatus.Failure) {
    return artifactId;
  }
  const common = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    artifactId: artifactId.value,
    workspaceId: identity.workspaceId,
    taskId: identity.taskId,
    revision:
      previousRevision === undefined ? FIRST_ARTIFACT_REVISION : previousRevision.revision + 1,
    ...(previousRevision === undefined ? {} : { parentDigest: previousRevision.digest }),
    status: ArtifactStatus.Proposed,
    createdAt,
    createdBy: actor,
  } as const;

  switch (proposal.artifactType) {
    case ArtifactType.RequirementContract:
      return withDigest<RequirementContractArtifact>(
        { ...common, artifactType: proposal.artifactType, payload: proposal.payload },
        digestPort,
      );
    case ArtifactType.BusinessLogicChangeContract:
      return withDigest<BusinessLogicChangeContractArtifact>(
        { ...common, artifactType: proposal.artifactType, payload: proposal.payload },
        digestPort,
      );
    case ArtifactType.PlanRisk:
      return withDigest<PlanRiskArtifact>(
        { ...common, artifactType: proposal.artifactType, payload: proposal.payload },
        digestPort,
      );
  }
}

function withDigest<TArtifact extends SupportedArtifact>(
  input: Omit<TArtifact, "digest">,
  digestPort: ArtifactDigestPort,
): Result<TArtifact, HarnessError> {
  const digest = digestPort.calculate(input);
  return digest.status === ResultStatus.Failure
    ? digest
    : success({ ...input, digest: digest.value } as TArtifact);
}

function nextArtifactId(generator: IdGenerator): Result<ArtifactId, HarnessError> {
  try {
    return parseArtifactId(generator.next());
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.IoFailure,
        "Artifact ID generator failed.",
        { operation: "artifactIdGenerator.next" },
        error,
      ),
    );
  }
}
