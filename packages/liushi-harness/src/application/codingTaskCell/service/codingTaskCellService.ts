import type { CodingTaskCommandService } from "#application/codingTask/index.js";
import {
  CommandStatus,
  type CommandEnvelope,
  type CommandReceipt,
} from "#application/command/index.js";
import type { ImplementationCommandService } from "#application/implementationCommand/index.js";
import type { ImplementationSubmissionService } from "#application/implementationSubmission/index.js";
import type { EvidenceBundleStore } from "#application/ports/index.js";
import {
  parseRunVerificationPayload,
  type VerificationCommandService,
} from "#application/verificationCommand/index.js";
import type { WorktreeProvisionCommandService } from "#application/worktreeProvisioning/index.js";
import { HarnessError, ResultStatus, failure, success, type Result } from "#common/index.js";
import { parseCodingTaskId } from "#domain/codingTask/index.js";
import { VerificationStatus, type EvidenceBundle } from "#domain/verification/index.js";

import {
  CODING_TASK_CELL_REPORT_SCHEMA_VERSION,
  type CodingTaskCellReport,
  type CodingTaskCellStageReceipt,
} from "../contracts/index.js";
import { CodingTaskCellStage, CodingTaskCellStatus } from "../enums/index.js";
import { parseCodingTaskCellManifest } from "../validation/index.js";

/** 串行编排已获 Human Gate 授权的 CodingTask 编码阶段。 */
export class CodingTaskCellService {
  public constructor(
    private readonly codingTaskCommands: CodingTaskCommandService,
    private readonly worktreeProvisionCommands: WorktreeProvisionCommandService,
    private readonly implementationCommands: ImplementationCommandService,
    private readonly implementationSubmissions: ImplementationSubmissionService,
    private readonly verificationCommands: VerificationCommandService,
    private readonly evidenceBundleStore: EvidenceBundleStore,
  ) {}

  /** 按冻结顺序执行 Cell；任何非确定完成状态都会立即停止。 */
  public async execute(input: unknown): Promise<Result<CodingTaskCellReport, HarnessError>> {
    const parsed = parseCodingTaskCellManifest(input);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const manifest = parsed.value;
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
    stopped = await executeStage(CodingTaskCellStage.Verification, receipts, () =>
      this.verificationCommands.execute(
        manifest.verification.command,
        manifest.verification.runtime,
      ),
    );
    if (stopped.status === ResultStatus.Failure) return stopped;
    if (stopped.value !== undefined) return success(stopped.value);

    const locator = createEvidenceLocator(manifest.verification.command);
    if (locator.status === ResultStatus.Failure) {
      return failure(withStage(locator.error, CodingTaskCellStage.Evidence));
    }
    const evidence = await this.evidenceBundleStore.load(locator.value);
    if (evidence.status === ResultStatus.Failure) {
      return failure(withStage(evidence.error, CodingTaskCellStage.Evidence));
    }
    return success(createEvidenceReport(receipts, evidence.value));
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

function createEvidenceLocator(command: CommandEnvelope) {
  const payload = parseRunVerificationPayload(command.payload);
  if (payload.status === ResultStatus.Failure) return payload;
  const codingTaskId = parseCodingTaskId(command.aggregateId);
  if (codingTaskId.status === ResultStatus.Failure) return codingTaskId;
  return success({
    workspaceId: payload.value.workspaceId,
    codingTaskId: codingTaskId.value,
    verificationRunId: payload.value.verificationRunId,
  });
}

function createEvidenceReport(
  receipts: readonly CodingTaskCellStageReceipt[],
  evidenceBundle: EvidenceBundle,
): CodingTaskCellReport {
  return evidenceBundle.status === VerificationStatus.Passed
    ? {
        schemaVersion: CODING_TASK_CELL_REPORT_SCHEMA_VERSION,
        status: CodingTaskCellStatus.ReviewReady,
        receipts,
        evidenceBundle,
      }
    : {
        schemaVersion: CODING_TASK_CELL_REPORT_SCHEMA_VERSION,
        status: CodingTaskCellStatus.Blocked,
        stoppedStage: CodingTaskCellStage.Evidence,
        receipts,
        evidenceBundle,
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
