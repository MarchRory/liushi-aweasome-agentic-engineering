import type { CliWriter } from "../../contracts/index.js";

/** 输出不包含完整 Evidence 的 Publication 写入回执摘要。 */
export function writeExecutorCompatibilityPublicationSummary(
  writer: CliWriter,
  data: unknown,
): void {
  if (!isRecord(data)) return;
  writer.stdout(
    `Executor compatibility bundle ${scalar(data["bundleDigest"])}: matrix=${scalar(data["matrixDigest"])} package=${scalar(data["packageName"])}@${scalar(data["packageVersion"])} tarball=${scalar(data["packageDigest"])} disposition=${scalar(data["disposition"])} bytes=${scalar(data["byteLength"])} output=${scalar(data["outputFilePath"])}.\n`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "unknown";
}
