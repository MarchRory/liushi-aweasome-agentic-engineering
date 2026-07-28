import { CommandStatus, type CommandReceipt } from "#application/command/index.js";
import {
  CodingTaskVerificationCompletionStage,
  CodingTaskVerificationCompletionStatus,
  type CodingTaskVerificationCompletionReport,
} from "#application/codingTaskVerificationCompletion/index.js";
import { HarnessError } from "#common/index.js";

import { CODING_TASK_DELIVERY_COMPLETION_REPORT_SCHEMA_VERSION } from "../constants/index.js";
import type { CodingTaskDeliveryCompletionReport } from "../contracts/index.js";
import {
  CodingTaskDeliveryCompletionStage,
  CodingTaskDeliveryCompletionStatus,
} from "../enums/index.js";

/** 将 Delivery Command 的非继续状态投影为稳定完成报告。 */
export function stopAfterDelivery(
  receipt: CommandReceipt,
): CodingTaskDeliveryCompletionReport | undefined {
  switch (receipt.status) {
    case CommandStatus.Committed:
    case CommandStatus.Duplicate:
      return undefined;
    case CommandStatus.Rejected:
    case CommandStatus.Conflict:
      return {
        schemaVersion: CODING_TASK_DELIVERY_COMPLETION_REPORT_SCHEMA_VERSION,
        status: CodingTaskDeliveryCompletionStatus.Blocked,
        stoppedStage: CodingTaskDeliveryCompletionStage.Delivery,
        deliveryReceipt: receipt,
      };
    case CommandStatus.OutcomeUnknown:
      return {
        schemaVersion: CODING_TASK_DELIVERY_COMPLETION_REPORT_SCHEMA_VERSION,
        status: CodingTaskDeliveryCompletionStatus.OutcomeUnknown,
        stoppedStage: CodingTaskDeliveryCompletionStage.Delivery,
        deliveryReceipt: receipt,
      };
  }
}

/** 将共享 Verification 尾链结果投影为 Delivery Completion 报告。 */
export function projectCompletionReport(
  deliveryReceipt: CommandReceipt,
  planSelection: NonNullable<CodingTaskDeliveryCompletionReport["planSelection"]>,
  completion: CodingTaskVerificationCompletionReport,
): CodingTaskDeliveryCompletionReport {
  const base = {
    schemaVersion: CODING_TASK_DELIVERY_COMPLETION_REPORT_SCHEMA_VERSION,
    deliveryReceipt,
    verificationReceipt: completion.receipt,
    planSelection,
    ...(completion.evidenceBundle === undefined
      ? {}
      : { evidenceBundle: completion.evidenceBundle }),
    ...(completion.prReadyArtifact === undefined
      ? {}
      : { prReadyArtifact: completion.prReadyArtifact }),
  };
  switch (completion.status) {
    case CodingTaskVerificationCompletionStatus.ReviewReady:
      return { ...base, status: CodingTaskDeliveryCompletionStatus.ReviewReady };
    case CodingTaskVerificationCompletionStatus.CommandBlocked:
      return stopped(
        base,
        CodingTaskDeliveryCompletionStatus.Blocked,
        CodingTaskDeliveryCompletionStage.Verification,
      );
    case CodingTaskVerificationCompletionStatus.OutcomeUnknown:
      return stopped(
        base,
        CodingTaskDeliveryCompletionStatus.OutcomeUnknown,
        CodingTaskDeliveryCompletionStage.Verification,
      );
    case CodingTaskVerificationCompletionStatus.VerificationFailed:
      return stopped(
        base,
        CodingTaskDeliveryCompletionStatus.VerificationFailed,
        CodingTaskDeliveryCompletionStage.Evidence,
      );
    case CodingTaskVerificationCompletionStatus.VerificationBlocked:
      return stopped(
        base,
        CodingTaskDeliveryCompletionStatus.VerificationBlocked,
        CodingTaskDeliveryCompletionStage.Evidence,
      );
    case CodingTaskVerificationCompletionStatus.VerificationWaived:
      return stopped(
        base,
        CodingTaskDeliveryCompletionStatus.VerificationWaived,
        CodingTaskDeliveryCompletionStage.Evidence,
      );
  }
}

/** 将内部尾链错误阶段转换为公开 Delivery Completion 阶段。 */
export function withCompletionStage(error: HarnessError): HarnessError {
  const stage =
    error.details["completionStage"] === CodingTaskVerificationCompletionStage.Evidence
      ? CodingTaskDeliveryCompletionStage.Evidence
      : error.details["completionStage"] === CodingTaskVerificationCompletionStage.PrReady
        ? CodingTaskDeliveryCompletionStage.PrReady
        : CodingTaskDeliveryCompletionStage.Verification;
  const details = { ...error.details };
  delete details["completionStage"];
  return new HarnessError(error.code, error.message, { ...details, stage }, error.cause);
}

/** 不含终态与停止阶段的 Completion Report 公共投影。 */
interface CodingTaskDeliveryCompletionReportBase {
  /** Report Schema 版本。 */
  readonly schemaVersion: CodingTaskDeliveryCompletionReport["schemaVersion"];
  /** Delivery Submission 回执。 */
  readonly deliveryReceipt: CodingTaskDeliveryCompletionReport["deliveryReceipt"];
  /** 可选 Verification 回执。 */
  readonly verificationReceipt?: NonNullable<
    CodingTaskDeliveryCompletionReport["verificationReceipt"]
  >;
  /** 可选 Plan 选择结果。 */
  readonly planSelection?: NonNullable<CodingTaskDeliveryCompletionReport["planSelection"]>;
  /** 可选 EvidenceBundle。 */
  readonly evidenceBundle?: NonNullable<CodingTaskDeliveryCompletionReport["evidenceBundle"]>;
  /** 可选 PR-ready Artifact。 */
  readonly prReadyArtifact?: NonNullable<CodingTaskDeliveryCompletionReport["prReadyArtifact"]>;
}

function stopped(
  base: CodingTaskDeliveryCompletionReportBase,
  status: CodingTaskDeliveryCompletionStatus,
  stoppedStage: CodingTaskDeliveryCompletionStage,
): CodingTaskDeliveryCompletionReport {
  return { ...base, status, stoppedStage };
}
