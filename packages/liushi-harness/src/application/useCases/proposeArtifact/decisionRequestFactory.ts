import type { ArtifactDigestPort } from "#application/ports/index.js";
import {
  DECISION_REQUEST_SCHEMA_VERSION,
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
  parseDecisionRequestId,
  type DecisionRequest,
  type DecisionRequestDigestInput,
} from "#domain/approval/index.js";
import { ArtifactType, type SupportedArtifact } from "#domain/artifact/index.js";
import type { GateEvaluation } from "#domain/gate/index.js";
import { GateId } from "#domain/policy/index.js";
import { TaskPhase } from "#domain/task/index.js";
import { TaskCheckpoint } from "#domain/taskRun/index.js";

import {
  BUSINESS_LOGIC_APPROVAL_ACTION,
  PROJECT_PROFILE_APPROVAL_ACTION,
  REQUIREMENT_APPROVAL_ACTION,
  RISK_OPERATION_APPROVAL_ACTION,
} from "./proposeArtifact.constants.js";

/** 为 WaitingHuman Evaluation 创建并 Digest 唯一 DecisionRequest。 */
export function createDecisionRequest(
  artifact: SupportedArtifact,
  evaluation: GateEvaluation,
  actor: ActorRef,
  createdAt: string,
  decisionIdGenerator: IdGenerator,
  digestPort: ArtifactDigestPort,
): Result<DecisionRequest, HarnessError> {
  const gate = evaluation.requiredGates[0];
  if (evaluation.requiredGates.length !== 1 || gate === undefined) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidStateTransition,
        "WaitingHuman evaluation must contain exactly one blocking Gate.",
      ),
    );
  }
  const decisionId = nextDecisionRequestId(decisionIdGenerator);
  if (decisionId.status === ResultStatus.Failure) {
    return decisionId;
  }
  const writeSetDigest =
    artifact.artifactType === ArtifactType.PlanRisk
      ? digestPort.calculate(artifact.payload.writeSet)
      : undefined;
  if (writeSetDigest?.status === ResultStatus.Failure) {
    return writeSetDigest;
  }

  const input: DecisionRequestDigestInput = {
    schemaVersion: DECISION_REQUEST_SCHEMA_VERSION,
    decisionRequestId: decisionId.value,
    taskId: artifact.taskId,
    gate,
    artifactId: artifact.artifactId,
    artifactDigest: artifact.digest,
    riskLevel: evaluation.riskLevel,
    resumePhase: resumePhase(gate),
    resumeCheckpoint: resumeCheckpoint(gate),
    requiredAction: requiredAction(gate),
    ...(writeSetDigest === undefined ? {} : { writeSetDigest: writeSetDigest.value }),
    createdAt,
    createdBy: actor,
  };
  const digest = digestPort.calculate(input);
  return digest.status === ResultStatus.Failure
    ? digest
    : success({ ...input, digest: digest.value });
}

function nextDecisionRequestId(generator: IdGenerator) {
  try {
    return parseDecisionRequestId(generator.next());
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.IoFailure,
        "Decision Request ID generator failed.",
        { operation: "decisionRequestIdGenerator.next" },
        error,
      ),
    );
  }
}

function resumePhase(gate: GateId): TaskPhase {
  switch (gate) {
    case GateId.G1Requirement:
    case GateId.G2BusinessLogic:
    case GateId.G8ProjectCompliance:
      return TaskPhase.Planning;
    case GateId.G4RiskOperation:
      return TaskPhase.Implementation;
    case GateId.G6MergeRelease:
      throw unsupportedReleaseGate();
  }
}

function resumeCheckpoint(gate: GateId): string {
  switch (gate) {
    case GateId.G1Requirement:
      return TaskCheckpoint.RequirementApproved;
    case GateId.G2BusinessLogic:
      return TaskCheckpoint.BusinessLogicApproved;
    case GateId.G4RiskOperation:
      return TaskCheckpoint.ImplementationReady;
    case GateId.G6MergeRelease:
      throw unsupportedReleaseGate();
    case GateId.G8ProjectCompliance:
      return TaskCheckpoint.ProjectProfileApproved;
  }
}

function requiredAction(gate: GateId): string {
  switch (gate) {
    case GateId.G1Requirement:
      return REQUIREMENT_APPROVAL_ACTION;
    case GateId.G2BusinessLogic:
      return BUSINESS_LOGIC_APPROVAL_ACTION;
    case GateId.G4RiskOperation:
      return RISK_OPERATION_APPROVAL_ACTION;
    case GateId.G6MergeRelease:
      throw unsupportedReleaseGate();
    case GateId.G8ProjectCompliance:
      return PROJECT_PROFILE_APPROVAL_ACTION;
  }
}

function unsupportedReleaseGate(): Error {
  return new Error("G6 Release approval is not supported by Artifact proposal.");
}
