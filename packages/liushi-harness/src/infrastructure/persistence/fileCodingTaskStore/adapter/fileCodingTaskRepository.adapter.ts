import { access, mkdir } from "node:fs/promises";
import {
  GENESIS_EVENT_HASH,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import type {
  CodingTaskEventAppendInput,
  CodingTaskLocator,
  CodingTaskRepository,
  CodingTaskRepositoryAppendOutput,
} from "#application/ports/index.js";
import {
  CodingTaskEventType,
  type CodingTaskEvent,
  type CodingTaskEventDraft,
} from "#domain/codingTask/index.js";
import { EventLogHandleStatus } from "#infrastructure/persistence/fileEventStore/eventLog/index.js";
import { calculateCanonicalJsonSha256 } from "#infrastructure/serialization/jsonDigest/index.js";
import { commitCodingTaskEvent, readCodingTaskEvents } from "../eventLog/index.js";
import type { FileCodingTaskRepositoryOptions } from "../contracts/index.js";
import { resolveCodingTaskStorePaths, type CodingTaskStorePaths } from "../path/index.js";
import { replayCodingTaskEvents, validateCodingTaskEventCandidate } from "../replay/index.js";
import { parseCodingTaskEvent } from "../schema/index.js";

/** 使用文件锁和 append-only JSONL 实现 CodingTask Repository。 */
export class FileCodingTaskRepository implements CodingTaskRepository {
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: FileCodingTaskRepositoryOptions,
  ) {}

  /** 在 CodingTask 锁内读取并 Replay 完整 Event Log。 */
  public async load(
    locator: CodingTaskLocator,
  ): Promise<Result<CodingTaskRepositoryAppendOutput["record"], HarnessErrorType>> {
    const paths = resolveCodingTaskStorePaths(
      this.storeRoot,
      locator.workspaceId,
      locator.codingTaskId,
    );
    if (!(await exists(paths.codingTaskDirectory))) return failure(notFound(paths));
    return this.withLock(
      paths,
      async () => {
        if (!(await exists(paths.eventsFile))) return failure(notFound(paths));
        return success(
          replayCodingTaskEvents(await readCodingTaskEvents(paths.eventsFile), {
            workspaceId: paths.workspaceId,
            codingTaskId: paths.codingTaskId,
          }),
        );
      },
      false,
    );
  }

  /** 在锁内完成 locator、版本、首事件、schema、Replay 与提交。 */
  public async append(
    input: CodingTaskEventAppendInput,
  ): Promise<Result<CodingTaskRepositoryAppendOutput, HarnessErrorType>> {
    const paths = resolveCodingTaskStorePaths(
      this.storeRoot,
      input.locator.workspaceId,
      input.locator.codingTaskId,
    );
    try {
      await mkdir(paths.codingTaskDirectory, { recursive: true });
    } catch (error) {
      return failure(ioError(paths, error));
    }
    return this.withLock(paths, () => this.appendLocked(paths, input), true);
  }

  private async appendLocked(
    paths: CodingTaskStorePaths,
    input: CodingTaskEventAppendInput,
  ): Promise<Result<CodingTaskRepositoryAppendOutput, HarnessErrorType>> {
    if (
      input.event.codingTaskId !== paths.codingTaskId ||
      input.event.workspaceId !== paths.workspaceId
    )
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "CodingTask Event 与 Locator 不一致。"),
      );
    const hasEvents = await exists(paths.eventsFile);
    const events = hasEvents ? await readCodingTaskEvents(paths.eventsFile) : [];
    const current = hasEvents
      ? replayCodingTaskEvents(events, {
          workspaceId: paths.workspaceId,
          codingTaskId: paths.codingTaskId,
        })
      : undefined;
    if (current === undefined) {
      if (input.expectedVersion !== 0) return failure(notFound(paths));
      if (input.event.type !== CodingTaskEventType.CodingTaskCreated)
        return failure(
          new HarnessError(
            HarnessErrorCode.InvalidStateTransition,
            "不存在的 CodingTask 只能提交 CodingTaskCreated Event。",
          ),
        );
    } else {
      if (input.expectedVersion === 0) return failure(alreadyExists(paths));
      if (current.aggregate.version !== input.expectedVersion)
        return failure(
          new HarnessError(
            HarnessErrorCode.VersionConflict,
            "CodingTask Aggregate Version 已变化。",
            {
              expectedVersion: String(input.expectedVersion),
              actualVersion: String(current.aggregate.version),
            },
          ),
        );
      if (input.event.type === CodingTaskEventType.CodingTaskCreated)
        return failure(
          new HarnessError(
            HarnessErrorCode.InvalidStateTransition,
            "已存在的 CodingTask 不能再次创建。",
          ),
        );
    }
    const event = materialize(
      input.event,
      (current?.aggregate.version ?? 0) + 1,
      current?.lastEventHash ?? GENESIS_EVENT_HASH,
    );
    let validated: CodingTaskEvent;
    try {
      validated = parseCodingTaskEvent(event);
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "CodingTask Event Draft Schema 无效。",
          {},
          error,
        ),
      );
    }
    const candidate = validateCodingTaskEventCandidate([...events, validated], {
      workspaceId: paths.workspaceId,
      codingTaskId: paths.codingTaskId,
    });
    const committed = await commitCodingTaskEvent(paths.eventsFile, validated, !hasEvents);
    if (committed.handle === EventLogHandleStatus.RecoveryRequired)
      return failure(commitUnknown(paths));
    try {
      await this.dependencies.parentDirectoryDurability.syncParentDirectory(paths.eventsFile);
    } catch (error) {
      return failure(commitUnknown(paths, error));
    }
    return success({ record: candidate });
  }

  private async withLock<T>(
    paths: CodingTaskStorePaths,
    operation: () => Promise<Result<T, HarnessErrorType>>,
    unknownOnRelease: boolean,
  ): Promise<Result<T, HarnessErrorType>> {
    let lock;
    try {
      lock = await this.dependencies.lockManager.acquire(paths.lockFile, {
        workspaceId: paths.workspaceId,
        taskId: paths.codingTaskId,
      });
    } catch (error) {
      return failure(error instanceof HarnessError ? error : ioError(paths, error));
    }
    let result: Result<T, HarnessErrorType>;
    try {
      result = await operation();
    } catch (error) {
      result = failure(error instanceof HarnessError ? error : ioError(paths, error));
    }
    try {
      await lock.release();
    } catch (error) {
      if (!unknownOnRelease) return failure(ioError(paths, error));
      if (hasCommittedOrUnknown(result)) return failure(commitUnknown(paths, error));
      return failure(
        new HarnessError(
          HarnessErrorCode.LockUnavailable,
          "CodingTask Lock 在 Event 提交前释放失败。",
          { lockFile: paths.lockFile },
          error,
        ),
      );
    }
    return result;
  }
}

function hasCommittedOrUnknown<T>(result: Result<T, HarnessErrorType>): boolean {
  return (
    result.status === ResultStatus.Success ||
    result.error.code === HarnessErrorCode.EventLogCommitOutcomeUnknown
  );
}

function materialize(
  draft: CodingTaskEventDraft,
  sequence: number,
  previousHash: string,
): CodingTaskEvent {
  const withoutHash = { ...draft, sequence, previousHash };
  return { ...withoutHash, hash: calculateCanonicalJsonSha256(withoutHash) };
}
function notFound(paths: CodingTaskStorePaths): HarnessError {
  return new HarnessError(HarnessErrorCode.CodingTaskNotFound, "CodingTask 持久化状态不存在。", {
    workspaceId: paths.workspaceId,
    codingTaskId: paths.codingTaskId,
  });
}
function alreadyExists(paths: CodingTaskStorePaths): HarnessError {
  return new HarnessError(HarnessErrorCode.CodingTaskAlreadyExists, "CodingTask 已经存在。", {
    workspaceId: paths.workspaceId,
    codingTaskId: paths.codingTaskId,
  });
}
function commitUnknown(paths: CodingTaskStorePaths, cause?: unknown): HarnessError {
  return new HarnessError(
    HarnessErrorCode.EventLogCommitOutcomeUnknown,
    "CodingTask Event 提交结果未知，禁止自动重试。",
    { eventsFile: paths.eventsFile, recoveryPaths: paths.eventsFile },
    cause,
  );
}
function ioError(paths: CodingTaskStorePaths, cause?: unknown): HarnessError {
  return new HarnessError(
    HarnessErrorCode.IoFailure,
    "CodingTask 持久化操作失败。",
    { codingTaskDirectory: paths.codingTaskDirectory },
    cause,
  );
}
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      return false;
    throw error;
  }
}
