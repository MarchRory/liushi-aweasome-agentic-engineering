import type { DecisionRequest } from "#domain/approval/index.js";
import {
  ArtifactType,
  type ArtifactDigest,
  type SupportedArtifact,
} from "#domain/artifact/index.js";
import type { ApprovalRecordedPayload, ArtifactCommittedPayload } from "#domain/taskRun/index.js";
import { calculateCanonicalJsonSha256 } from "#infrastructure/serialization/jsonDigest/index.js";

/** 校验 ArtifactCommitted 内全部内容摘要及 Write Set 绑定。 */
export function assertArtifactCommittedContentDigests(payload: ArtifactCommittedPayload): void {
  assertRecordDigest(payload.artifact, "Artifact");
  if (payload.decisionRequest === undefined) {
    return;
  }

  assertRecordDigest(payload.decisionRequest, "DecisionRequest");
  assertWriteSetDigest(payload.artifact, payload.decisionRequest);
}

/** 校验 ApprovalRecorded 内 ApprovalRecord 的内容摘要。 */
export function assertApprovalRecordedContentDigest(payload: ApprovalRecordedPayload): void {
  assertRecordDigest(payload.approval, "ApprovalRecord");
}

function assertWriteSetDigest(artifact: SupportedArtifact, decisionRequest: DecisionRequest): void {
  if (artifact.artifactType !== ArtifactType.PlanRisk) {
    if (decisionRequest.writeSetDigest !== undefined) {
      throw new Error("Only PlanRisk DecisionRequest may bind a Write Set Digest.");
    }
    return;
  }

  const expected = calculateDigest(artifact.payload.writeSet);
  if (decisionRequest.writeSetDigest !== expected) {
    throw new Error("DecisionRequest Write Set Digest does not match PlanRisk.");
  }
}

function assertRecordDigest<TRecord extends { readonly digest: ArtifactDigest }>(
  record: TRecord,
  recordType: string,
): void {
  const { digest, ...digestInput } = record;
  if (digest !== calculateDigest(digestInput)) {
    throw new Error(`${recordType} digest does not match its canonical content.`);
  }
}

function calculateDigest(input: unknown): ArtifactDigest {
  return `sha256:${calculateCanonicalJsonSha256(input)}` as ArtifactDigest;
}
