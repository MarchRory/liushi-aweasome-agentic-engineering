import { lstat, mkdir, open, readFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname } from "node:path";

import type { CodingTaskEvent } from "#domain/codingTask/index.js";
import { GENESIS_EVENT_HASH, HarnessError, HarnessErrorCode } from "#common/index.js";
import {
  commitEventBytes,
  type EventLogCommitOutcome,
} from "#infrastructure/persistence/fileEventStore/eventLog/index.js";
import { calculateCanonicalJsonSha256 } from "#infrastructure/serialization/jsonDigest/index.js";

import {
  CODING_TASK_JSON_LINE_SEPARATOR,
  MAX_CODING_TASK_EVENT_LOG_BYTES,
} from "../constants/index.js";
import { parseCodingTaskEvent } from "../schema/index.js";

/** 读取并严格解析 CodingTask JSONL Event Log。 */
export async function readCodingTaskEvents(file: string): Promise<CodingTaskEvent[]> {
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.size > MAX_CODING_TASK_EVENT_LOG_BYTES) throw corrupt(file);
  const content = await readFile(file, "utf8");
  if (!content.endsWith(CODING_TASK_JSON_LINE_SEPARATOR)) throw corrupt(file);
  const normalized = content.slice(0, -CODING_TASK_JSON_LINE_SEPARATOR.length);
  if (!normalized) throw corrupt(file);
  return normalized.split(CODING_TASK_JSON_LINE_SEPARATOR).map((line, index) => {
    try {
      return parseCodingTaskEvent(JSON.parse(line));
    } catch (error) {
      throw new HarnessError(
        HarnessErrorCode.CorruptStore,
        "CodingTask Event Schema 无效。",
        { file, line: String(index + 1) },
        error,
      );
    }
  });
}

/** 写入并 fsync 一条 CodingTask Event。 */
export async function commitCodingTaskEvent(
  file: string,
  event: CodingTaskEvent,
  create: boolean,
): Promise<EventLogCommitOutcome> {
  const bytes = Buffer.from(`${JSON.stringify(event)}${CODING_TASK_JSON_LINE_SEPARATOR}`, "utf8");
  if (bytes.byteLength > MAX_CODING_TASK_EVENT_LOG_BYTES) {
    throw new HarnessError(HarnessErrorCode.InvalidInput, "CodingTask Event 超过大小限制。", {
      file,
    });
  }
  await mkdir(dirname(file), { recursive: true });
  const handle = await open(file, create ? "wx" : "r+");
  let position = 0;
  if (!create) {
    try {
      position = (await handle.stat()).size;
    } catch (error) {
      await closeQuietly(handle);
      throw error;
    }
  }
  if (position + bytes.byteLength > MAX_CODING_TASK_EVENT_LOG_BYTES) {
    await handle.close();
    throw new HarnessError(HarnessErrorCode.CorruptStore, "CodingTask Event Log 已达到大小限制。", {
      file,
    });
  }
  return commitEventBytes(handle, () => writeAt(handle, bytes, position));
}

async function closeQuietly(handle: FileHandle): Promise<void> {
  try {
    await handle.close();
  } catch {
    // 关闭失败时保留原始错误，避免覆盖异常上下文。
  }
}

/** 校验 CodingTask Event 的序列、前置 Hash 和 RFC8785 digest。 */
export function validateCodingTaskHashChain(events: readonly CodingTaskEvent[]): void {
  let previous = GENESIS_EVENT_HASH;
  for (const [index, event] of events.entries()) {
    const withoutHash = { ...event } as Record<string, unknown>;
    delete withoutHash["hash"];
    if (
      event.sequence !== index + 1 ||
      event.previousHash !== previous ||
      event.hash !== calculateCanonicalJsonSha256(withoutHash)
    ) {
      throw corrupt("events.jsonl", index + 1);
    }
    previous = event.hash;
  }
}

async function writeAt(handle: FileHandle, content: Buffer, position: number): Promise<void> {
  let offset = 0;
  while (offset < content.byteLength) {
    const result = await handle.write(
      content,
      offset,
      content.byteLength - offset,
      position + offset,
    );
    if (!result.bytesWritten) throw new Error("CodingTask Event 写入没有前进。");
    offset += result.bytesWritten;
  }
}

function corrupt(file: string, line?: number): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, "CodingTask Event Log 损坏。", {
    file,
    ...(line === undefined ? {} : { line: String(line) }),
  });
}
