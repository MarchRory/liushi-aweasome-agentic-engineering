import type { AssemblePrReadyArtifactUseCase } from "#application/useCases/assemblePrReadyArtifact/index.js";
import { CommandStatus, type CommandReceipt } from "#application/command/index.js";
import type { ContentDigestPort, EvidenceBundleStore } from "#application/ports/index.js";
import {
  parseRunVerificationPayload,
  validateVerificationEvidenceBinding,
  type VerificationCommandService,
} from "#application/verificationCommand/index.js";
import { HarnessError, ResultStatus, failure, success, type Result } from "#common/index.js";
import { parseCodingTaskId } from "#domain/codingTask/index.js";
import { VerificationStatus } from "#domain/verification/index.js";

import { CODING_TASK_VERIFICATION_COMPLETION_REPORT_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CodingTaskVerificationCompletionInput,
  CodingTaskVerificationCompletionReport,
} from "../contracts/index.js";
import {
  CodingTaskVerificationCompletionStage,
  CodingTaskVerificationCompletionStatus,
} from "../enums/index.js";

/** 复用既有 Verification Command、Evidence Store 与 PR-ready 装配的窄尾链。 */
export class CodingTaskVerificationCompletionService {
  public constructor(
    private readonly verificationCommands: Pick<VerificationCommandService, "execute">,
    private readonly evidenceBundleStore: EvidenceBundleStore,
    private readonly assemblePrReadyArtifact: Pick<AssemblePrReadyArtifactUseCase, "execute">,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 执行可重放尾链；不持久化额外流程状态。 */
  public async execute(
    input: CodingTaskVerificationCompletionInput,
  ): Promise<Result<CodingTaskVerificationCompletionReport, HarnessError>> {
    const payload = parseRunVerificationPayload(input.command.payload);
    if (payload.status === ResultStatus.Failure) {
      return failure(withStage(payload.error, CodingTaskVerificationCompletionStage.Verification));
    }
    const codingTaskId = parseCodingTaskId(input.command.aggregateId);
    if (codingTaskId.status === ResultStatus.Failure) {
      return failure(
        withStage(codingTaskId.error, CodingTaskVerificationCompletionStage.Verification),
      );
    }
    const planDigest = this.digest.calculate(payload.value.plan);
    if (planDigest.status === ResultStatus.Failure) {
      return failure(
        withStage(planDigest.error, CodingTaskVerificationCompletionStage.Verification),
      );
    }

    const executed = await this.verificationCommands.execute(input.command, input.runtime);
    if (executed.status === ResultStatus.Failure) {
      return failure(withStage(executed.error, CodingTaskVerificationCompletionStage.Verification));
    }
    const stopped = toStoppedReport(executed.value);
    if (stopped !== undefined) return success(stopped);

    const evidence = await this.evidenceBundleStore.load({
      workspaceId: payload.value.workspaceId,
      codingTaskId: codingTaskId.value,
      verificationRunId: payload.value.verificationRunId,
    });
    if (evidence.status === ResultStatus.Failure) {
      return failure(withStage(evidence.error, CodingTaskVerificationCompletionStage.Evidence));
    }
    const validatedEvidence = validateVerificationEvidenceBinding(
      evidence.value,
      payload.value,
      planDigest.value,
    );
    if (validatedEvidence.status === ResultStatus.Failure) {
      return failure(
        withStage(validatedEvidence.error, CodingTaskVerificationCompletionStage.Evidence),
      );
    }
    const evidenceStatus = toEvidenceStatus(validatedEvidence.value.status);
    if (evidenceStatus !== CodingTaskVerificationCompletionStatus.ReviewReady) {
      return success(
        report(evidenceStatus, executed.value, {
          stoppedStage: CodingTaskVerificationCompletionStage.Evidence,
          evidenceBundle: validatedEvidence.value,
        }),
      );
    }
    const prReady = await this.assemblePrReadyArtifact.execute({
      workspaceId: payload.value.workspaceId,
      codingTaskId: codingTaskId.value,
      verificationRunId: payload.value.verificationRunId,
      expectedPlanDigest: planDigest.value,
    });
    return prReady.status === ResultStatus.Failure
      ? failure(withStage(prReady.error, CodingTaskVerificationCompletionStage.PrReady))
      : success(
          report(CodingTaskVerificationCompletionStatus.ReviewReady, executed.value, {
            evidenceBundle: validatedEvidence.value,
            prReadyArtifact: prReady.value,
          }),
        );
  }
}

function toStoppedReport(
  receipt: CommandReceipt,
): CodingTaskVerificationCompletionReport | undefined {
  switch (receipt.status) {
    case CommandStatus.Committed:
    case CommandStatus.Duplicate:
      return undefined;
    case CommandStatus.Rejected:
    case CommandStatus.Conflict:
      return report(CodingTaskVerificationCompletionStatus.CommandBlocked, receipt, {
        stoppedStage: CodingTaskVerificationCompletionStage.Verification,
      });
    case CommandStatus.OutcomeUnknown:
      return report(CodingTaskVerificationCompletionStatus.OutcomeUnknown, receipt, {
        stoppedStage: CodingTaskVerificationCompletionStage.Verification,
      });
  }
}

function toEvidenceStatus(status: VerificationStatus): CodingTaskVerificationCompletionStatus {
  switch (status) {
    case VerificationStatus.Passed:
      return CodingTaskVerificationCompletionStatus.ReviewReady;
    case VerificationStatus.Failed:
      return CodingTaskVerificationCompletionStatus.VerificationFailed;
    case VerificationStatus.Blocked:
      return CodingTaskVerificationCompletionStatus.VerificationBlocked;
    case VerificationStatus.Waived:
      return CodingTaskVerificationCompletionStatus.VerificationWaived;
  }
}

/** Completion Report 可选的稳定产物字段。 */
interface CodingTaskVerificationCompletionReportFields {
  /** 非 ReviewReady 状态停止的阶段。 */
  readonly stoppedStage?: NonNullable<CodingTaskVerificationCompletionReport["stoppedStage"]>;
  /** 已形成的 EvidenceBundle。 */
  readonly evidenceBundle?: NonNullable<CodingTaskVerificationCompletionReport["evidenceBundle"]>;
  /** 已形成的 PR-ready Artifact。 */
  readonly prReadyArtifact?: NonNullable<CodingTaskVerificationCompletionReport["prReadyArtifact"]>;
}

function report(
  status: CodingTaskVerificationCompletionStatus,
  receipt: CommandReceipt,
  optional: CodingTaskVerificationCompletionReportFields = {},
): CodingTaskVerificationCompletionReport {
  return {
    schemaVersion: CODING_TASK_VERIFICATION_COMPLETION_REPORT_SCHEMA_VERSION,
    status,
    receipt,
    ...optional,
  };
}

function withStage(
  error: HarnessError,
  stage: CodingTaskVerificationCompletionStage,
): HarnessError {
  return new HarnessError(
    error.code,
    error.message,
    { ...error.details, completionStage: stage },
    error.cause,
  );
}
