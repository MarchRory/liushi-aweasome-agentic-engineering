import { type FileHandle, open } from "node:fs/promises";

import { HarnessError, HarnessErrorCode } from "#common/index.js";
import type { TaskRunEventRecord } from "#domain/taskRun/index.js";

import { JSON_LINE_SEPARATOR, MAX_TASK_EVENT_LOG_BYTES } from "../constants/index.js";
import { EventLogHandleStatus, type EventLogCommitOutcome } from "./eventLogWriter.contracts.js";

/** 创建新的 Event Log，并在返回前刷新文件内容。 */
export async function writeNewEventLog(
  eventsFile: string,
  event: TaskRunEventRecord,
): Promise<EventLogCommitOutcome> {
  const content = serializeEvent(event);
  const handle = await open(eventsFile, "wx", 0o600);
  return commitEventBytes(handle, async () => writeBufferAt(handle, content, 0));
}

/** 向现有 Event Log 追加一条 Event，并在返回前刷新文件内容。 */
export async function appendEventLog(
  eventsFile: string,
  event: TaskRunEventRecord,
): Promise<EventLogCommitOutcome> {
  const content = serializeEvent(event);
  const handle = await open(eventsFile, "r+");
  const metadata = await handle.stat();
  if (!metadata.isFile() || metadata.size + content.byteLength > MAX_TASK_EVENT_LOG_BYTES) {
    await handle.close();
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Task event log cannot accept another record within the supported size limit.",
      { eventsFile, sizeBytes: String(metadata.size) },
    );
  }
  return commitEventBytes(handle, async () => writeBufferAt(handle, content, metadata.size));
}

function serializeEvent(event: TaskRunEventRecord): Buffer {
  const content = Buffer.from(`${JSON.stringify(event)}${JSON_LINE_SEPARATOR}`, "utf8");
  if (content.byteLength > MAX_TASK_EVENT_LOG_BYTES) {
    throw new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Task event exceeds the supported Event Log size limit.",
      { sizeBytes: String(content.byteLength) },
    );
  }
  return content;
}

async function commitEventBytes(
  handle: FileHandle,
  write: () => Promise<void>,
): Promise<EventLogCommitOutcome> {
  try {
    await write();
    await handle.sync();
  } catch (error) {
    try {
      await handle.close();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "Event Log write and handle close both failed.",
      );
    }
    throw error;
  }

  try {
    await handle.close();
    return { handle: EventLogHandleStatus.Released };
  } catch {
    return { handle: EventLogHandleStatus.RecoveryRequired };
  }
}

async function writeBufferAt(handle: FileHandle, content: Buffer, position: number): Promise<void> {
  let offset = 0;
  while (offset < content.byteLength) {
    const result = await handle.write(
      content,
      offset,
      content.byteLength - offset,
      position + offset,
    );
    if (result.bytesWritten === 0) {
      throw new Error("Event Log write made no progress.");
    }
    offset += result.bytesWritten;
  }
}
