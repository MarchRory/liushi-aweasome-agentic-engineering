import type { CliWriter } from "../../contracts/index.js";
import { CliCommand } from "../../contracts/index.js";

/** 仅输出不含原始 Host JSON 的 Executor Compatibility Matrix 摘要。 */
export function writeExecutorCompatibilitySummary(
  writer: CliWriter,
  command: CliCommand,
  data: unknown,
): void {
  if (!isRecord(data) || !isRecord(data["matrix"])) return;

  const matrix = data["matrix"];
  const scope = isRecord(matrix["scope"]) ? matrix["scope"] : {};
  const marker =
    command === CliCommand.ExecutorCompatibilityCompile
      ? compilePersistenceSummary(data)
      : `recomputed=${String(data["recomputed"] === true)}`;
  writer.stdout(
    `Executor compatibility ${scalar(matrix["matrixDigest"])}: profile=${scalar(matrix["profileId"])} support=${scalar(matrix["supportLevel"])} executor=${scalar(scope["distribution"])}@${scalar(scope["executorVersion"])} host=${scalar(scope["surface"])}/${scalar(scope["operatingSystem"])}/${scalar(scope["architecture"])} evidence=${countEntries(matrix["evidenceDigests"])} ${marker}.\n`,
  );
}

function compilePersistenceSummary(data: Record<string, unknown>): string {
  const evidence = Array.isArray(data["evidencePersistences"])
    ? data["evidencePersistences"].map((item) =>
        isRecord(item) ? scalar(item["disposition"]) : "unknown",
      )
    : [];
  const hostEvidence = evidence[0] ?? "unknown";
  const contractEvidence = evidence[1] ?? "unknown";
  const matrix = isRecord(data["matrixPersistence"])
    ? scalar(data["matrixPersistence"]["disposition"])
    : "unknown";
  return `evidencePersistences=host:${hostEvidence},contract:${contractEvidence} matrixPersistence=${matrix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function countEntries(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "unknown";
}
