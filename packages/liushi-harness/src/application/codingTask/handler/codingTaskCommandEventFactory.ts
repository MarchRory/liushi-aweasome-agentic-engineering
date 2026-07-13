import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  type Clock,
  type IdGenerator,
} from "#common/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type { CodingTaskLocator } from "#application/ports/index.js";
import {
  CodingTaskControlAction,
  CodingTaskEventType,
  CodingTaskHumanResolution,
  CodingTaskRunState,
  type AttemptFinishedEventDraft,
  type AttemptStartedEventDraft,
  type CodingTaskAggregate,
  type CodingTaskCreatedEventDraft,
  type CodingTaskEventDraft,
  type HumanControlAppliedEventDraft,
  type HumanResolutionAppliedEventDraft,
  type ImplementationSubmittedEventDraft,
  type VerificationFinishedEventDraft,
  type VerificationRequestedEventDraft,
} from "#domain/codingTask/index.js";

import {
  CodingTaskCommandType,
  type ControlCodingTaskPayload,
  type CreateCodingTaskPayload,
  type FinishAttemptPayload,
  type FinishVerificationPayload,
  type RequestVerificationPayload,
  type ResolveHumanPayload,
  type StartAttemptPayload,
  type SubmitImplementationPayload,
  type CodingTaskCommandPayload,
} from "../commands/index.js";
import {
  createCodingTaskEventMetadata,
  nextCodingTaskEventId,
} from "./codingTaskCommandContext.js";

/** 负责按 Command 类型构造强类型 CodingTask Event Draft。 */
export class CodingTaskCommandEventFactory {
  /** 创建事件工厂。 */
  public constructor(
    private readonly clock: Clock,
    private readonly eventIdGenerator: IdGenerator,
  ) {}

  /** 根据已解析的 Command 构造一个 Event Draft。 */
  public create(
    command: CommandEnvelope<CodingTaskCommandPayload>,
    locator: CodingTaskLocator,
    commandType: CodingTaskCommandType,
    payload: CodingTaskCommandPayload,
    aggregate?: CodingTaskAggregate,
  ): CodingTaskEventDraft {
    switch (commandType) {
      case CodingTaskCommandType.Create:
        return this.createTask(command, locator, payload as CreateCodingTaskPayload);
      case CodingTaskCommandType.StartAttempt:
        return this.startAttempt(command, locator, payload as StartAttemptPayload);
      case CodingTaskCommandType.FinishAttempt:
        return this.finishAttempt(command, locator, payload as FinishAttemptPayload);
      case CodingTaskCommandType.SubmitImplementation:
        return this.submitImplementation(command, locator, payload as SubmitImplementationPayload);
      case CodingTaskCommandType.RequestVerification:
        return this.requestVerification(command, locator, payload as RequestVerificationPayload);
      case CodingTaskCommandType.FinishVerification:
        return this.finishVerification(command, locator, payload as FinishVerificationPayload);
      case CodingTaskCommandType.Control:
        if (aggregate === undefined) throw missingAggregate(commandType);
        return this.control(command, locator, payload as ControlCodingTaskPayload, aggregate);
      case CodingTaskCommandType.ResolveHuman:
        return this.resolveHuman(command, locator, payload as ResolveHumanPayload);
      default:
        throw new HarnessError(HarnessErrorCode.InvalidInput, "CodingTask Command Type 不受支持。");
    }
  }

  private createTask(
    command: CommandEnvelope<CodingTaskCommandPayload>,
    locator: CodingTaskLocator,
    payload: CreateCodingTaskPayload,
  ): CodingTaskCreatedEventDraft {
    return {
      ...this.metadata(command, locator),
      type: CodingTaskEventType.CodingTaskCreated,
      payload: {
        sourceTaskId: payload.sourceTaskId,
        repositoryId: payload.repositoryId,
        baseRevision: payload.baseRevision,
        worktreeBinding: payload.worktreeBinding,
        writeSet: payload.writeSet,
        inputBindingSet: payload.inputBindingSet,
        executionAuthorization: payload.executionAuthorization,
      },
    };
  }

  private startAttempt(
    command: CommandEnvelope<CodingTaskCommandPayload>,
    locator: CodingTaskLocator,
    payload: StartAttemptPayload,
  ): AttemptStartedEventDraft {
    return {
      ...this.metadata(command, locator),
      type: CodingTaskEventType.AttemptStarted,
      payload: { attemptNumber: payload.attemptNumber },
    };
  }

  private finishAttempt(
    command: CommandEnvelope<CodingTaskCommandPayload>,
    locator: CodingTaskLocator,
    payload: FinishAttemptPayload,
  ): AttemptFinishedEventDraft {
    return {
      ...this.metadata(command, locator),
      type: CodingTaskEventType.AttemptFinished,
      payload: {
        attemptNumber: payload.attemptNumber,
        outcome: payload.outcome,
        ...(payload.failureTaxonomy === undefined
          ? {}
          : { failureTaxonomy: payload.failureTaxonomy }),
      },
    };
  }

  private requestVerification(
    command: CommandEnvelope<CodingTaskCommandPayload>,
    locator: CodingTaskLocator,
    payload: RequestVerificationPayload,
  ): VerificationRequestedEventDraft {
    return {
      ...this.metadata(command, locator),
      type: CodingTaskEventType.VerificationRequested,
      payload: { attemptNumber: payload.attemptNumber },
    };
  }

  private submitImplementation(
    command: CommandEnvelope<CodingTaskCommandPayload>,
    locator: CodingTaskLocator,
    payload: SubmitImplementationPayload,
  ): ImplementationSubmittedEventDraft {
    return {
      ...this.metadata(command, locator),
      type: CodingTaskEventType.ImplementationSubmitted,
      payload: {
        attemptNumber: payload.attemptNumber,
        targetRevision: payload.targetRevision,
        changedPaths: payload.changedPaths,
      },
    };
  }

  private finishVerification(
    command: CommandEnvelope<CodingTaskCommandPayload>,
    locator: CodingTaskLocator,
    payload: FinishVerificationPayload,
  ): VerificationFinishedEventDraft {
    return {
      ...this.metadata(command, locator),
      type: CodingTaskEventType.VerificationFinished,
      payload: {
        attemptNumber: payload.attemptNumber,
        outcome: payload.outcome,
        ...(payload.failureTaxonomy === undefined
          ? {}
          : { failureTaxonomy: payload.failureTaxonomy }),
      },
    };
  }

  private control(
    command: CommandEnvelope<CodingTaskCommandPayload>,
    locator: CodingTaskLocator,
    payload: ControlCodingTaskPayload,
    aggregate: CodingTaskAggregate,
  ): HumanControlAppliedEventDraft {
    const toState =
      payload.action === CodingTaskControlAction.Pause
        ? CodingTaskRunState.Paused
        : payload.action === CodingTaskControlAction.Resume
          ? CodingTaskRunState.Active
          : CodingTaskRunState.Cancelled;
    return {
      ...this.metadata(command, locator),
      type: CodingTaskEventType.HumanControlApplied,
      payload: {
        action: payload.action,
        fromState: aggregate.runState,
        toState,
        requiresHuman: true,
      },
    };
  }

  private resolveHuman(
    command: CommandEnvelope<CodingTaskCommandPayload>,
    locator: CodingTaskLocator,
    payload: ResolveHumanPayload,
  ): HumanResolutionAppliedEventDraft {
    const toState =
      payload.resolution === CodingTaskHumanResolution.Cancel
        ? CodingTaskRunState.Cancelled
        : CodingTaskRunState.Active;
    return {
      ...this.metadata(command, locator),
      type: CodingTaskEventType.HumanResolutionApplied,
      payload: {
        resolution: payload.resolution,
        fromState: CodingTaskRunState.WaitingHuman,
        toState,
        ...(payload.resolution === CodingTaskHumanResolution.ResumeImplementation
          ? { inputBindingSet: payload.inputBindingSet }
          : {}),
        requiresHuman: true,
      },
    };
  }

  private metadata(command: CommandEnvelope<CodingTaskCommandPayload>, locator: CodingTaskLocator) {
    const eventId = nextCodingTaskEventId(this.eventIdGenerator);
    if (eventId.status === ResultStatus.Failure) throw eventId.error;
    return createCodingTaskEventMetadata(
      command,
      locator.codingTaskId,
      locator.workspaceId,
      eventId.value,
      this.clock,
    );
  }
}

function missingAggregate(commandType: CodingTaskCommandType): HarnessError {
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    `${commandType} 需要先加载 CodingTask Aggregate。`,
  );
}
