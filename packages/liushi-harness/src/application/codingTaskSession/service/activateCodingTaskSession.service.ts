import type { CodingTaskCommandService } from "#application/codingTask/index.js";
import {
  CodingTaskSessionActivationDisposition,
  type CodingTaskRepository,
  type CodingTaskSessionActivationLease,
  type CodingTaskSessionActivationRepository,
  type ContentDigestPort,
  type ManagedWorktreePathPort,
} from "#application/ports/index.js";
import type { WorktreeProvisionCommandService } from "#application/worktreeProvisioning/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
  createCodingTaskSessionActivationRecord,
  type CodingTaskSessionActivationRecord,
} from "#domain/codingTaskSession/index.js";

import { CODING_TASK_SESSION_ACTIVATION_REPORT_SCHEMA_VERSION } from "../constants/index.js";
import {
  hasSameCodingTaskSessionActivationIdentity,
  validateAuthoritativeCodingTaskSessionBinding,
} from "../binding/index.js";
import type {
  CodingTaskSessionActivationReport,
  CodingTaskSessionActivationStageReceipt,
  CodingTaskSessionRuntimeBinding,
  PreparedCodingTaskSessionActivation,
} from "../contracts/index.js";
import {
  CodingTaskSessionActivationStage,
  CodingTaskSessionActivationStatus,
} from "../enums/index.js";
import {
  createCodingTaskSessionStoppedReport,
  executeCodingTaskSessionActivationStage,
} from "../report/index.js";
import {
  parseCodingTaskSessionActivationManifest,
  prepareCodingTaskSessionActivation,
} from "../validation/index.js";

/** 完成外部 Agent Session 的技术准备，并停在 WaitingAgent 边界。 */
export class ActivateCodingTaskSessionService {
  public constructor(
    private readonly codingTaskCommands: CodingTaskCommandService,
    private readonly worktreeProvisionCommands: WorktreeProvisionCommandService,
    private readonly codingTaskRepository: CodingTaskRepository,
    private readonly activationRepository: CodingTaskSessionActivationRepository,
    private readonly digest: ContentDigestPort,
    private readonly runtimePath: ManagedWorktreePathPort,
    private readonly activationLease: CodingTaskSessionActivationLease,
    private readonly runtimeBinding?: CodingTaskSessionRuntimeBinding,
  ) {}

  /** 验证全部输入后依次执行三个命令，并从权威状态生成 Activation Record。 */
  public async execute(
    input: unknown,
  ): Promise<Result<CodingTaskSessionActivationReport, HarnessError>> {
    const manifest = parseCodingTaskSessionActivationManifest(input);
    if (manifest.status === ResultStatus.Failure) return manifest;
    if (this.runtimeBinding === undefined) {
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "CodingTask Session Activation 缺少启动期 Runtime Binding。",
          { stage: CodingTaskSessionActivationStage.Create },
        ),
      );
    }
    const prepared = prepareCodingTaskSessionActivation(
      manifest.value,
      this.runtimeBinding,
      this.digest,
      this.runtimePath,
    );
    if (prepared.status === ResultStatus.Failure) return prepared;

    const lease = await this.activationLease.acquire({
      workspaceId: prepared.value.workspaceId,
      sessionId: prepared.value.manifest.sessionId,
    });
    if (lease.status === ResultStatus.Failure) {
      return failure(withStage(lease.error, CodingTaskSessionActivationStage.Persistence));
    }

    let result: Result<CodingTaskSessionActivationReport, HarnessError>;
    try {
      result = await this.executeWhileLeaseHeld(prepared.value);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      result = failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "CodingTask Session Activation 执行失败。",
          {},
          cause,
        ),
      );
    }
    const released = await lease.value.release();
    if (released.status === ResultStatus.Failure) {
      if (
        result.status === ResultStatus.Success &&
        result.value.status === CodingTaskSessionActivationStatus.OutcomeUnknown
      ) {
        return failure(
          new HarnessError(
            HarnessErrorCode.CodingTaskSessionActivationCommitOutcomeUnknown,
            "Activation Record 提交结果未知且 Session Lease 释放失败，禁止自动重试。",
            {
              stage: CodingTaskSessionActivationStage.Persistence,
              leaseReleaseErrorCode: released.error.code,
            },
            released.error,
          ),
        );
      }
      return failure(withStage(released.error, CodingTaskSessionActivationStage.Persistence));
    }
    return result;
  }

  private async executeWhileLeaseHeld(
    prepared: PreparedCodingTaskSessionActivation,
  ): Promise<Result<CodingTaskSessionActivationReport, HarnessError>> {
    const existing = await this.loadExisting(prepared);
    if (existing.status === ResultStatus.Failure) return existing;
    if (existing.value !== undefined) return success(existing.value);

    const receipts: CodingTaskSessionActivationStageReceipt[] = [];
    let stopped = await executeCodingTaskSessionActivationStage(
      CodingTaskSessionActivationStage.Create,
      receipts,
      () => this.codingTaskCommands.execute(prepared.manifest.createCommand),
    );
    if (stopped.status === ResultStatus.Failure) return stopped;
    if (stopped.value !== undefined) return success(stopped.value);

    stopped = await executeCodingTaskSessionActivationStage(
      CodingTaskSessionActivationStage.Provision,
      receipts,
      () =>
        this.worktreeProvisionCommands.execute(
          prepared.manifest.provision.command,
          prepared.manifest.provision.runtime,
        ),
    );
    if (stopped.status === ResultStatus.Failure) return stopped;
    if (stopped.value !== undefined) return success(stopped.value);

    stopped = await executeCodingTaskSessionActivationStage(
      CodingTaskSessionActivationStage.StartAttempt,
      receipts,
      () => this.codingTaskCommands.execute(prepared.manifest.startAttemptCommand),
    );
    if (stopped.status === ResultStatus.Failure) return stopped;
    if (stopped.value !== undefined) return success(stopped.value);

    const activation = await this.createActivationRecord(prepared);
    if (activation.status === ResultStatus.Failure) return activation;
    const persisted = await this.activationRepository.create(activation.value);
    if (persisted.status === ResultStatus.Failure) {
      if (
        persisted.error.code === HarnessErrorCode.CodingTaskSessionActivationCommitOutcomeUnknown
      ) {
        return success(
          createCodingTaskSessionStoppedReport(
            CodingTaskSessionActivationStatus.OutcomeUnknown,
            CodingTaskSessionActivationStage.Persistence,
            receipts,
          ),
        );
      }
      return failure(withStage(persisted.error, CodingTaskSessionActivationStage.Persistence));
    }
    if (persisted.value.disposition === CodingTaskSessionActivationDisposition.Conflict) {
      return success(
        createCodingTaskSessionStoppedReport(
          CodingTaskSessionActivationStatus.Blocked,
          CodingTaskSessionActivationStage.Persistence,
          receipts,
        ),
      );
    }
    return success({
      schemaVersion: CODING_TASK_SESSION_ACTIVATION_REPORT_SCHEMA_VERSION,
      status: CodingTaskSessionActivationStatus.WaitingAgent,
      receipts,
      worktreeRoot: prepared.worktreeRoot,
      activation: persisted.value.record,
      persistenceDisposition: persisted.value.disposition,
    });
  }

  private async loadExisting(
    prepared: PreparedCodingTaskSessionActivation,
  ): Promise<Result<CodingTaskSessionActivationReport | undefined, HarnessError>> {
    const loaded = await this.activationRepository.load({
      workspaceId: prepared.workspaceId,
      sessionId: prepared.manifest.sessionId,
    });
    if (loaded.status === ResultStatus.Failure) {
      return loaded.error.code === HarnessErrorCode.PreconditionNotMet
        ? success(undefined)
        : failure(withStage(loaded.error, CodingTaskSessionActivationStage.Persistence));
    }
    if (!hasSameCodingTaskSessionActivationIdentity(loaded.value, prepared)) {
      return success(
        createCodingTaskSessionStoppedReport(
          CodingTaskSessionActivationStatus.Blocked,
          CodingTaskSessionActivationStage.Persistence,
          [],
        ),
      );
    }
    return success({
      schemaVersion: CODING_TASK_SESSION_ACTIVATION_REPORT_SCHEMA_VERSION,
      status: CodingTaskSessionActivationStatus.WaitingAgent,
      receipts: [],
      worktreeRoot: prepared.worktreeRoot,
      activation: loaded.value,
      persistenceDisposition: CodingTaskSessionActivationDisposition.Reused,
    });
  }

  private async createActivationRecord(
    prepared: PreparedCodingTaskSessionActivation,
  ): Promise<Result<CodingTaskSessionActivationRecord, HarnessError>> {
    const loaded = await this.codingTaskRepository.load({
      workspaceId: prepared.workspaceId,
      codingTaskId: prepared.codingTaskId,
    });
    if (loaded.status === ResultStatus.Failure) {
      return failure(
        withStage(loaded.error, CodingTaskSessionActivationStage.AuthoritativeBinding),
      );
    }
    const authoritative = validateAuthoritativeCodingTaskSessionBinding(
      loaded.value.aggregate,
      prepared,
    );
    if (authoritative.status === ResultStatus.Failure) return authoritative;
    const { aggregate, attempt } = authoritative.value;
    const record = createCodingTaskSessionActivationRecord(
      {
        schemaVersion: CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
        sessionId: prepared.manifest.sessionId,
        workspaceId: aggregate.workspaceId,
        codingTaskId: aggregate.codingTaskId,
        sourceTaskId: aggregate.sourceTaskId,
        repositoryId: aggregate.repositoryId,
        attemptNumber: attempt.number,
        attemptStartedAt: attempt.startedAt,
        worktreeId: aggregate.worktreeBinding.worktreeId,
        worktreeRootDigest: prepared.worktreeRootDigest,
        planRiskArtifactId: aggregate.executionAuthorization.planRisk.artifactId,
        planRiskArtifactDigest: aggregate.executionAuthorization.planRisk.artifactDigest,
        agentActorId: prepared.agentActorId,
        activatedAt: attempt.startedAt,
      },
      this.digest,
    );
    return record.status === ResultStatus.Failure
      ? failure(withStage(record.error, CodingTaskSessionActivationStage.AuthoritativeBinding))
      : record;
  }
}

function withStage(error: HarnessError, stage: CodingTaskSessionActivationStage): HarnessError {
  return new HarnessError(error.code, error.message, { ...error.details, stage }, error.cause);
}
