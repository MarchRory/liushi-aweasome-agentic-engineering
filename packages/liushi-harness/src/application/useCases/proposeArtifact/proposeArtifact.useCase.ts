import type { ArtifactDigestPort, TaskRepository } from "#application/ports/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  validateActorRef,
  type ActorRef,
  type Clock,
  type Delay,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import {
  ArtifactType,
  parseArtifactProposal,
  validateArtifactEvidence,
  type ArtifactProposal,
} from "#domain/artifact/index.js";
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
import {
  ARTIFACT_PROPOSAL_CONFLICT_RESOLUTION_ATTEMPTS,
  ARTIFACT_PROPOSAL_CONFLICT_RESOLUTION_DELAY_MS,
} from "./constants/index.js";
import { createDecisionRequest } from "./decisionRequestFactory.js";
import {
  parseArtifactProposalIdempotencyKey,
  replayArtifactProposal,
} from "./idempotency/index.js";
import type { ProposeArtifactInput } from "./proposeArtifact.input.js";
import type { ProposeArtifactOutput } from "./proposeArtifact.output.js";

const immediateDelay: Delay = { wait: () => Promise.resolve() };

/** 校验 Proposal、执行 Gate Policy 并提交 ArtifactCommitted Event。 */
export class ProposeArtifactUseCase {
  public constructor(
    private readonly repository: TaskRepository,
    private readonly digestPort: ArtifactDigestPort,
    private readonly clock: Clock,
    private readonly artifactIdGenerator: IdGenerator,
    private readonly decisionRequestIdGenerator: IdGenerator,
    private readonly delay: Delay = immediateDelay,
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
    if (
      actor.value.kind !== ActorKind.Human &&
      (proposal.value.artifactType === ArtifactType.BusinessLogicChangeContract ||
        proposal.value.artifactType === ArtifactType.PlanRisk)
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "Business Logic 与 PlanRisk Proposal 必须由 Human 明确提交。",
        ),
      );
    }
    const evidence = validateArtifactEvidence(proposal.value);
    if (evidence.status === ResultStatus.Failure) {
      return evidence;
    }
    const idempotencyKey = parseArtifactProposalIdempotencyKey(input.idempotencyKey);
    if (idempotencyKey.status === ResultStatus.Failure) {
      return idempotencyKey;
    }

    const locator = { workspaceId: workspaceId.value, taskId: taskId.value };
    return this.executeWithConflictRecovery(
      locator,
      proposal.value,
      actor.value,
      idempotencyKey.value,
      ARTIFACT_PROPOSAL_CONFLICT_RESOLUTION_ATTEMPTS,
    );
  }

  private async executeWithConflictRecovery(
    locator: Parameters<TaskRepository["load"]>[0],
    proposal: ArtifactProposal,
    actor: ActorRef,
    idempotencyKey: string | undefined,
    remainingAttempts: number,
  ): Promise<Result<ProposeArtifactOutput, HarnessError>> {
    const loaded = await this.repository.load(locator);
    if (loaded.status === ResultStatus.Failure) {
      return this.retryConflict(
        locator,
        proposal,
        actor,
        idempotencyKey,
        loaded.error,
        remainingAttempts,
      );
    }
    const replayed = replayArtifactProposal({
      record: loaded.value,
      proposal,
      actor,
      idempotencyKey,
      digestPort: this.digestPort,
    });
    if (replayed.status === ResultStatus.Failure) return replayed;
    if (replayed.value !== undefined) return success(replayed.value);

    const transition = validateArtifactProposalTransition(loaded.value.aggregate, proposal);
    if (transition.status === ResultStatus.Failure) {
      return transition;
    }
    const previousRevision = findRejectedArtifactRevisionTarget(loaded.value.aggregate, proposal);

    const occurredAt = this.clock.now().toISOString();
    const artifact = createArtifact(
      proposal,
      locator,
      actor,
      occurredAt,
      previousRevision,
      idempotencyKey,
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
            actor,
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
      actor,
      type: TaskRunEventType.ArtifactCommitted,
      payload: {
        artifact: artifact.value,
        gateEvaluation,
        ...(decisionRequest === undefined ? {} : { decisionRequest: decisionRequest.value }),
      },
    });
    if (appended.status === ResultStatus.Failure) {
      return this.retryConflict(
        locator,
        proposal,
        actor,
        idempotencyKey,
        appended.error,
        remainingAttempts,
      );
    }

    return success({
      artifact: artifact.value,
      gateEvaluation,
      ...(decisionRequest === undefined ? {} : { decisionRequest: decisionRequest.value }),
      task: appended.value.record.aggregate.task,
      persistence: appended.value.persistence,
    });
  }

  private async retryConflict(
    locator: Parameters<TaskRepository["load"]>[0],
    proposal: ArtifactProposal,
    actor: ActorRef,
    idempotencyKey: string | undefined,
    conflict: HarnessError,
    remainingAttempts: number,
  ): Promise<Result<ProposeArtifactOutput, HarnessError>> {
    if (
      idempotencyKey === undefined ||
      remainingAttempts <= 0 ||
      ![HarnessErrorCode.LockUnavailable, HarnessErrorCode.VersionConflict].includes(conflict.code)
    ) {
      return failure(conflict);
    }
    await this.delay.wait(ARTIFACT_PROPOSAL_CONFLICT_RESOLUTION_DELAY_MS);
    return this.executeWithConflictRecovery(
      locator,
      proposal,
      actor,
      idempotencyKey,
      remainingAttempts - 1,
    );
  }
}
