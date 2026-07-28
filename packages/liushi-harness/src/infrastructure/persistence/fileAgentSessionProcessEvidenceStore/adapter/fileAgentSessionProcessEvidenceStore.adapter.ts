import { isAbsolute, resolve } from "node:path";

import type {
  AgentSessionProcessEvidenceCreateResult,
  AgentSessionProcessEvidenceLocator,
  AgentSessionProcessEvidenceStore,
} from "#application/ports/agentSessionProcessEvidenceStore/index.js";
import { AgentSessionProcessEvidenceCreateDisposition as Disposition } from "#application/ports/agentSessionProcessEvidenceStore/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  rebuildAgentSessionProcessEvidence,
  type AgentSessionProcessEvidence,
} from "#domain/agentSessionProcessEvidence/index.js";
import {
  parseCodingTaskSessionId,
  type CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";
import type { ExclusiveFileLockHandle } from "#infrastructure/persistence/fileEventStore/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import type {
  AgentSessionProcessEvidenceStorePaths,
  FileAgentSessionProcessEvidenceStoreDependencies,
} from "../contracts/index.js";
import {
  isAgentSessionProcessEvidenceRecordPresent,
  readAgentSessionProcessEvidenceRecord,
  writeAgentSessionProcessEvidenceRecord,
} from "../io/index.js";
import { resolveAgentSessionProcessEvidenceStorePaths } from "../path/index.js";
import { ensureAgentSessionProcessEvidenceStorePath } from "../validation/index.js";

/** 基于不可变文件的 Agent 进程证据 Store。 */
export class FileAgentSessionProcessEvidenceStore implements AgentSessionProcessEvidenceStore {
  private readonly storeRoot: string;

  public constructor(
    storeRoot: string,
    private readonly dependencies: FileAgentSessionProcessEvidenceStoreDependencies,
  ) {
    if (!isAbsolute(storeRoot)) {
      throw new HarnessError(
        HarnessErrorCode.InvalidInput,
        "进程证据 Store 根目录必须为绝对路径。",
        { field: "storeRoot" },
      );
    }
    this.storeRoot = resolve(storeRoot);
  }

  public async create(
    evidence: AgentSessionProcessEvidence,
  ): Promise<Result<AgentSessionProcessEvidenceCreateResult, HarnessError>> {
    const rebuilt = rebuildAgentSessionProcessEvidence(evidence, this.dependencies.digest);
    if (rebuilt.status === ResultStatus.Failure) return rebuilt;
    const paths = resolveAgentSessionProcessEvidenceStorePaths(
      this.storeRoot,
      rebuilt.value.workspaceId,
      rebuilt.value.sessionId,
    );
    return this.withLock(paths, true, async () => {
      const present = await isAgentSessionProcessEvidenceRecordPresent(paths.recordFile);
      if (present.status === ResultStatus.Failure) return present;
      if (present.value) return this.resolveExisting(paths.recordFile, rebuilt.value);
      const written = await writeAgentSessionProcessEvidenceRecord(
        paths.recordFile,
        rebuilt.value,
        this.dependencies.parentDirectoryDurability,
      );
      if (written.status === ResultStatus.Failure) return written;
      return written.value
        ? success({ disposition: Disposition.Created, evidence: rebuilt.value })
        : this.resolveExisting(paths.recordFile, rebuilt.value);
    });
  }

  public async load(
    locator: AgentSessionProcessEvidenceLocator,
  ): Promise<Result<AgentSessionProcessEvidence, HarnessError>> {
    const parsed = parseLocator(locator);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const paths = resolveAgentSessionProcessEvidenceStorePaths(
      this.storeRoot,
      parsed.value.workspaceId,
      parsed.value.sessionId,
    );
    return this.withLock(paths, false, () =>
      readAgentSessionProcessEvidenceRecord(paths.recordFile, this.dependencies.digest),
    );
  }

  private async resolveExisting(
    recordFile: string,
    incoming: AgentSessionProcessEvidence,
  ): Promise<Result<AgentSessionProcessEvidenceCreateResult, HarnessError>> {
    const existing = await readAgentSessionProcessEvidenceRecord(
      recordFile,
      this.dependencies.digest,
    );
    if (existing.status === ResultStatus.Failure) return existing;
    return success({
      disposition:
        canonicalizeJson(existing.value) === canonicalizeJson(incoming)
          ? Disposition.Reused
          : Disposition.Conflict,
      evidence: existing.value,
    });
  }

  private async withLock<T>(
    paths: AgentSessionProcessEvidenceStorePaths,
    createMissing: boolean,
    operation: () => Promise<Result<T, HarnessError>>,
  ): Promise<Result<T, HarnessError>> {
    const prepared = await ensureAgentSessionProcessEvidenceStorePath(paths, createMissing);
    if (prepared.status === ResultStatus.Failure) return prepared;
    if (!prepared.value) return failure(notFound());

    let lock: ExclusiveFileLockHandle;
    try {
      lock = await this.dependencies.lockManager.acquire(paths.lockFile, {
        workspaceId: paths.workspaceId,
        taskId: paths.sessionId,
      });
    } catch (error) {
      return failure(toHarnessError(error, HarnessErrorCode.LockUnavailable, "进程证据锁不可用。"));
    }

    let result: Result<T, HarnessError>;
    try {
      const rechecked = await ensureAgentSessionProcessEvidenceStorePath(paths, createMissing);
      result =
        rechecked.status === ResultStatus.Failure
          ? rechecked
          : !rechecked.value
            ? failure(notFound())
            : await operation();
    } catch (error) {
      result = failure(
        toHarnessError(error, HarnessErrorCode.IoFailure, "进程证据 Store 操作失败。"),
      );
    }

    try {
      await lock.release();
    } catch (error) {
      return failure(toHarnessError(error, HarnessErrorCode.IoFailure, "进程证据锁释放失败。"));
    }
    return result;
  }
}

function parseLocator(
  locator: AgentSessionProcessEvidenceLocator,
): Result<
  { readonly workspaceId: WorkspaceId; readonly sessionId: CodingTaskSessionId },
  HarnessError
> {
  const workspaceId = parseWorkspaceId(String(locator?.workspaceId ?? ""));
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const sessionId = parseCodingTaskSessionId(String(locator?.sessionId ?? ""));
  return sessionId.status === ResultStatus.Failure
    ? sessionId
    : success({ workspaceId: workspaceId.value, sessionId: sessionId.value });
}

function notFound(): HarnessError {
  return new HarnessError(HarnessErrorCode.PreconditionNotMet, "进程证据不存在。");
}

function toHarnessError(error: unknown, code: HarnessErrorCode, message: string): HarnessError {
  return error instanceof HarnessError ? error : new HarnessError(code, message, {}, error);
}
