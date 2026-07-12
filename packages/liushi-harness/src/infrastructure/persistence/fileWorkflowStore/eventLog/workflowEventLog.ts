import { open, lstat, readFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { GENESIS_EVENT_HASH, HarnessError, HarnessErrorCode } from "#common/index.js";
import type { WorkflowEvent } from "#domain/workflow/index.js";
import {
  commitEventBytes,
  type EventLogCommitOutcome,
} from "#infrastructure/persistence/fileEventStore/eventLog/index.js";

import { MAX_WORKFLOW_EVENT_LOG_BYTES, WORKFLOW_JSON_LINE_SEPARATOR } from "../constants/index.js";
import { calculateWorkflowEventHash } from "./workflowEventHash.js";
import { parseWorkflowEvent } from "../schema/index.js";

/** 读取并校验 Workflow Event Log。缺失文件错误交给 Repository 归类。 */
export async function readWorkflowEvents(eventsFile: string): Promise<WorkflowEvent[]> {
  const metadata = await lstat(eventsFile);
  if (!metadata.isFile() || metadata.size > MAX_WORKFLOW_EVENT_LOG_BYTES) {
    throw corrupt("Workflow Event Log 不是受支持的普通文件。", eventsFile);
  }
  const content = await readFile(eventsFile, "utf8");
  const normalized = content.endsWith(WORKFLOW_JSON_LINE_SEPARATOR)
    ? content.slice(0, -WORKFLOW_JSON_LINE_SEPARATOR.length)
    : content;
  if (normalized.length === 0) {
    throw corrupt("Workflow Event Log 不能为空。", eventsFile);
  }
  return normalized.split(WORKFLOW_JSON_LINE_SEPARATOR).map((line, index) => {
    if (line.trim().length === 0) {
      throw corrupt("Workflow Event Log 包含空记录。", eventsFile, index + 1);
    }
    try {
      return parseWorkflowEvent(JSON.parse(line));
    } catch (error) {
      throw corrupt("Workflow Event JSON 或 Schema 无效。", eventsFile, index + 1, error);
    }
  });
}

/** 创建或追加一条 Event，并在返回前完成文件同步。 */
export async function commitWorkflowEvent(
  eventsFile: string,
  event: WorkflowEvent,
  create: boolean,
): Promise<EventLogCommitOutcome> {
  const content = Buffer.from(`${JSON.stringify(event)}${WORKFLOW_JSON_LINE_SEPARATOR}`, "utf8");
  if (content.byteLength > MAX_WORKFLOW_EVENT_LOG_BYTES) {
    throw new HarnessError(HarnessErrorCode.InvalidInput, "Workflow Event 超过单个日志大小限制。", {
      eventsFile,
    });
  }
  await mkdir(dirname(eventsFile), { recursive: true });
  const handle = await open(eventsFile, create ? "wx" : "r+");
  let position: number;
  try {
    position = create ? 0 : (await handle.stat()).size;
  } catch (error) {
    await handle.close();
    throw error;
  }
  if (position + content.byteLength > MAX_WORKFLOW_EVENT_LOG_BYTES) {
    await handle.close();
    throw new HarnessError(HarnessErrorCode.CorruptStore, "Workflow Event Log 已达到大小限制。", {
      eventsFile,
    });
  }
  return commitEventBytes(handle, () => writeBufferAt(handle, content, position));
}

/** 校验 Workflow Event 的序号、前置 Hash 和当前 Hash。 */
export function validateWorkflowHashChain(events: readonly WorkflowEvent[]): void {
  let previousHash = GENESIS_EVENT_HASH;
  for (const [index, event] of events.entries()) {
    const hashInput = { ...event } as Omit<WorkflowEvent, "hash"> & { hash?: string };
    delete hashInput.hash;
    if (
      event.sequence !== index + 1 ||
      event.previousHash !== previousHash ||
      event.hash !== calculateWorkflowEventHash(hashInput)
    ) {
      throw corrupt("Workflow Event Hash Chain 校验失败。", "events.jsonl", index + 1);
    }
    previousHash = event.hash;
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
      throw new Error("Workflow Event 写入没有前进。");
    }
    offset += result.bytesWritten;
  }
}

function corrupt(
  message: string,
  eventsFile: string,
  line?: number,
  cause?: unknown,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.CorruptStore,
    message,
    { eventsFile, ...(line === undefined ? {} : { line: String(line) }) },
    cause,
  );
}
