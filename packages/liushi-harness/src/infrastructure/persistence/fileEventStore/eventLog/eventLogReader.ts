import { lstat, readFile } from "node:fs/promises";

import { HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";
import type { TaskRunEventRecord } from "#domain/taskRun/index.js";

import { JSON_LINE_SEPARATOR, MAX_TASK_EVENT_LOG_BYTES } from "../constants/index.js";
import { parseTaskRunEventRecord } from "../schema/index.js";

/** 读取并逐行完成 JSON 与 Schema 校验。 */
export async function readTaskEvents(eventsFile: string): Promise<TaskRunEventRecord[]> {
  const metadata = await lstat(eventsFile);
  if (!metadata.isFile() || metadata.size > MAX_TASK_EVENT_LOG_BYTES) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Task event log is not a regular file or exceeds the supported size limit.",
      { eventsFile, sizeBytes: String(metadata.size) },
    );
  }
  const content = await readFile(eventsFile, "utf8");
  const normalized = content.endsWith(JSON_LINE_SEPARATOR)
    ? content.slice(0, -JSON_LINE_SEPARATOR.length)
    : content;
  const lines = normalized.split(JSON_LINE_SEPARATOR);
  if (normalized.length === 0 || lines.some((line) => line.trim().length === 0)) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Task event log contains blank records.",
      {
        eventsFile,
      },
    );
  }

  return lines.map((line, index) => parseEventLine(line, index + 1, eventsFile));
}

function parseEventLine(line: string, lineNumber: number, eventsFile: string): TaskRunEventRecord {
  let input: unknown;
  try {
    input = JSON.parse(line);
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Task event record is not valid JSON.",
      { eventsFile, lineNumber: String(lineNumber) },
      error,
    );
  }

  const parsed = parseTaskRunEventRecord(input);
  if (parsed.status === ResultStatus.Failure) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      parsed.error.message,
      { ...parsed.error.details, eventsFile, lineNumber: String(lineNumber) },
      parsed.error,
    );
  }
  return parsed.value;
}
