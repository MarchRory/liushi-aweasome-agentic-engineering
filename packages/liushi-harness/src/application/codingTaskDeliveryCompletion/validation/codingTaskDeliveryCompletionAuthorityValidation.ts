import type { CodingTaskSessionDeliverySubmissionCommand } from "#application/codingTaskSessionDelivery/index.js";
import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  failure,
  success,
  type ActorRef,
  type Result,
} from "#common/index.js";
import type { CodingTaskAggregate } from "#domain/codingTask/index.js";

/** 在 Command Gateway 前复验 Completion 使用的 Session 权威身份。 */
export function validateCodingTaskDeliveryCompletionAuthority(
  command: CodingTaskSessionDeliverySubmissionCommand,
  verificationActor: ActorRef,
  state: CodingTaskSessionCloseoutState,
  aggregate: CodingTaskAggregate,
): Result<void, HarnessError> {
  if (
    command.payload.workspaceId !== state.workspaceId ||
    command.payload.sessionId !== state.sessionId ||
    command.aggregateId !== state.codingTaskId ||
    aggregate.workspaceId !== state.workspaceId ||
    aggregate.codingTaskId !== state.codingTaskId ||
    aggregate.sourceTaskId !== state.sourceTaskId ||
    aggregate.repositoryId !== state.repositoryId
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        "Completion 的 Workspace、Session、CodingTask 或 Repository 权威身份不一致。",
      ),
    );
  }
  if (!hasSameActor(command.actor, state.actor) || !hasSameActor(verificationActor, state.actor)) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "Completion 的 Delivery 或 Verification Actor 未绑定当前 Session。",
      ),
    );
  }
  if (command.correlationId !== state.correlationId || command.causationId !== state.commandId) {
    return failure(
      new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        "Completion 的 Delivery Command 因果链与当前 Session 不一致。",
      ),
    );
  }
  return success(undefined);
}

function hasSameActor(left: ActorRef, right: ActorRef): boolean {
  return left.kind === right.kind && left.actorId === right.actorId;
}
