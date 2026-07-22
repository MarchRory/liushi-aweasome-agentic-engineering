import { CommandStatus, type CommandReceipt } from "#application/command/index.js";
import { HarnessError, ResultStatus, failure, success, type Result } from "#common/index.js";

import { CODING_TASK_SESSION_ACTIVATION_REPORT_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CodingTaskSessionActivationReport,
  CodingTaskSessionActivationStageReceipt,
} from "../contracts/index.js";
import {
  CodingTaskSessionActivationStatus,
  type CodingTaskSessionActivationStage,
} from "../enums/index.js";

/** 执行一个版本化命令阶段，并投影稳定 Session Activation Report。 */
export async function executeCodingTaskSessionActivationStage(
  stage: CodingTaskSessionActivationStage,
  receipts: CodingTaskSessionActivationStageReceipt[],
  execute: () => Promise<Result<CommandReceipt, HarnessError>>,
): Promise<Result<CodingTaskSessionActivationReport | undefined, HarnessError>> {
  const result = await execute();
  if (result.status === ResultStatus.Failure) return failure(withStage(result.error, stage));
  receipts.push({ stage, receipt: result.value });
  switch (result.value.status) {
    case CommandStatus.Committed:
    case CommandStatus.Duplicate:
      return success(undefined);
    case CommandStatus.Rejected:
    case CommandStatus.Conflict:
      return success(
        createCodingTaskSessionStoppedReport(
          CodingTaskSessionActivationStatus.Blocked,
          stage,
          receipts,
        ),
      );
    case CommandStatus.OutcomeUnknown:
      return success(
        createCodingTaskSessionStoppedReport(
          CodingTaskSessionActivationStatus.OutcomeUnknown,
          stage,
          receipts,
        ),
      );
  }
}

/** 创建不携带运行时路径或 Activation Record 的停止报告。 */
export function createCodingTaskSessionStoppedReport(
  status: CodingTaskSessionActivationStatus,
  stoppedStage: CodingTaskSessionActivationStage,
  receipts: readonly CodingTaskSessionActivationStageReceipt[],
): CodingTaskSessionActivationReport {
  return {
    schemaVersion: CODING_TASK_SESSION_ACTIVATION_REPORT_SCHEMA_VERSION,
    status,
    stoppedStage,
    receipts: [...receipts],
  };
}

function withStage(error: HarnessError, stage: CodingTaskSessionActivationStage): HarnessError {
  return new HarnessError(error.code, error.message, { ...error.details, stage }, error.cause);
}
