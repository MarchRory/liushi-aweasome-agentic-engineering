import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Clock,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type { CommandHandler, CommandHandlerSuccess } from "#application/commandGateway/index.js";
import type { WorkflowRepository } from "#application/ports/index.js";
import {
  WorkflowCellKind,
  WorkflowEventType,
  WorkflowRunState,
  validateWorkflowControl,
  validateWorkflowRoute,
  type WorkflowCreatedEventDraft,
  type WorkflowCellRoutedEventDraft,
  type WorkflowControlAppliedEventDraft,
} from "#domain/workflow/index.js";
import type { WorkflowCommandPayload } from "../commands/index.js";
import { WorkflowCommandType } from "../commands/index.js";

import { REQUIREMENT_WORKFLOW_AGGREGATE_TYPE } from "../constants/index.js";
import {
  parseControlWorkflowPayload,
  parseCreateWorkflowPayload,
  parseRouteWorkflowCellPayload,
} from "../validation/index.js";
import {
  createWorkflowEventMetadata,
  createWorkflowRoutePayload,
  nextWorkflowEventId,
  parseWorkflowLocator,
  workflowVersionConflict,
} from "./workflowCommandContext.js";

/** 负责将 Workflow Command 转换为经过 Domain Policy 校验的 Event 草稿。 */
export class RequirementWorkflowCommandHandler implements CommandHandler<WorkflowCommandPayload> {
  public constructor(
    private readonly repository: WorkflowRepository,
    private readonly clock: Clock,
    private readonly eventIdGenerator: IdGenerator,
  ) {}

  /** 执行创建、Cell 路由和 Human 控制三类 S2 Command。 */
  public async execute(
    command: CommandEnvelope<WorkflowCommandPayload>,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    if (command.aggregateType !== REQUIREMENT_WORKFLOW_AGGREGATE_TYPE) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Workflow Aggregate Type 无效。"),
      );
    }
    const commandType = command.commandType as WorkflowCommandType;
    if (!Object.values(WorkflowCommandType).includes(commandType)) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Workflow Command Type 不受支持。", {
          commandType: command.commandType,
        }),
      );
    }
    switch (commandType) {
      case WorkflowCommandType.Create:
        return this.create(command);
      case WorkflowCommandType.RouteCell:
        return this.routeCell(command);
      case WorkflowCommandType.Control:
        return this.control(command);
    }
  }

  private async create(
    command: CommandEnvelope<WorkflowCommandPayload>,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    if (command.expectedVersion !== 0) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "创建 Workflow 的 expectedVersion 必须为 0。",
        ),
      );
    }
    const payload = parseCreateWorkflowPayload(command.payload);
    if (payload.status === ResultStatus.Failure) return payload;
    const locator = parseWorkflowLocator(command.aggregateId, payload.value.workspaceId);
    if (locator.status === ResultStatus.Failure) return locator;
    const eventId = nextWorkflowEventId(this.eventIdGenerator);
    if (eventId.status === ResultStatus.Failure) return eventId;
    const event: WorkflowCreatedEventDraft = {
      ...createWorkflowEventMetadata(
        command,
        locator.value.workflowId,
        locator.value.workspaceId,
        eventId.value,
        this.clock,
      ),
      type: WorkflowEventType.WorkflowCreated,
      payload: {
        workflowKind: payload.value.workflowKind,
        initialCell: WorkflowCellKind.PrdIntake,
        initialState: WorkflowRunState.Active,
        effectiveRevisionSet: payload.value.effectiveRevisionSet,
        inputBindingSet: payload.value.inputBindingSet,
        contextManifest: payload.value.contextManifest,
      },
    };
    return this.append(locator.value, command.expectedVersion, event);
  }

  private async routeCell(
    command: CommandEnvelope<WorkflowCommandPayload>,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const payload = parseRouteWorkflowCellPayload(command.payload);
    if (payload.status === ResultStatus.Failure) return payload;
    const locator = parseWorkflowLocator(command.aggregateId, payload.value.workspaceId);
    if (locator.status === ResultStatus.Failure) return locator;
    const loaded = await this.repository.load(locator.value);
    if (loaded.status === ResultStatus.Failure) return loaded;
    if (loaded.value.aggregate.version !== command.expectedVersion) {
      return failure(
        workflowVersionConflict(command.expectedVersion, loaded.value.aggregate.version),
      );
    }
    const aggregate = loaded.value.aggregate;
    if (aggregate.runState === WorkflowRunState.Paused) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidStateTransition,
          "Paused Workflow 不允许执行 Cell 路由。",
        ),
      );
    }
    if (
      aggregate.runState === WorkflowRunState.Completed ||
      aggregate.runState === WorkflowRunState.Cancelled
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidStateTransition,
          "终态 Workflow 不允许执行 Cell 路由。",
        ),
      );
    }
    if (
      aggregate.currentCell === WorkflowCellKind.HumanDecision &&
      (aggregate.runState !== WorkflowRunState.WaitingHuman ||
        command.actor.kind !== ActorKind.Human)
    ) {
      return failure(
        new HarnessError(
          aggregate.runState === WorkflowRunState.WaitingHuman
            ? HarnessErrorCode.OperationForbidden
            : HarnessErrorCode.InvalidStateTransition,
          "HumanDecision 只能在等待 Human 且由 Human 继续。",
        ),
      );
    }
    if (
      aggregate.currentCell !== WorkflowCellKind.HumanDecision &&
      aggregate.runState !== WorkflowRunState.Active
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidStateTransition,
          "当前 Workflow 状态不允许执行 Cell 路由。",
        ),
      );
    }
    const decision = validateWorkflowRoute({
      workflowKind: aggregate.workflowKind,
      currentCell: aggregate.currentCell,
      targetCell: payload.value.targetCell,
      ...(payload.value.failureTaxonomy === undefined
        ? {}
        : { failureTaxonomy: payload.value.failureTaxonomy }),
    });
    if (decision.status === ResultStatus.Failure) return decision;
    const eventId = nextWorkflowEventId(this.eventIdGenerator);
    if (eventId.status === ResultStatus.Failure) return eventId;
    const event: WorkflowCellRoutedEventDraft = {
      ...createWorkflowEventMetadata(
        command,
        locator.value.workflowId,
        locator.value.workspaceId,
        eventId.value,
        this.clock,
      ),
      type: WorkflowEventType.CellRouted,
      payload: createWorkflowRoutePayload(decision.value),
    };
    return this.append(locator.value, command.expectedVersion, event);
  }

  private async control(
    command: CommandEnvelope<WorkflowCommandPayload>,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const payload = parseControlWorkflowPayload(command.payload);
    if (payload.status === ResultStatus.Failure) return payload;
    const locator = parseWorkflowLocator(command.aggregateId, payload.value.workspaceId);
    if (locator.status === ResultStatus.Failure) return locator;
    const loaded = await this.repository.load(locator.value);
    if (loaded.status === ResultStatus.Failure) return loaded;
    if (loaded.value.aggregate.version !== command.expectedVersion) {
      return failure(
        workflowVersionConflict(command.expectedVersion, loaded.value.aggregate.version),
      );
    }
    const decision = validateWorkflowControl({
      action: payload.value.action,
      currentState: loaded.value.aggregate.runState,
      actorKind: command.actor.kind,
    });
    if (decision.status === ResultStatus.Failure) return decision;
    const eventId = nextWorkflowEventId(this.eventIdGenerator);
    if (eventId.status === ResultStatus.Failure) return eventId;
    const event: WorkflowControlAppliedEventDraft = {
      ...createWorkflowEventMetadata(
        command,
        locator.value.workflowId,
        locator.value.workspaceId,
        eventId.value,
        this.clock,
      ),
      type: WorkflowEventType.ControlApplied,
      payload: {
        action: decision.value.action,
        fromState: decision.value.currentState,
        toState: decision.value.nextState,
        requiresHuman: true,
      },
    };
    return this.append(locator.value, command.expectedVersion, event);
  }

  private async append(
    locator: Parameters<WorkflowRepository["load"]>[0],
    expectedVersion: number,
    event:
      WorkflowCreatedEventDraft | WorkflowCellRoutedEventDraft | WorkflowControlAppliedEventDraft,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const result = await this.repository.append({ locator, expectedVersion, event });
    return result.status === ResultStatus.Failure
      ? result
      : success({ committedVersion: result.value.record.aggregate.version });
  }
}
