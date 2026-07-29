import type { CliWriter } from "../../contracts/index.js";

/** 输出不包含路径、原始证据或命令输出的 Completion Human 摘要。 */
export function writeCodingTaskSessionCompleteSummary(writer: CliWriter, data: unknown): void {
  if (!isRecord(data)) return;
  writer.stdout(
    `CodingTask session complete: status=${scalarString(data["status"])} stoppedStage=${optionalScalar(data["stoppedStage"])} deliveryReceipt=${String(isPresent(data["deliveryReceipt"]))} verificationReceipt=${String(isPresent(data["verificationReceipt"]))} evidenceBundle=${String(isPresent(data["evidenceBundle"]))} prReadyArtifact=${String(isPresent(data["prReadyArtifact"]))}.\n`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
