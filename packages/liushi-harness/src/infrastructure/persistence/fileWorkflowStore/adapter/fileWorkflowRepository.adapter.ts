import { access, mkdir } from "node:fs/promises";

import {
  GENESIS_EVENT_HASH,
  HarnessError,
  HarnessErrorCode,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import type {
  WorkflowEventAppendInput,
  WorkflowLocator,
  WorkflowRepository,
  WorkflowRepositoryAppendOutput,
} from "#application/ports/index.js";
import {
  WorkflowEventType,
  type WorkflowEvent,
  type WorkflowEventDraft,
} from "#domain/workflow/index.js";

import { EventLogHandleStatus } from "#infrastructure/persistence/fileEventStore/eventLog/index.js";
import {
  calculateWorkflowEventHash,
  commitWorkflowEvent,
  readWorkflowEvents,
} from "../eventLog/index.js";
import type { FileWorkflowRepositoryOptions } from "../contracts/index.js";
import { resolveWorkflowStorePaths, type WorkflowStorePaths } from "../path/index.js";
import { replayWorkflowEvents } from "../replay/index.js";
import { parseWorkflowEvent } from "../schema/index.js";

/** 使用 append-only JSONL 和 Workflow Lock 实现的 Workflow Repository。 */
export class FileWorkflowRepository implements WorkflowRepository {
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: FileWorkflowRepositoryOptions,
  ) {}

  /** 在 Workflow Lock 内读取并 Replay 完整 Event Stream。 */
  public async load(
    locator: WorkflowLocator,
  ): Promise<Result<WorkflowRepositoryAppendOutput["record"], HarnessErrorType>> {
    const paths = resolveWorkflowStorePaths(
      this.storeRoot,
      locator.workspaceId,
      locator.workflowId,
    );
    if (!(await pathExists(paths.workflowDirectory))) {
      return failure(workflowNotFound(paths));
    }
    return this.withLock(paths, () => this.readRecord(paths), false);
  }

  /** 在 Workflow Lock 内完成版本检查、Replay 校验和 Event Commit。 */
  public async append(
    input: WorkflowEventAppendInput,
  ): Promise<Result<WorkflowRepositoryAppendOutput, HarnessErrorType>> {
    const paths = resolveWorkflowStorePaths(
      this.storeRoot,
      input.locator.workspaceId,
      input.locator.workflowId,
    );
    try {
      await mkdir(paths.workflowDirectory, { recursive: true });
    } catch (error) {
      return failure(toPersistenceError(error, paths));
    }
    return this.withLock(paths, () => this.appendLocked(paths, input), true);
  }

  private async appendLocked(
    paths: WorkflowStorePaths,
    input: WorkflowEventAppendInput,
  ): Promise<Result<WorkflowRepositoryAppendOutput, HarnessErrorType>> {
    assertEventLocator(input.event, input.locator);
    const hasEvents = await pathExists(paths.eventsFile);
    const events = hasEvents ? await readWorkflowEvents(paths.eventsFile) : [];
    const current = hasEvents ? replayWorkflowEvents(events) : undefined;

    if (current === undefined) {
      if (input.expectedVersion !== 0) return failure(workflowNotFound(paths));
      if (input.event.type !== WorkflowEventType.WorkflowCreated) {
        return failure(
          new HarnessError(
            HarnessErrorCode.InvalidStateTransition,
            "不存在的 Workflow 只能提交 WorkflowCreated Event。",
            { workflowId: paths.workflowId },
          ),
        );
      }
    } else {
      if (input.expectedVersion === 0) return failure(workflowAlreadyExists(paths));
      if (current.aggregate.version !== input.expectedVersion) {
        return failure(
          new HarnessError(
            HarnessErrorCode.VersionConflict,
            "Workflow Aggregate Version 已变化。",
            {
              expectedVersion: String(input.expectedVersion),
              actualVersion: String(current.aggregate.version),
            },
          ),
        );
      }
      if (input.event.type === WorkflowEventType.WorkflowCreated) {
        return failure(
          new HarnessError(
            HarnessErrorCode.InvalidStateTransition,
            "已存在的 Workflow 不能再次提交 WorkflowCreated Event。",
            { workflowId: paths.workflowId },
          ),
        );
      }
    }

    const event = materializeEvent(
      input.event,
      (current?.aggregate.version ?? 0) + 1,
      current?.lastEventHash ?? GENESIS_EVENT_HASH,
    );
    const validatedEvent = validateDraftEvent(event);
    const candidate = replayWorkflowEvents([...events, validatedEvent]);
    const committed = await commitWorkflowEvent(paths.eventsFile, validatedEvent, !hasEvents);
    if (committed.handle === EventLogHandleStatus.RecoveryRequired) {
      return failure(commitOutcomeUnknown(paths));
    }
    try {
      await this.dependencies.parentDirectoryDurability.syncParentDirectory(paths.eventsFile);
    } catch (error) {
      return failure(commitOutcomeUnknown(paths, error));
    }
    return success({ record: candidate });
  }

  private async readRecord(
    paths: WorkflowStorePaths,
  ): Promise<Result<WorkflowRepositoryAppendOutput["record"], HarnessErrorType>> {
    if (!(await pathExists(paths.eventsFile))) {
      return failure(
        new HarnessError(HarnessErrorCode.WorkflowNotFound, "Workflow Event Log 不存在。", {
          eventsFile: paths.eventsFile,
        }),
      );
    }
    try {
      return success(replayWorkflowEvents(await readWorkflowEvents(paths.eventsFile)));
    } catch (error) {
      return failure(toPersistenceError(error, paths));
    }
  }

  private async withLock<T>(
    paths: WorkflowStorePaths,
    operation: () => Promise<Result<T, HarnessErrorType>>,
    unknownOnRelease: boolean,
  ): Promise<Result<T, HarnessErrorType>> {
    let lock;
    try {
      lock = await this.dependencies.lockManager.acquire(paths.lockFile, {
        workspaceId: paths.workspaceId,
        taskId: paths.workflowId,
      });
    } catch (error) {
      return failure(toPersistenceError(error, paths));
    }

    let result: Result<T, HarnessErrorType>;
    try {
      result = await operation();
    } catch (error) {
      result = failure(toPersistenceError(error, paths));
    }
    try {
      await lock.release();
    } catch (error) {
      return failure(
        unknownOnRelease ? commitOutcomeUnknown(paths, error) : toPersistenceError(error, paths),
      );
    }
    return result;
  }
}

function materializeEvent(
  draft: WorkflowEventDraft,
  sequence: number,
  previousHash: string,
): WorkflowEvent {
  const eventWithoutHash = { ...draft, sequence, previousHash } as Omit<WorkflowEvent, "hash">;
  return {
    ...eventWithoutHash,
    hash: calculateWorkflowEventHash(eventWithoutHash),
  } as WorkflowEvent;
}

function validateDraftEvent(event: WorkflowEvent): WorkflowEvent {
  try {
    return parseWorkflowEvent(event);
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Workflow Event Draft Schema 无效。",
      {},
      error,
    );
  }
}

function assertEventLocator(event: WorkflowEventDraft, locator: WorkflowLocator): void {
  if (event.workflowId !== locator.workflowId || event.workspaceId !== locator.workspaceId) {
    throw new HarnessError(HarnessErrorCode.InvalidInput, "Workflow Event 与 Locator 不一致。", {
      workflowId: locator.workflowId,
    });
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function workflowNotFound(paths: WorkflowStorePaths): HarnessError {
  return new HarnessError(HarnessErrorCode.WorkflowNotFound, "Workflow 持久化状态不存在。", {
    workflowId: paths.workflowId,
    workspaceId: paths.workspaceId,
  });
}

function workflowAlreadyExists(paths: WorkflowStorePaths): HarnessError {
  return new HarnessError(HarnessErrorCode.WorkflowAlreadyExists, "Workflow 已经存在。", {
    workflowId: paths.workflowId,
    workspaceId: paths.workspaceId,
  });
}

function commitOutcomeUnknown(paths: WorkflowStorePaths, cause?: unknown): HarnessError {
  return new HarnessError(
    HarnessErrorCode.EventLogCommitOutcomeUnknown,
    "Workflow Event 已开始持久化，但最终结果未知，禁止自动重试。",
    { eventsFile: paths.eventsFile, recoveryPaths: paths.eventsFile },
    cause,
  );
}

function toPersistenceError(error: unknown, paths: WorkflowStorePaths): HarnessError {
  if (error instanceof HarnessError) return error;
  if (isMissing(error)) return workflowNotFound(paths);
  return new HarnessError(
    HarnessErrorCode.IoFailure,
    "Workflow 持久化操作失败。",
    { workflowDirectory: paths.workflowDirectory },
    error,
  );
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
