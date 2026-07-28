import type { JournaledActionRunner } from "#application/actionExecution/index.js";
import {
  CODING_TASK_AGGREGATE_TYPE,
  CodingTaskCommandType,
  codingTaskVersionConflict,
  type CodingTaskCommandHandler,
  type CodingTaskCommandPayload,
} from "#application/codingTask/index.js";
import { parseCommandEnvelope, type CommandEnvelope } from "#application/command/index.js";
import type { CommandHandlerSuccess } from "#application/commandGateway/index.js";
import type {
  CodingTaskExecutionAuthorizationResolver,
  CodingTaskRepository,
  ContentDigestPort,
  EvidenceBundleStore,
  RepositoryLockPort,
} from "#application/ports/index.js";
import type { UnresolvedWorktreeProvisionGuard } from "#application/worktreeProvisioning/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionJournalStatus,
  ActionKind,
  type ActionIntentRecord,
} from "#domain/actionJournal/index.js";
import {
  CodingTaskVerificationOutcome,
  parseCodingTaskId,
  type CodingTaskAggregate,
} from "#domain/codingTask/index.js";
import { VerificationStatus, type EvidenceBundle } from "#domain/verification/index.js";
import { FailureTaxonomy } from "#domain/workflow/index.js";

import { calculateVerificationRuntimeDigest } from "../binding/index.js";
import { VERIFICATION_RUN_COMMAND_TYPE } from "../constants/index.js";
import type {
  RunVerificationCommandPayload,
  VerificationCommandRuntimeContext,
} from "../contracts/index.js";
import type { VerificationActionExecutor } from "../executor/index.js";
import {
  parseRunVerificationPayload,
  validateVerificationAggregate,
  validateVerificationEvidenceBinding,
  validateVerificationRuntime,
  type ValidatedRunVerificationPayload,
} from "../validation/index.js";

/** 通过 Gateway、Journal 和 Evidence Store 运行并接纳 CodingTask Verification。 */
export class VerificationCommandHandler {
  public constructor(
    private readonly repository: CodingTaskRepository,
    private readonly authorizationResolver: CodingTaskExecutionAuthorizationResolver,
    private readonly repositoryLock: RepositoryLockPort,
    private readonly journaledActionRunner: JournaledActionRunner,
    private readonly actionExecutor: VerificationActionExecutor,
    private readonly evidenceStore: EvidenceBundleStore,
    private readonly codingTaskHandler: CodingTaskCommandHandler,
    private readonly digest: ContentDigestPort,
    private readonly unresolvedProvisionGuard: UnresolvedWorktreeProvisionGuard,
  ) {}

  /** 在 Gateway Reservation 前校验 Runtime Root 与 Command Digest 绑定。 */
  public validateRuntimeBinding(
    input: unknown,
    runtimeInput: VerificationCommandRuntimeContext,
  ): Result<void, HarnessError> {
    const command = parseCommandEnvelope(input);
    if (command.status === ResultStatus.Failure) return command;
    const runtime = validateVerificationRuntime(runtimeInput);
    if (runtime.status === ResultStatus.Failure) return runtime;
    const validated = this.validateEnvelope(command.value, runtime.value);
    return validated.status === ResultStatus.Failure ? validated : success(undefined);
  }

  /** 执行已由 Gateway 授予执行权的 Verification Command。 */
  public async execute(
    command: CommandEnvelope<RunVerificationCommandPayload>,
    runtimeInput: VerificationCommandRuntimeContext,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const runtime = validateVerificationRuntime(runtimeInput);
    if (runtime.status === ResultStatus.Failure) return runtime;
    const envelope = this.validateEnvelope(command, runtime.value);
    if (envelope.status === ResultStatus.Failure) return envelope;
    const codingTaskId = parseCodingTaskId(command.aggregateId);
    if (codingTaskId.status === ResultStatus.Failure) return codingTaskId;
    const locator = { workspaceId: envelope.value.workspaceId, codingTaskId: codingTaskId.value };
    const loaded = await this.repository.load(locator);
    if (loaded.status === ResultStatus.Failure) return loaded;
    const aggregate = loaded.value.aggregate;
    if (aggregate.version !== command.expectedVersion) {
      return failure(codingTaskVersionConflict(command.expectedVersion, aggregate.version));
    }
    const executable = validateVerificationAggregate(aggregate, envelope.value);
    if (executable.status === ResultStatus.Failure) return executable;
    const planDigest = this.digest.calculate(envelope.value.plan);
    if (planDigest.status === ResultStatus.Failure) return planDigest;
    const authorized = await this.authorizationResolver.resolve({
      sourceTaskId: aggregate.sourceTaskId,
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
      writeSet: aggregate.writeSet,
      requested: aggregate.executionAuthorization,
    });
    if (authorized.status === ResultStatus.Failure) return authorized;

    const lock = await this.repositoryLock.acquire({
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
      holderId: aggregate.codingTaskId,
    });
    if (lock.status === ResultStatus.Failure) return lock;
    const result = await this.runLocked(
      command,
      envelope.value,
      runtime.value,
      aggregate,
      planDigest.value,
    );
    const released = await lock.value.release();
    return released.status === ResultStatus.Failure ? released : result;
  }

  private async runLocked(
    command: CommandEnvelope<RunVerificationCommandPayload>,
    payload: ValidatedRunVerificationPayload,
    runtime: VerificationCommandRuntimeContext,
    aggregate: CodingTaskAggregate,
    planDigest: ContentDigest,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const guarded = await this.unresolvedProvisionGuard.check(aggregate);
    if (guarded.status === ResultStatus.Failure) return guarded;
    const intent = this.createIntent(command, payload, aggregate);
    if (intent.status === ResultStatus.Failure) return intent;
    const journaled = await this.journaledActionRunner.execute(
      {
        intent: intent.value,
        executionInput: {
          locator: {
            workspaceId: aggregate.workspaceId,
            codingTaskId: aggregate.codingTaskId,
            verificationRunId: payload.verificationRunId,
          },
          verificationRunId: payload.verificationRunId,
          plan: payload.plan,
          worktreeRoot: runtime.worktreeRoot,
        },
      },
      this.actionExecutor,
    );
    if (journaled.status === ResultStatus.Failure) return journaled;
    if (
      journaled.value.state.status !== ActionJournalStatus.Committed &&
      journaled.value.state.status !== ActionJournalStatus.Recovered
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
          "Verification Action 未形成可接纳的完成态。",
          { actionId: payload.actionId, status: journaled.value.state.status },
        ),
      );
    }
    const bundle = await this.evidenceStore.load({
      workspaceId: aggregate.workspaceId,
      codingTaskId: aggregate.codingTaskId,
      verificationRunId: payload.verificationRunId,
    });
    if (bundle.status === ResultStatus.Failure) return bundle;
    const validatedBundle = validateVerificationEvidenceBinding(bundle.value, payload, planDigest);
    if (validatedBundle.status === ResultStatus.Failure) return validatedBundle;
    return this.finishCodingTask(command, payload, aggregate, validatedBundle.value);
  }

  private finishCodingTask(
    command: CommandEnvelope<RunVerificationCommandPayload>,
    payload: ValidatedRunVerificationPayload,
    aggregate: CodingTaskAggregate,
    bundle: EvidenceBundle,
  ): Promise<Result<CommandHandlerSuccess, HarnessError>> {
    const finishPayload = projectFinishPayload(payload, bundle);
    const requestDigest = this.digest.calculate(finishPayload);
    if (requestDigest.status === ResultStatus.Failure) return Promise.resolve(requestDigest);
    const internalCommand: CommandEnvelope<CodingTaskCommandPayload> = {
      ...command,
      commandType: CodingTaskCommandType.FinishVerification,
      expectedVersion: aggregate.version,
      idempotencyKey: `${command.idempotencyKey}.finish`,
      requestDigest: requestDigest.value,
      payload: finishPayload,
    };
    return this.codingTaskHandler.execute(internalCommand);
  }

  private validateEnvelope(
    command: CommandEnvelope,
    runtime: VerificationCommandRuntimeContext,
  ): Result<ValidatedRunVerificationPayload, HarnessError> {
    if (
      command.commandType !== VERIFICATION_RUN_COMMAND_TYPE ||
      command.aggregateType !== CODING_TASK_AGGREGATE_TYPE
    ) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Verification Command 作用域无效。"),
      );
    }
    const payload = parseRunVerificationPayload(command.payload);
    if (payload.status === ResultStatus.Failure) return payload;
    const payloadDigest = this.digest.calculate(command.payload);
    if (payloadDigest.status === ResultStatus.Failure) return payloadDigest;
    if (payloadDigest.value !== command.requestDigest) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Verification Payload Digest 不匹配。"),
      );
    }
    const runtimeDigest = calculateVerificationRuntimeDigest(this.digest, runtime);
    if (runtimeDigest.status === ResultStatus.Failure) return runtimeDigest;
    return runtimeDigest.value === payload.value.worktreeRootDigest
      ? payload
      : failure(
          new HarnessError(
            HarnessErrorCode.InvalidInput,
            "Verification Runtime Root Digest 不匹配。",
          ),
        );
  }

  private createIntent(
    command: CommandEnvelope,
    payload: ValidatedRunVerificationPayload,
    aggregate: CodingTaskAggregate,
  ): Result<ActionIntentRecord, HarnessError> {
    const postconditionDigest = this.digest.calculate({
      plan: payload.plan,
      evidence: payload.verificationRunId,
    });
    if (postconditionDigest.status === ResultStatus.Failure) return postconditionDigest;
    return success({
      schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
      recordType: ActionJournalRecordType.Intent,
      actionId: payload.actionId,
      sequence: 1,
      workspaceId: aggregate.workspaceId,
      taskId: aggregate.sourceTaskId,
      commandId: command.commandId,
      correlationId: command.correlationId,
      ...(command.causationId === undefined ? {} : { causationId: command.causationId }),
      idempotencyKey: command.idempotencyKey,
      kind: ActionKind.CommandExecution,
      target: JSON.stringify({
        repositoryId: aggregate.repositoryId,
        worktreeId: payload.plan.worktreeId,
        planId: payload.plan.planId,
      }),
      inputDigest: command.requestDigest,
      postconditionDigest: postconditionDigest.value,
      baseRevision: aggregate.baseRevision,
      recoveryGuidance: "读取 EvidenceBundle 与 Action Journal 后，由 Human 决定接纳或重新运行。",
      actor: command.actor,
      recordedAt: command.submittedAt,
    });
  }
}

function projectFinishPayload(payload: ValidatedRunVerificationPayload, bundle: EvidenceBundle) {
  if (bundle.status === VerificationStatus.Passed) {
    return {
      workspaceId: payload.workspaceId,
      attemptNumber: payload.attemptNumber,
      outcome: CodingTaskVerificationOutcome.Passed,
    };
  }
  return {
    workspaceId: payload.workspaceId,
    attemptNumber: payload.attemptNumber,
    outcome: CodingTaskVerificationOutcome.Failed,
    failureTaxonomy:
      bundle.status === VerificationStatus.Failed
        ? payload.failedVerificationTaxonomy
        : FailureTaxonomy.EnvironmentFailure,
  };
}
