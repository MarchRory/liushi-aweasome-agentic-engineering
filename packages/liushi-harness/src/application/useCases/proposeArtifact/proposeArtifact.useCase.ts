import type { ArtifactDigestPort, TaskRepository } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  validateActorRef,
  type Clock,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import { parseArtifactProposal, validateArtifactEvidence } from "#domain/artifact/index.js";
import { evaluateArtifactGate } from "#domain/gate/index.js";
import { GateEvaluationResult } from "#domain/policy/index.js";
import { parseTaskId } from "#domain/task/index.js";
import {
  TaskRunEventType,
  findRejectedArtifactRevisionTarget,
  validateArtifactProposalTransition,
} from "#domain/taskRun/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import { createArtifact } from "./artifactFactory.js";
import { createDecisionRequest } from "./decisionRequestFactory.js";
import type { ProposeArtifactInput } from "./proposeArtifact.input.js";
import type { ProposeArtifactOutput } from "./proposeArtifact.output.js";

/** 校验 Proposal、执行 Gate Policy 并提交 ArtifactCommitted Event。 */
export class ProposeArtifactUseCase {
  public constructor(
    private readonly repository: TaskRepository,
    private readonly digestPort: ArtifactDigestPort,
    private readonly clock: Clock,
    private readonly artifactIdGenerator: IdGenerator,
    private readonly decisionRequestIdGenerator: IdGenerator,
  ) {}

  /** 执行一次 Artifact Proposal Commit Protocol。 */
  public async execute(
    input: ProposeArtifactInput,
  ): Promise<Result<ProposeArtifactOutput, HarnessError>> {
    const workspaceId = parseWorkspaceId(input.workspaceId);
    if (workspaceId.status === ResultStatus.Failure) {
      return workspaceId;
    }
    const taskId = parseTaskId(input.taskId);
    if (taskId.status === ResultStatus.Failure) {
      return taskId;
    }
    const actor = validateActorRef(input.actor);
    if (actor.status === ResultStatus.Failure) {
      return actor;
    }
    const proposal = parseArtifactProposal(input.proposal);
    if (proposal.status === ResultStatus.Failure) {
      return proposal;
    }
    const evidence = validateArtifactEvidence(proposal.value);
    if (evidence.status === ResultStatus.Failure) {
      return evidence;
    }

    const locator = { workspaceId: workspaceId.value, taskId: taskId.value };
    const loaded = await this.repository.load(locator);
    if (loaded.status === ResultStatus.Failure) {
      return loaded;
    }
    const transition = validateArtifactProposalTransition(loaded.value.aggregate, proposal.value);
    if (transition.status === ResultStatus.Failure) {
      return transition;
    }
    const previousRevision = findRejectedArtifactRevisionTarget(
      loaded.value.aggregate,
      proposal.value,
    );

    const occurredAt = this.clock.now().toISOString();
    const artifact = createArtifact(
      proposal.value,
      locator,
      actor.value,
      occurredAt,
      previousRevision,
      this.artifactIdGenerator,
      this.digestPort,
    );
    if (artifact.status === ResultStatus.Failure) {
      return artifact;
    }
    const gateEvaluation = evaluateArtifactGate(
      artifact.value,
      loaded.value.aggregate.approvals,
      occurredAt,
    );
    if (gateEvaluation.result === GateEvaluationResult.Forbidden) {
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "Artifact is forbidden by deterministic Gate Policy.",
          { reasons: gateEvaluation.reasons.join(",") },
        ),
      );
    }

    const decisionRequest =
      gateEvaluation.result === GateEvaluationResult.WaitingHuman
        ? createDecisionRequest(
            artifact.value,
            gateEvaluation,
            actor.value,
            occurredAt,
            this.decisionRequestIdGenerator,
            this.digestPort,
          )
        : undefined;
    if (decisionRequest?.status === ResultStatus.Failure) {
      return decisionRequest;
    }

    const appended = await this.repository.append({
      locator,
      expectedLastSequence: loaded.value.lastSequence,
      expectedLastEventHash: loaded.value.lastEventHash,
      occurredAt,
      actor: actor.value,
      type: TaskRunEventType.ArtifactCommitted,
      payload: {
        artifact: artifact.value,
        gateEvaluation,
        ...(decisionRequest === undefined ? {} : { decisionRequest: decisionRequest.value }),
      },
    });
    if (appended.status === ResultStatus.Failure) {
      return appended;
    }

    return success({
      artifact: artifact.value,
      gateEvaluation,
      ...(decisionRequest === undefined ? {} : { decisionRequest: decisionRequest.value }),
      task: appended.value.record.aggregate.task,
      persistence: appended.value.persistence,
    });
  }
}
