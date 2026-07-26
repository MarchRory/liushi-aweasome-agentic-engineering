import {
  CommandStatus,
  parseCommandEnvelope,
  type CommandEnvelope,
  type CommandReceipt,
} from "#application/command/index.js";
import type {
  ApplicationCommandGateway,
  CommandHandlerSuccess,
} from "#application/commandGateway/index.js";
import type {
  ActionJournalRepository,
  ContentDigestPort,
  TraceObservationStore,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import type { ActionHookAuthorizationPolicy } from "../authorization/index.js";
import { CANONICAL_SESSION_HOOK_SCHEMA_VERSION } from "../constants/index.js";
import type {
  ActionHookPayload,
  CanonicalHookDispatcherPort,
  HookDispatchResult,
  PostActionHookPayload,
  PreActionHookPayload,
  SessionActionHookHandlerPort,
} from "../contracts/index.js";
import { HarnessHookEvent } from "../enums/index.js";
import { parseActionHookPayload } from "../validation/index.js";
import {
  createActionIntent,
  createActionObservation,
  createActionResolution,
  createActionTrace,
} from "./actionHookRecordFactory.js";
import {
  projectActionStateDecision,
  projectCommandReceiptDecision,
} from "./hookResultProjector.js";

/** 通过 Gateway、Policy、Action Journal 与 Trace 处理 Canonical Action Hook。 */
export class CanonicalHookDispatcher implements CanonicalHookDispatcherPort {
  public constructor(
    private readonly gateway: ApplicationCommandGateway,
    private readonly authorizationPolicy: ActionHookAuthorizationPolicy,
    private readonly actionJournal: ActionJournalRepository,
    private readonly traceStore: TraceObservationStore,
    private readonly digest: ContentDigestPort,
    private readonly sessionActionHandler?: SessionActionHookHandlerPort,
  ) {}

  /** 严格校验 Hook Command，并以 fail-closed 语义返回稳定决策。 */
  public async execute(input: unknown): Promise<Result<HookDispatchResult, HarnessError>> {
    const command = parseCommandEnvelope(input);
    if (command.status === ResultStatus.Failure) return command;
    const payload = parseActionHookPayload(command.value.payload);
    if (payload.status === ResultStatus.Failure) return payload;
    const binding = this.validateBinding(command.value, payload.value);
    if (binding.status === ResultStatus.Failure) return binding;

    const receipt = await this.gateway.execute(input, {
      execute: async () =>
        this.handle(
          payload.value,
          command.value.expectedVersion,
          command.value.invocationProvenance,
        ),
    });
    if (receipt.status === ResultStatus.Failure) return receipt;
    return this.projectResult(payload.value, receipt.value);
  }

  private validateBinding(
    command: CommandEnvelope,
    payload: ActionHookPayload,
  ): Result<void, HarnessError> {
    const digest = this.digest.calculate(payload);
    if (digest.status === ResultStatus.Failure) return digest;
    const expectedType = `hook.${payload.event}`;
    if (
      command.commandType !== expectedType ||
      command.aggregateType !== "action" ||
      command.aggregateId !== payload.actionId ||
      command.commandId !== payload.commandId ||
      command.idempotencyKey !== payload.hookExecutionId ||
      command.correlationId !== payload.correlationId ||
      command.causationId !== payload.causationId ||
      command.submittedAt !== payload.occurredAt ||
      command.actor.kind !== payload.actor.kind ||
      command.actor.actorId !== payload.actor.actorId ||
      command.requestDigest !== digest.value
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Hook Command Envelope 与 Canonical Payload 绑定不一致。",
        ),
      );
    }
    return success(undefined);
  }

  private handle(
    payload: ActionHookPayload,
    expectedVersion: number,
    invocationProvenance: CommandEnvelope["invocationProvenance"],
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    if (payload.schemaVersion === CANONICAL_SESSION_HOOK_SCHEMA_VERSION) {
      if (this.sessionActionHandler === undefined || invocationProvenance === undefined) {
        return Promise.resolve(
          failure(
            new HarnessError(
              HarnessErrorCode.OperationForbidden,
              "Session Hook 缺少 Admission Handler 或调用来源证明。",
            ),
          ),
        );
      }
      return payload.event === HarnessHookEvent.PreAction
        ? this.sessionActionHandler.admitPreAction({
            payload,
            expectedVersion,
            invocationProvenance,
          })
        : this.sessionActionHandler.recordPostAction({
            payload,
            expectedVersion,
            invocationProvenance,
          });
    }
    return payload.event === HarnessHookEvent.PreAction
      ? this.handlePreAction(payload, expectedVersion)
      : this.handlePostAction(payload, expectedVersion);
  }

  private async handlePreAction(
    payload: PreActionHookPayload,
    expectedVersion: number,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    if (expectedVersion !== 0) return versionConflict(0, expectedVersion);
    const authorized = await this.authorizationPolicy.authorize(payload);
    if (authorized.status === ResultStatus.Failure) return authorized;
    const recorded = await this.actionJournal.createIntent(createActionIntent(payload));
    return recorded.status === ResultStatus.Failure
      ? recorded
      : success({ committedVersion: recorded.value.state.lastSequence });
  }

  private async handlePostAction(
    payload: PostActionHookPayload,
    expectedVersion: number,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const locator = {
      workspaceId: payload.workspaceId,
      taskId: payload.taskId,
      actionId: payload.actionId,
    };
    const loaded = await this.actionJournal.load(locator);
    if (loaded.status === ResultStatus.Failure) return loaded;
    const intent = loaded.value.intent;
    if (
      payload.causationId !== intent.commandId ||
      payload.correlationId !== intent.correlationId ||
      payload.actor.kind !== intent.actor.kind ||
      payload.actor.actorId !== intent.actor.actorId
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "PostAction 与已记录 Action Intent 的因果或 Actor 绑定不一致。",
        ),
      );
    }
    if (loaded.value.lastSequence !== expectedVersion) {
      return versionConflict(loaded.value.lastSequence, expectedVersion);
    }
    const observed = await this.actionJournal.appendObservation(
      createActionObservation(payload, loaded.value.lastSequence + 1),
    );
    if (observed.status === ResultStatus.Failure) return observed;
    const resolved = await this.actionJournal.appendResolution(
      createActionResolution(payload, observed.value.state.lastSequence + 1),
    );
    if (resolved.status === ResultStatus.Failure) return resolved;
    await this.traceStore.record(createActionTrace(payload));
    return success({ committedVersion: resolved.value.state.lastSequence });
  }

  private async projectResult(
    payload: ActionHookPayload,
    receipt: CommandReceipt,
  ): Promise<Result<HookDispatchResult, HarnessError>> {
    if (![CommandStatus.Committed, CommandStatus.Duplicate].includes(receipt.status)) {
      return success({
        ...projectCommandReceiptDecision(payload.event, receipt),
        schemaVersion: payload.schemaVersion,
      });
    }
    const state = await this.actionJournal.load({
      workspaceId: payload.workspaceId,
      taskId: payload.taskId,
      actionId: payload.actionId,
    });
    if (state.status === ResultStatus.Failure) return state;
    return success({
      ...projectActionStateDecision(payload.event, receipt, state.value),
      schemaVersion: payload.schemaVersion,
    });
  }
}

function versionConflict(actual: number, expected: number): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.VersionConflict, "Hook Action Journal Version 已变化。", {
      actual: String(actual),
      expected: String(expected),
    }),
  );
}
