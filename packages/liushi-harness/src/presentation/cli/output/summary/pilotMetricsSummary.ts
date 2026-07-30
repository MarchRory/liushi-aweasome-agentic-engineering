import type { CliWriter } from "../../contracts/index.js";

/** 输出 Enrollment 或 Settlement create-only 写入摘要。 */
export function writePilotMetricsMutationSummary(writer: CliWriter, data: unknown): void {
  if (!isRecord(data)) return;
  const record = data["record"];
  writer.stdout(
    `Pilot metrics mutation: disposition=${scalar(data["disposition"])} recordDigest=${isRecord(record) ? scalar(record["recordDigest"]) : "unknown"}.\n`,
  );
}

/** 输出不计算跨任务效果指标的单 Session 报告摘要。 */
export function writePilotMetricsReportSummary(writer: CliWriter, data: unknown): void {
  if (!isRecord(data)) return;
  const enrollment = data["enrollment"];
  const settlement = data["settlement"];
  const evidence = data["evidence"];
  writer.stdout(
    `Pilot metrics report: status=${scalar(data["status"])} claimEligibility=${scalar(data["claimEligibility"])} missingFacts=${count(data["missingFacts"])} plannedSteps=${isRecord(enrollment) ? count(enrollment["plannedSteps"]) : 0} humanTouchEntries=${isRecord(settlement) ? count(settlement["humanTouchEntries"]) : 0} machineDurationMs=${isRecord(evidence) ? scalar(evidence["machineDurationMs"]) : "not_measured"}.\n`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "unknown";
}
