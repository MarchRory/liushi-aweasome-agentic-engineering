import {
  PilotMetricsClaimEligibility,
  PilotMetricsReportStatus,
  PilotMetricsCreateDisposition,
  type PilotMetricsEnrollmentResult,
  type PilotMetricsSettlementResult,
} from "#application/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";

import { CLI_EXIT_CODE_CONFLICT, CLI_EXIT_CODE_SUCCESS } from "../../../constants/index.js";
import type {
  CliApplication,
  CodingTaskSessionMetricsEnrollCliCommand,
  CodingTaskSessionMetricsReportCliCommand,
  CodingTaskSessionMetricsSettleCliCommand,
  RunCliDependencies,
} from "../../../contracts/index.js";
import {
  mapErrorExitCode,
  writeBlocked,
  writeFailure,
  writeSuccess,
} from "../../../output/index.js";

/** 读取并预登记不可变 Pilot Metrics Enrollment。 */
export async function executeCodingTaskSessionMetricsEnroll(
  command: CodingTaskSessionMetricsEnrollCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const document = await readBoundDocument(command, dependencies);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const result = await application.pilotMetrics.enroll(document.value);
  return writeMutationResult(command, result, dependencies);
}

/** 读取并结算 Human 原始事实与权威 Session 证据。 */
export async function executeCodingTaskSessionMetricsSettle(
  command: CodingTaskSessionMetricsSettleCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const document = await readBoundDocument(command, dependencies);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const result = await application.pilotMetrics.settle(document.value);
  return writeMutationResult(command, result, dependencies);
}

/** 查询单 Session 描述性原始事实，不执行跨任务指标计算。 */
export async function executeCodingTaskSessionMetricsReport(
  command: CodingTaskSessionMetricsReportCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.pilotMetrics.report({
    workspaceId: command.workspaceId,
    sessionId: command.sessionId,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (
    result.value.status === PilotMetricsReportStatus.NotMeasured ||
    result.value.claimEligibility === PilotMetricsClaimEligibility.Blocked
  ) {
    writeBlocked(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_CONFLICT;
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

async function readBoundDocument(
  command: CodingTaskSessionMetricsEnrollCliCommand | CodingTaskSessionMetricsSettleCliCommand,
  dependencies: RunCliDependencies,
) {
  const document = await dependencies.jsonDocumentReader.read(command.filePath);
  if (document.status === ResultStatus.Failure) return document;
  const bindingError = validateBinding(command, document.value);
  return bindingError === null
    ? document
    : {
        status: ResultStatus.Failure as const,
        error: bindingError,
      };
}

function validateBinding(
  command: CodingTaskSessionMetricsEnrollCliCommand | CodingTaskSessionMetricsSettleCliCommand,
  document: unknown,
): HarnessError | null {
  if (!isRecord(document)) return null;
  if (
    typeof document["workspaceId"] === "string" &&
    document["workspaceId"] !== command.workspaceId
  ) {
    return mismatch("Workspace");
  }
  if (typeof document["sessionId"] === "string" && document["sessionId"] !== command.sessionId) {
    return mismatch("Session");
  }
  const actor = document["actor"];
  if (
    isRecord(actor) &&
    typeof actor["actorId"] === "string" &&
    actor["actorId"] !== command.actorId
  ) {
    return mismatch("Actor");
  }
  return null;
}

function writeMutationResult(
  command: CodingTaskSessionMetricsEnrollCliCommand | CodingTaskSessionMetricsSettleCliCommand,
  result: PilotMetricsEnrollmentResult | PilotMetricsSettlementResult,
  dependencies: RunCliDependencies,
): number {
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (result.value.disposition === PilotMetricsCreateDisposition.Conflict) {
    writeBlocked(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_CONFLICT;
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

function mismatch(field: string): HarnessError {
  return new HarnessError(
    HarnessErrorCode.PreconditionNotMet,
    `Pilot Metrics CLI ${field} 与 JSON Document 不一致。`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
