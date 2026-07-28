import type { CodingTaskCommandService } from "#application/codingTask/index.js";
import { CommandStatus, type CommandReceipt } from "#application/command/index.js";
import {
  CodingTaskVerificationCompletionStage,
  CodingTaskVerificationCompletionStatus,
  type CodingTaskVerificationCompletionService,
} from "#application/codingTaskVerificationCompletion/index.js";
import type { ImplementationCommandService } from "#application/implementationCommand/index.js";
import type { ImplementationSubmissionService } from "#application/implementationSubmission/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import type { WorktreeProvisionCommandService } from "#application/worktreeProvisioning/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import type { PrReadyArtifact } from "#domain/repositoryDelivery/index.js";
import type { EvidenceBundle } from "#domain/verification/index.js";

import {
  CODING_TASK_CELL_REPORT_SCHEMA_VERSION,
  type CodingTaskCellReport,
  type CodingTaskCellStageReceipt,
} from "../contracts/index.js";
import { CodingTaskCellStage, CodingTaskCellStatus } from "../enums/index.js";
import {
  validateCodingTaskCellRuntimeBinding,
  type CodingTaskCellRuntimeBinding,
  type CodingTaskCellRuntimePathPort,
} from "../runtimeBinding/index.js";
import { parseCodingTaskCellManifest } from "../validation/index.js";
import type { CodingTaskCellVerificationBindingService } from "../verificationBinding/index.js";

/**
 * 串行编排由受信宿主预编译的 CodingTask 兼容 Cell。
 *
 * 该入口不负责从 G8 Profile 与 Rule Bundle 选择 Plan，不能作为不受信 Agent 的黄金入口。
 */
export class CodingTaskCellService {
  public constructor(
    private readonly codingTaskCommands: CodingTaskCommandService,
    private readonly worktreeProvisionCommands: WorktreeProvisionCommandService,
    private readonly implementationCommands: ImplementationCommandService,
    private readonly implementationSubmissions: ImplementationSubmissionService,
    private readonly verificationBinding: CodingTaskCellVerificationBindingService,
    private readonly verificationCompletion: Pick<
      CodingTaskVerificationCompletionService,
      "execute"
    >,
    private readonly digest: ContentDigestPort,
    private readonly runtimePath: CodingTaskCellRuntimePathPort,
    private readonly runtimeBinding?: CodingTaskCellRuntimeBinding,
  ) {}

  /** 按冻结顺序执行 Cell；任何非确定完成状态都会立即停止。 */
  public async execute(input: unknown): Promise<Result<CodingTaskCellReport, HarnessError>> {
    const parsed = parseCodingTaskCellManifest(input, this.digest);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const manifest = parsed.value;
    if (this.runtimeBinding === undefined) {
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "CodingTask Cell 执行缺少可信 Runtime Binding。",
          { stage: CodingTaskCellStage.Create },
        ),
      );
    }
    const binding = validateCodingTaskCellRuntimeBinding(
      manifest,
      this.runtimeBinding,
      this.digest,
      this.runtimePath,
    );
    if (binding.status === ResultStatus.Failure) return binding;
    const receipts: CodingTaskCellStageReceipt[] = [];

    let stopped = await executeStage(CodingTaskCellStage.Create, receipts, () =>
      this.codingTaskCommands.execute(manifest.createCommand),
    );
    if (stopped.status === ResultStatus.Failure) return stopped;
    if (stopped.value !== undefined) return success(stopped.value);
    stopped = await executeStage(CodingTaskCellStage.Provision, receipts, () =>
      this.worktreeProvisionCommands.execute(
        manifest.provision.command,
        manifest.provision.runtime,
      ),
    );
    if (stopped.status === ResultStatus.Failure) return stopped;
    if (stopped.value !== undefined) return success(stopped.value);
    stopped = await executeStage(CodingTaskCellStage.StartAttempt, receipts, () =>
      this.codingTaskCommands.execute(manifest.startAttemptCommand),
    );
    if (stopped.status === ResultStatus.Failure) return stopped;
    if (stopped.value !== undefined) return success(stopped.value);

    for (const [implementationIndex, implementation] of manifest.implementations.entries()) {
      stopped = await executeStage(
        CodingTaskCellStage.Implementation,
        receipts,
        () => this.implementationCommands.execute(implementation.command, implementation.runtime),
        implementationIndex,
      );
      if (stopped.status === ResultStatus.Failure) return stopped;
      if (stopped.value !== undefined) return success(stopped.value);
    }
    stopped = await executeStage(CodingTaskCellStage.Submission, receipts, () =>
      this.implementationSubmissions.execute(
        manifest.submission.command,
        manifest.submission.runtime,
      ),
    );
    if (stopped.status === ResultStatus.Failure) return stopped;
    if (stopped.value !== undefined) return success(stopped.value);
    const verificationCommand = await this.verificationBinding.bind({
      command: manifest.verification.command,
      binding: manifest.verification.binding,
    });
    if (verificationCommand.status === ResultStatus.Failure) {
      return failure(withStage(verificationCommand.error, CodingTaskCellStage.VerificationBinding));
    }
    const completion = await this.verificationCompletion.execute({
      command: verificationCommand.value,
      runtime: manifest.verification.runtime,
    });
    if (completion.status === ResultStatus.Failure) {
      return failure(withCompletionStage(completion.error));
    }
    receipts.push({
      stage: CodingTaskCellStage.Verification,
      receipt: completion.value.receipt,
    });
    switch (completion.value.status) {
      case CodingTaskVerificationCompletionStatus.ReviewReady:
        return success(
          createReviewReadyReport(
            receipts,
            completion.value.evidenceBundle!,
            completion.value.prReadyArtifact!,
          ),
        );
      case CodingTaskVerificationCompletionStatus.CommandBlocked:
        return success(
          createStoppedReport(
            CodingTaskCellStatus.Blocked,
            CodingTaskCellStage.Verification,
            receipts,
          ),
        );
      case CodingTaskVerificationCompletionStatus.OutcomeUnknown:
        return success(
          createStoppedReport(
            CodingTaskCellStatus.OutcomeUnknown,
            CodingTaskCellStage.Verification,
            receipts,
          ),
        );
      case CodingTaskVerificationCompletionStatus.VerificationFailed:
      case CodingTaskVerificationCompletionStatus.VerificationBlocked:
      case CodingTaskVerificationCompletionStatus.VerificationWaived:
        return success(createBlockedEvidenceReport(receipts, completion.value.evidenceBundle!));
    }
  }
}

async function executeStage(
  stage: CodingTaskCellStage,
  receipts: CodingTaskCellStageReceipt[],
  execute: () => Promise<Result<CommandReceipt, HarnessError>>,
  implementationIndex?: number,
): Promise<Result<CodingTaskCellReport | undefined, HarnessError>> {
  const result = await execute();
  if (result.status === ResultStatus.Failure) return failure(withStage(result.error, stage));
  receipts.push({
    stage,
    ...(implementationIndex === undefined ? {} : { implementationIndex }),
    receipt: result.value,
  });
  switch (result.value.status) {
    case CommandStatus.Committed:
    case CommandStatus.Duplicate:
      return success(undefined);
    case CommandStatus.Rejected:
    case CommandStatus.Conflict:
      return success(createStoppedReport(CodingTaskCellStatus.Blocked, stage, receipts));
    case CommandStatus.OutcomeUnknown:
      return success(createStoppedReport(CodingTaskCellStatus.OutcomeUnknown, stage, receipts));
  }
}

function createBlockedEvidenceReport(
  receipts: readonly CodingTaskCellStageReceipt[],
  evidenceBundle: EvidenceBundle,
): CodingTaskCellReport {
  return {
    schemaVersion: CODING_TASK_CELL_REPORT_SCHEMA_VERSION,
    status: CodingTaskCellStatus.Blocked,
    stoppedStage: CodingTaskCellStage.Evidence,
    receipts,
    evidenceBundle,
  };
}

function createReviewReadyReport(
  receipts: readonly CodingTaskCellStageReceipt[],
  evidenceBundle: EvidenceBundle,
  prReadyArtifact: PrReadyArtifact,
): CodingTaskCellReport {
  return {
    schemaVersion: CODING_TASK_CELL_REPORT_SCHEMA_VERSION,
    status: CodingTaskCellStatus.ReviewReady,
    receipts,
    evidenceBundle,
    prReadyArtifact,
  };
}

function createStoppedReport(
  status: CodingTaskCellStatus,
  stoppedStage: CodingTaskCellStage,
  receipts: readonly CodingTaskCellStageReceipt[],
): CodingTaskCellReport {
  return {
    schemaVersion: CODING_TASK_CELL_REPORT_SCHEMA_VERSION,
    status,
    stoppedStage,
    receipts: [...receipts],
  };
}

function withStage(error: HarnessError, stage: CodingTaskCellStage): HarnessError {
  return new HarnessError(error.code, error.message, { ...error.details, stage }, error.cause);
}

function withCompletionStage(error: HarnessError): HarnessError {
  const { completionStage, ...details } = error.details;
  const stage =
    completionStage === CodingTaskVerificationCompletionStage.Evidence
      ? CodingTaskCellStage.Evidence
      : completionStage === CodingTaskVerificationCompletionStage.PrReady
        ? CodingTaskCellStage.PrReady
        : CodingTaskCellStage.Verification;
  return new HarnessError(error.code, error.message, { ...details, stage }, error.cause);
}
