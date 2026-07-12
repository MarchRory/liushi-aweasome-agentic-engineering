import { open, readFile, type FileHandle } from "node:fs/promises";
import { z } from "zod";

import { HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";
import { parseActionJournalRecord, type ActionJournalRecord } from "#domain/actionJournal/index.js";

import { calculateCanonicalJsonSha256 } from "#infrastructure/serialization/index.js";
import { JSON_LINE_SEPARATOR } from "../../constants/index.js";
import { pathExists } from "../../taskStore/index.js";
import {
  ACTION_JOURNAL_FILE_HASH_PATTERN,
  ACTION_JOURNAL_FILE_SCHEMA_VERSION,
  ACTION_JOURNAL_GENESIS_HASH,
} from "../constants/index.js";
import {
  ActionJournalCommitFailureStage,
  ActionJournalHandleStatus,
  type ActionJournalCommitHandle,
  type ActionJournalCommitOutcome,
  type ActionJournalFileRecord,
} from "../contracts/index.js";

const fileRecordSchema = z
  .object({
    schemaVersion: z.literal(ACTION_JOURNAL_FILE_SCHEMA_VERSION),
    journalSequence: z.number().int().positive(),
    record: z.unknown(),
    previousHash: z.string().regex(ACTION_JOURNAL_FILE_HASH_PATTERN),
    hash: z.string().regex(ACTION_JOURNAL_FILE_HASH_PATTERN),
  })
  .strict();

/** 读取并验证完整 Action Journal Hash Chain；文件不存在时返回空历史。 */
export async function readActionJournalRecords(
  actionsFile: string,
): Promise<readonly ActionJournalFileRecord[]> {
  if (!(await pathExists(actionsFile))) {
    return [];
  }
  const contents = await readFile(actionsFile, "utf8");
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) !== "") {
    throw corruptJournal(actionsFile, "Action Journal 缺少完整行终止符。");
  }

  const records: ActionJournalFileRecord[] = [];
  for (const [index, line] of lines.slice(0, -1).entries()) {
    const lineNumber = index + 1;
    if (line.length === 0) {
      throw corruptJournal(actionsFile, "Action Journal 包含空记录。", lineNumber);
    }
    const input = parseJsonLine(actionsFile, line, lineNumber);
    const envelope = fileRecordSchema.safeParse(input);
    if (!envelope.success) {
      throw corruptJournal(
        actionsFile,
        "Action Journal File Record 无法通过严格 Schema。",
        lineNumber,
        envelope.error,
      );
    }
    const parsedRecord = parseActionJournalRecord(envelope.data.record);
    if (parsedRecord.status === ResultStatus.Failure) {
      throw corruptJournal(
        actionsFile,
        "Action Journal 领域 Record 无法通过严格 Schema。",
        lineNumber,
        parsedRecord.error,
      );
    }
    const record: ActionJournalFileRecord = {
      schemaVersion: envelope.data.schemaVersion,
      journalSequence: envelope.data.journalSequence,
      record: parsedRecord.value,
      previousHash: envelope.data.previousHash,
      hash: envelope.data.hash,
    };
    validateFileRecord(record, records.at(-1), actionsFile, lineNumber);
    records.push(record);
  }
  return records;
}

/** 根据当前 Journal Tail 创建下一条带 Hash 的 File Record。 */
export function createActionJournalFileRecord(
  record: ActionJournalRecord,
  previous?: ActionJournalFileRecord,
): ActionJournalFileRecord {
  const input = {
    schemaVersion: ACTION_JOURNAL_FILE_SCHEMA_VERSION,
    journalSequence: (previous?.journalSequence ?? 0) + 1,
    record,
    previousHash: previous?.hash ?? ACTION_JOURNAL_GENESIS_HASH,
  } as const;
  return { ...input, hash: calculateCanonicalJsonSha256(input) };
}

/** 追加并 fsync 一条 Action Journal File Record。 */
export async function appendActionJournalRecord(
  actionsFile: string,
  record: ActionJournalFileRecord,
): Promise<ActionJournalCommitOutcome> {
  const content = Buffer.from(`${JSON.stringify(record)}${JSON_LINE_SEPARATOR}`, "utf8");
  const handle = await open(actionsFile, "a", 0o600);
  return commitActionJournalBytes(handle, async () => writeBuffer(handle, content));
}

/** 隔离 Action Journal write、fsync 与 close 的可注入提交边界。 */
export async function commitActionJournalBytes(
  handle: ActionJournalCommitHandle,
  write: () => Promise<void>,
): Promise<ActionJournalCommitOutcome> {
  let stage = ActionJournalCommitFailureStage.Write;
  try {
    await write();
    stage = ActionJournalCommitFailureStage.Sync;
    await handle.sync();
  } catch (error) {
    let closeError: unknown;
    try {
      await handle.close();
    } catch (caughtCloseError) {
      closeError = caughtCloseError;
    }
    throw unknownCommit(stage, error, closeError);
  }

  try {
    await handle.close();
    return { handle: ActionJournalHandleStatus.Released };
  } catch {
    return { handle: ActionJournalHandleStatus.RecoveryRequired };
  }
}

function validateFileRecord(
  current: ActionJournalFileRecord,
  previous: ActionJournalFileRecord | undefined,
  actionsFile: string,
  line: number,
): void {
  const expectedSequence = (previous?.journalSequence ?? 0) + 1;
  const expectedPreviousHash = previous?.hash ?? ACTION_JOURNAL_GENESIS_HASH;
  const { hash, ...hashInput } = current;
  if (
    current.journalSequence !== expectedSequence ||
    current.previousHash !== expectedPreviousHash ||
    hash !== calculateCanonicalJsonSha256(hashInput)
  ) {
    throw corruptJournal(actionsFile, "Action Journal Sequence 或 Hash Chain 无效。", line);
  }
}

function parseJsonLine(actionsFile: string, line: string, lineNumber: number): unknown {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw corruptJournal(actionsFile, "Action Journal 包含非法 JSON。", lineNumber, error);
  }
}

async function writeBuffer(handle: FileHandle, content: Buffer): Promise<void> {
  let offset = 0;
  while (offset < content.byteLength) {
    const result = await handle.write(content, offset, content.byteLength - offset, null);
    if (result.bytesWritten === 0) {
      throw new Error("Action Journal 写入没有取得进展。");
    }
    offset += result.bytesWritten;
  }
}

function unknownCommit(
  stage: ActionJournalCommitFailureStage,
  error: unknown,
  closeError: unknown,
): HarnessError {
  const cause =
    closeError === undefined
      ? error
      : new AggregateError([error, closeError], "Action Journal 提交与关闭均失败。");
  return new HarnessError(
    HarnessErrorCode.ActionJournalCommitOutcomeUnknown,
    "Action Journal 写入已经开始但持久化结果未知，禁止自动重试。",
    { stage },
    cause,
  );
}

function corruptJournal(
  actionsFile: string,
  message: string,
  line?: number,
  cause?: unknown,
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.CorruptStore,
    message,
    {
      actionsFile,
      ...(line === undefined ? {} : { line: String(line) }),
    },
    cause,
  );
}
