import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  parseTraceSpanObservation,
  type TraceQueryResult,
  type TraceSpanObservation,
} from "#application/index.js";
import { ResultStatus } from "#common/index.js";

/** 将完整 Observation 作为单个 JSONL Record 追加；Trace 不执行 fsync。 */
export async function appendTraceObservation(
  filePath: string,
  observation: TraceSpanObservation,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(observation)}\n`, "utf8");
}

/** 读取全部有效 Trace Record，并显式统计被跳过的损坏记录。 */
export async function readTraceObservations(filePath: string): Promise<TraceQueryResult> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { observations: [], skippedRecordCount: 0 };
    }
    throw error;
  }

  const observations: TraceSpanObservation[] = [];
  let skippedRecordCount = 0;
  for (const line of content.split("\n")) {
    if (line.length === 0) continue;
    try {
      const parsed = parseTraceSpanObservation(JSON.parse(line) as unknown);
      if (parsed.status === ResultStatus.Success) observations.push(parsed.value);
      else skippedRecordCount += 1;
    } catch {
      skippedRecordCount += 1;
    }
  }
  return { observations, skippedRecordCount };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
