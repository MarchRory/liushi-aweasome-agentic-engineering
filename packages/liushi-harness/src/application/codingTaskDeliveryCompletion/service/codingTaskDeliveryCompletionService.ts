import { CODING_TASK_AGGREGATE_TYPE } from "#application/codingTask/index.js";
import { createCommandEnvelope, type CommandEnvelope } from "#application/command/index.js";
import type { CodingTaskSessionDeliverySubmissionService } from "#application/codingTaskSessionDelivery/index.js";
import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type { CodingTaskVerificationCompletionService } from "#application/codingTaskVerificationCompletion/index.js";
import type {
  CodingTaskRepository,
  CodingTaskSessionCloseoutStateStore,
  ContentDigestPort,
  ManagedWorktreePathPort,
  RepositoryRootResolverPort,
} from "#application/ports/index.js";
import {
  calculateVerificationRuntimeDigest,
  VERIFICATION_RUN_COMMAND_TYPE,
  type RunVerificationCommandPayload,
} from "#application/verificationCommand/index.js";
import type { CompileProjectProfileUseCase } from "#application/useCases/compileProjectProfile/index.js";
import type { ResolveRulesUseCase } from "#application/useCases/resolveRules/index.js";
import type { SelectVerificationPlanUseCase } from "#application/useCases/selectVerificationPlan/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import type { CodingTaskAggregate } from "#domain/codingTask/index.js";
import { VerificationImpactSelectionStatus } from "#domain/verification/index.js";

import { CODING_TASK_DELIVERY_COMPLETION_REPORT_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CodingTaskDeliveryCompletionInput,
  CodingTaskDeliveryCompletionReport,
} from "../contracts/index.js";
import {
  CodingTaskDeliveryCompletionStage,
  CodingTaskDeliveryCompletionStatus,
} from "../enums/index.js";
import { parseCodingTaskDeliveryCompletionInput } from "../validation/index.js";
import {
  projectCompletionReport,
  stopAfterDelivery,
  withCompletionStage,
} from "./codingTaskDeliveryCompletionReport.js";
import { validateCodingTaskDeliveryCompletionPreflight } from "./preflight/index.js";

/** 无额外状态地串联 Session Delivery、权威 Plan、Verification 与 PR-ready。 */
export class CodingTaskDeliveryCompletionService {
  public constructor(
    private readonly deliverySubmission: Pick<
      CodingTaskSessionDeliverySubmissionService,
      "execute"
    >,
    private readonly codingTaskRepository: CodingTaskRepository,
    private readonly closeoutStateReader: Pick<
      CodingTaskSessionCloseoutStateStore<CodingTaskSessionCloseoutState>,
      "load"
    >,
    private readonly compileProjectProfile: Pick<CompileProjectProfileUseCase, "execute">,
    private readonly resolveRules: Pick<ResolveRulesUseCase, "execute">,
    private readonly selectVerificationPlan: Pick<SelectVerificationPlanUseCase, "execute">,
    private readonly repositoryRootResolver: RepositoryRootResolverPort,
    private readonly managedWorktreePath: ManagedWorktreePathPort,
    private readonly verificationCompletion: Pick<
      CodingTaskVerificationCompletionService,
      "execute"
    >,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 在有效权威运行时绑定下执行可重放主线；OutcomeUnknown 只停止，不创建新的恢复协议。 */
  public async execute(
    input: unknown,
  ): Promise<Result<CodingTaskDeliveryCompletionReport, HarnessError>> {
    const parsed = parseCodingTaskDeliveryCompletionInput(input, this.digest);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const deliveryCommand = parsed.value.deliveryCommand;
    // 运行时绑定属于启动前置条件，必须在 Delivery Gateway 写入 Reservation 前验证。
    const preflightAggregate = await this.codingTaskRepository.load({
      workspaceId: deliveryCommand.payload.workspaceId,
      codingTaskId: deliveryCommand.aggregateId,
    });
    if (preflightAggregate.status === ResultStatus.Failure) {
      return failure(
        withStage(preflightAggregate.error, CodingTaskDeliveryCompletionStage.RuntimeBinding),
      );
    }
    const preflight = await this.validatePreflight(
      preflightAggregate.value.aggregate,
      parsed.value,
    );
    if (preflight.status === ResultStatus.Failure) return preflight;

    const delivered = await this.deliverySubmission.execute(deliveryCommand);
    if (delivered.status === ResultStatus.Failure) {
      return failure(withStage(delivered.error, CodingTaskDeliveryCompletionStage.Delivery));
    }
    const stopped = stopAfterDelivery(delivered.value);
    if (stopped !== undefined) return success(stopped);

    const loaded = await this.codingTaskRepository.load({
      workspaceId: deliveryCommand.payload.workspaceId,
      codingTaskId: deliveryCommand.aggregateId,
    });
    if (loaded.status === ResultStatus.Failure) return loaded;
    const aggregate = loaded.value.aggregate;
    const attemptNumber = latestAttemptNumber(aggregate);
    if (attemptNumber.status === ResultStatus.Failure) {
      return failure(
        withStage(attemptNumber.error, CodingTaskDeliveryCompletionStage.PlanSelection),
      );
    }

    const profile = await this.compileProjectProfile.execute({
      workspaceId: aggregate.workspaceId,
      taskId: parsed.value.profileCompilation.taskId,
      artifactId: parsed.value.profileCompilation.artifactId,
      report: parsed.value.profileCompilation.report,
    });
    if (profile.status === ResultStatus.Failure) {
      return failure(
        withStage(profile.error, CodingTaskDeliveryCompletionStage.ProfileCompilation),
      );
    }
    const rules = this.resolveRules.execute({
      catalog: profile.value.ruleCatalog,
      context: parsed.value.ruleResolutionContext,
    });
    if (rules.status === ResultStatus.Failure) {
      return failure(withStage(rules.error, CodingTaskDeliveryCompletionStage.RuleResolution));
    }
    const selection = this.selectVerificationPlan.execute({
      profileBundle: profile.value,
      codingTask: aggregate,
      attemptNumber: attemptNumber.value,
      ruleBundle: rules.value,
      planId: parsed.value.verification.planId,
    });
    if (selection.status === ResultStatus.Failure) {
      return failure(withStage(selection.error, CodingTaskDeliveryCompletionStage.PlanSelection));
    }
    if (selection.value.status === VerificationImpactSelectionStatus.Blocked) {
      return success({
        schemaVersion: CODING_TASK_DELIVERY_COMPLETION_REPORT_SCHEMA_VERSION,
        status: CodingTaskDeliveryCompletionStatus.Blocked,
        stoppedStage: CodingTaskDeliveryCompletionStage.PlanSelection,
        deliveryReceipt: delivered.value,
        planSelection: selection.value,
      });
    }
    const runtime = await this.validatePreflight(aggregate, parsed.value);
    if (runtime.status === ResultStatus.Failure) return runtime;
    const command = this.createVerificationCommand(
      aggregate,
      deliveryCommand,
      parsed.value,
      selection.value.plan,
    );
    if (command.status === ResultStatus.Failure) return command;
    const completed = await this.verificationCompletion.execute({
      command: command.value,
      runtime: parsed.value.verification.runtime,
    });
    if (completed.status === ResultStatus.Failure) {
      return failure(withCompletionStage(completed.error));
    }
    return success(projectCompletionReport(delivered.value, selection.value, completed.value));
  }

  private validatePreflight(
    aggregate: CodingTaskAggregate,
    input: CodingTaskDeliveryCompletionInput,
  ): Promise<Result<void, HarnessError>> {
    return validateCodingTaskDeliveryCompletionPreflight(aggregate, input, {
      closeoutStateReader: this.closeoutStateReader,
      repositoryRootResolver: this.repositoryRootResolver,
      managedWorktreePath: this.managedWorktreePath,
    });
  }

  private createVerificationCommand(
    aggregate: CodingTaskAggregate,
    deliveryCommand: CommandEnvelope,
    input: CodingTaskDeliveryCompletionInput,
    plan: RunVerificationCommandPayload["plan"],
  ): Result<CommandEnvelope<RunVerificationCommandPayload>, HarnessError> {
    const runtimeDigest = calculateVerificationRuntimeDigest(
      this.digest,
      input.verification.runtime,
    );
    if (runtimeDigest.status === ResultStatus.Failure) return runtimeDigest;
    const attemptNumber = latestAttemptNumber(aggregate);
    if (attemptNumber.status === ResultStatus.Failure) return attemptNumber;
    const payload: RunVerificationCommandPayload = {
      workspaceId: aggregate.workspaceId,
      actionId: input.verification.actionId,
      verificationRunId: input.verification.verificationRunId,
      attemptNumber: attemptNumber.value,
      worktreeRootDigest: runtimeDigest.value,
      plan,
      failedVerificationTaxonomy: input.verification.failedVerificationTaxonomy,
    };
    const requestDigest = this.digest.calculate(payload);
    if (requestDigest.status === ResultStatus.Failure) return requestDigest;
    return createCommandEnvelope({
      commandId: input.verification.commandId,
      commandType: VERIFICATION_RUN_COMMAND_TYPE,
      aggregateType: CODING_TASK_AGGREGATE_TYPE,
      aggregateId: deliveryCommand.aggregateId,
      expectedVersion: aggregate.version,
      idempotencyKey: input.verification.idempotencyKey,
      requestDigest: requestDigest.value,
      actor: input.verification.actor,
      authorizationContext: input.verification.authorizationContext,
      correlationId: deliveryCommand.correlationId,
      causationId: deliveryCommand.commandId,
      ...(input.verification.invocationProvenance === undefined
        ? {}
        : { invocationProvenance: input.verification.invocationProvenance }),
      submittedAt: input.verification.submittedAt,
      payload,
    });
  }
}

function latestAttemptNumber(aggregate: CodingTaskAggregate): Result<number, HarnessError> {
  const attempt = aggregate.attempts.at(-1);
  return attempt === undefined
    ? failure(
        new HarnessError(
          HarnessErrorCode.InvalidStateTransition,
          "CodingTask 尚未形成可交付的实现尝试。",
        ),
      )
    : success(attempt.number);
}

function withStage(error: HarnessError, stage: CodingTaskDeliveryCompletionStage): HarnessError {
  return new HarnessError(error.code, error.message, { ...error.details, stage }, error.cause);
}
