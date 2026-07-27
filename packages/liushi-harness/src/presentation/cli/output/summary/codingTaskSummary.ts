import type { CliWriter } from "../../contracts/index.js";

/** 输出 CodingTask Cell 的稳定 Human 摘要。 */
export function writeCodingTaskCellSummary(writer: CliWriter, data: unknown): void {
  if (!isRecord(data)) return;
  const stoppedStage = data["stoppedStage"];
  writer.stdout(
    `CodingTask cell: status=${scalarString(data["status"])} stoppedStage=${stoppedStage === undefined ? "none" : scalarString(stoppedStage)} receipts=${countEntries(data["receipts"])}.\n`,
  );
}

/** 输出 CodingTask Session Activation 的稳定 Human 摘要。 */
export function writeCodingTaskSessionActivationSummary(writer: CliWriter, data: unknown): void {
  if (!isRecord(data)) return;
  const stoppedStage = data["stoppedStage"];
  const worktreeRoot = data["worktreeRoot"];
  writer.stdout(
    `CodingTask session activation: status=${scalarString(data["status"])} stoppedStage=${stoppedStage === undefined ? "none" : scalarString(stoppedStage)} receipts=${countEntries(data["receipts"])} worktreeRoot=${worktreeRoot === undefined ? "none" : scalarString(worktreeRoot)}.\n`,
  );
}

/** 输出 CodingTask Session Closeout 的稳定 Human 摘要。 */
export function writeCodingTaskSessionCloseoutSummary(writer: CliWriter, data: unknown): void {
  if (!isRecord(data)) return;
  const stoppedStage = data["stoppedStage"];
  const errorCode = data["errorCode"];
  writer.stdout(
    `CodingTask session closeout: status=${scalarString(data["status"])} stoppedStage=${stoppedStage === null || stoppedStage === undefined ? "none" : scalarString(stoppedStage)} version=${scalarString(data["version"])} snapshot=${String(isPresent(data["snapshot"]))} coverage=${String(isPresent(data["coverageManifest"]))} checkpoint=${String(isPresent(data["checkpoint"]))} errorCode=${errorCode === null || errorCode === undefined ? "none" : scalarString(errorCode)}.\n`,
  );
}

/** 输出不携带证据标识与本机路径的 Closeout Recovery Assessment 摘要。 */
export function writeCodingTaskSessionCloseoutRecoveryAssessmentSummary(
  writer: CliWriter,
  data: unknown,
): void {
  if (!isRecord(data)) return;
  writer.stdout(
    `CodingTask session closeout recovery assessment: assessmentDigest=${scalarString(data["assessmentDigest"])} disposition=${scalarString(data["disposition"])} allowedResolution=${optionalScalar(data["allowedResolution"])} diagnostic=${scalarString(data["diagnostic"])}.\n`,
  );
}

/** 输出不携带请求摘要与原始错误信息的 Closeout Recovery 回执摘要。 */
export function writeCodingTaskSessionCloseoutRecoverySummary(
  writer: CliWriter,
  data: unknown,
): void {
  if (!isRecord(data)) return;
  writer.stdout(
    `CodingTask session closeout recovery: commandId=${scalarString(data["commandId"])} status=${scalarString(data["status"])} committedVersion=${optionalScalar(data["committedVersion"])} errorCode=${optionalScalar(data["errorCode"])}.\n`,
  );
}

/** 输出只包含解析状态与 Checkpoint Binding Digest 的 Effective Closeout 摘要。 */
export function writeCodingTaskSessionEffectiveCloseoutSummary(
  writer: CliWriter,
  data: unknown,
): void {
  if (!isRecord(data)) return;
  const checkpoint = data["checkpoint"];
  const bindingDigest = isRecord(checkpoint) ? checkpoint["bindingDigest"] : undefined;
  writer.stdout(
    `CodingTask session effective closeout: status=${scalarString(data["status"])} source=${optionalScalar(data["source"])} reason=${optionalScalar(data["reason"])} checkpoint.bindingDigest=${optionalScalar(bindingDigest)}.\n`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countEntries(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function optionalScalar(value: unknown): string {
  return isPresent(value) ? scalarString(value) : "none";
}

function scalarString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "unknown";
}
