import { CliCommand, type CliWriter } from "../../contracts/index.js";
import {
  writeCodingTaskSessionActivationSummary,
  writeCodingTaskSessionCloseoutRecoveryAssessmentSummary,
  writeCodingTaskSessionCloseoutRecoverySummary,
  writeCodingTaskSessionCloseoutSummary,
  writeCodingTaskSessionEffectiveCloseoutSummary,
} from "./codingTaskSummary.js";
import { writeCodingTaskSessionCompleteSummary } from "./codingTaskSessionCompleteSummary.js";
import {
  writePilotMetricsMutationSummary,
  writePilotMetricsReportSummary,
} from "./pilotMetricsSummary.js";

/** 将 CodingTask Session 命令路由到对应 Human 摘要。 */
export function writeCodingTaskSessionSummary(
  writer: CliWriter,
  command: CliCommand,
  data: unknown,
): boolean {
  if (command === CliCommand.CodingTaskSessionActivate) {
    writeCodingTaskSessionActivationSummary(writer, data);
    return true;
  }
  if (command === CliCommand.CodingTaskSessionCloseout) {
    writeCodingTaskSessionCloseoutSummary(writer, data);
    return true;
  }
  if (command === CliCommand.CodingTaskSessionComplete) {
    writeCodingTaskSessionCompleteSummary(writer, data);
    return true;
  }
  if (command === CliCommand.CodingTaskSessionCloseoutRecoveryAssess) {
    writeCodingTaskSessionCloseoutRecoveryAssessmentSummary(writer, data);
    return true;
  }
  if (command === CliCommand.CodingTaskSessionCloseoutRecover) {
    writeCodingTaskSessionCloseoutRecoverySummary(writer, data);
    return true;
  }
  if (command === CliCommand.CodingTaskSessionEffectiveCloseout) {
    writeCodingTaskSessionEffectiveCloseoutSummary(writer, data);
    return true;
  }
  if (
    command === CliCommand.CodingTaskSessionMetricsEnroll ||
    command === CliCommand.CodingTaskSessionMetricsSettle
  ) {
    writePilotMetricsMutationSummary(writer, data);
    return true;
  }
  if (command === CliCommand.CodingTaskSessionMetricsReport) {
    writePilotMetricsReportSummary(writer, data);
    return true;
  }
  return false;
}
