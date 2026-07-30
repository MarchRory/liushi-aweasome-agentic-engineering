import { isAbsolute, resolve } from "node:path";

import {
  PilotMetricsCreateDisposition,
  type PilotMetricsCreateResult,
  type PilotMetricsLocator,
  type PilotMetricsStore,
} from "#application/ports/pilotMetricsStore/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  rebuildPilotMetricsEnrollment,
  rebuildPilotMetricsSettlement,
  type PilotEnrollment,
  type PilotSettlement,
} from "#domain/pilotMetrics/index.js";
import { parseCodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";
import type { ExclusiveFileLockHandle } from "#infrastructure/persistence/fileEventStore/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import type {
  FilePilotMetricsStoreDependencies,
  FilePilotMetricsStorePaths,
} from "../contracts/index.js";
import {
  isPilotMetricsRecordPresent,
  readPilotMetricsEnrollment,
  readPilotMetricsSettlement,
  writePilotMetricsRecord,
} from "../io/index.js";
import { resolveFilePilotMetricsStorePaths } from "../path/index.js";
import { ensureFilePilotMetricsStorePath } from "../validation/index.js";

/** Runtime Store 中的 Pilot Metrics create-only 文件适配器。 */
export class FilePilotMetricsStore implements PilotMetricsStore {
  private readonly storeRoot: string;

  public constructor(
    storeRoot: string,
    private readonly dependencies: FilePilotMetricsStoreDependencies,
  ) {
    if (!isAbsolute(storeRoot)) {
      throw new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Pilot Metrics Store 根目录必须是绝对路径",
        { field: "storeRoot" },
      );
    }
    this.storeRoot = resolve(storeRoot);
  }

  public async createEnrollment(
    enrollment: PilotEnrollment,
  ): Promise<Result<PilotMetricsCreateResult<PilotEnrollment>, HarnessError>> {
    const rebuilt = rebuildPilotMetricsEnrollment(enrollment, this.dependencies.digest);
    if (rebuilt.status === ResultStatus.Failure) return rebuilt;
    const paths = resolveFilePilotMetricsStorePaths(
      this.storeRoot,
      rebuilt.value.workspaceId,
      rebuilt.value.sessionId,
    );
    return this.createRecord(
      paths,
      paths.enrollmentFile,
      rebuilt.value,
      readPilotMetricsEnrollment,
    );
  }

  public async findEnrollment(
    locator: PilotMetricsLocator,
  ): Promise<Result<PilotEnrollment | null, HarnessError>> {
    const parsed = parseLocator(locator);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const paths = resolveFilePilotMetricsStorePaths(
      this.storeRoot,
      parsed.value.workspaceId,
      parsed.value.sessionId,
    );
    return this.findRecord(paths, paths.enrollmentFile, readPilotMetricsEnrollment);
  }

  public async loadEnrollment(
    locator: PilotMetricsLocator,
  ): Promise<Result<PilotEnrollment, HarnessError>> {
    const parsed = parseLocator(locator);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const paths = resolveFilePilotMetricsStorePaths(
      this.storeRoot,
      parsed.value.workspaceId,
      parsed.value.sessionId,
    );
    return this.loadRecord(paths, paths.enrollmentFile, readPilotMetricsEnrollment);
  }

  public async createSettlement(
    settlement: PilotSettlement,
  ): Promise<Result<PilotMetricsCreateResult<PilotSettlement>, HarnessError>> {
    const rebuilt = rebuildPilotMetricsSettlement(settlement, this.dependencies.digest);
    if (rebuilt.status === ResultStatus.Failure) return rebuilt;
    const paths = resolveFilePilotMetricsStorePaths(
      this.storeRoot,
      rebuilt.value.workspaceId,
      rebuilt.value.sessionId,
    );
    return this.createRecord(
      paths,
      paths.settlementFile,
      rebuilt.value,
      readPilotMetricsSettlement,
    );
  }

  public async findSettlement(
    locator: PilotMetricsLocator,
  ): Promise<Result<PilotSettlement | null, HarnessError>> {
    const parsed = parseLocator(locator);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const paths = resolveFilePilotMetricsStorePaths(
      this.storeRoot,
      parsed.value.workspaceId,
      parsed.value.sessionId,
    );
    return this.findRecord(paths, paths.settlementFile, readPilotMetricsSettlement);
  }

  public async loadSettlement(
    locator: PilotMetricsLocator,
  ): Promise<Result<PilotSettlement, HarnessError>> {
    const parsed = parseLocator(locator);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const paths = resolveFilePilotMetricsStorePaths(
      this.storeRoot,
      parsed.value.workspaceId,
      parsed.value.sessionId,
    );
    return this.loadRecord(paths, paths.settlementFile, readPilotMetricsSettlement);
  }

  private async createRecord<T extends PilotEnrollment | PilotSettlement>(
    paths: FilePilotMetricsStorePaths,
    recordFile: string,
    incoming: T,
    read: (
      filePath: string,
      digest: FilePilotMetricsStoreDependencies["digest"],
    ) => Promise<Result<T, HarnessError>>,
  ): Promise<Result<PilotMetricsCreateResult<T>, HarnessError>> {
    return this.withLock(paths, true, async () => {
      const present = await isPilotMetricsRecordPresent(recordFile);
      if (present.status === ResultStatus.Failure) return present;
      if (present.value) return this.resolveExisting(recordFile, incoming, read);
      const written = await writePilotMetricsRecord(
        recordFile,
        incoming,
        this.dependencies.parentDirectoryDurability,
      );
      if (written.status === ResultStatus.Failure) return written;
      return written.value
        ? success({ disposition: PilotMetricsCreateDisposition.Created, record: incoming })
        : this.resolveExisting(recordFile, incoming, read);
    });
  }

  private async findRecord<T extends PilotEnrollment | PilotSettlement>(
    paths: FilePilotMetricsStorePaths,
    recordFile: string,
    read: (
      filePath: string,
      digest: FilePilotMetricsStoreDependencies["digest"],
    ) => Promise<Result<T, HarnessError>>,
  ): Promise<Result<T | null, HarnessError>> {
    const prepared = await ensureFilePilotMetricsStorePath(paths, false);
    if (prepared.status === ResultStatus.Failure) return prepared;
    if (!prepared.value) return success(null);
    return this.withLock(paths, false, async () => {
      const present = await isPilotMetricsRecordPresent(recordFile);
      if (present.status === ResultStatus.Failure) return present;
      if (!present.value) return success(null);
      return read(recordFile, this.dependencies.digest);
    });
  }

  private async loadRecord<T extends PilotEnrollment | PilotSettlement>(
    paths: FilePilotMetricsStorePaths,
    recordFile: string,
    read: (
      filePath: string,
      digest: FilePilotMetricsStoreDependencies["digest"],
    ) => Promise<Result<T, HarnessError>>,
  ): Promise<Result<T, HarnessError>> {
    return this.withLock(paths, false, () => read(recordFile, this.dependencies.digest));
  }

  private async resolveExisting<T extends PilotEnrollment | PilotSettlement>(
    recordFile: string,
    incoming: T,
    read: (
      filePath: string,
      digest: FilePilotMetricsStoreDependencies["digest"],
    ) => Promise<Result<T, HarnessError>>,
  ): Promise<Result<PilotMetricsCreateResult<T>, HarnessError>> {
    const existing = await read(recordFile, this.dependencies.digest);
    if (existing.status === ResultStatus.Failure) return existing;
    return success({
      disposition:
        canonicalizeJson(existing.value) === canonicalizeJson(incoming)
          ? PilotMetricsCreateDisposition.Reused
          : PilotMetricsCreateDisposition.Conflict,
      record: existing.value,
    });
  }

  private async withLock<T>(
    paths: FilePilotMetricsStorePaths,
    createMissing: boolean,
    operation: () => Promise<Result<T, HarnessError>>,
  ): Promise<Result<T, HarnessError>> {
    const prepared = await ensureFilePilotMetricsStorePath(paths, createMissing);
    if (prepared.status === ResultStatus.Failure) return prepared;
    if (!prepared.value) return failure(notFound());
    let lock: ExclusiveFileLockHandle;
    try {
      lock = await this.dependencies.lockManager.acquire(paths.lockFile, {
        workspaceId: paths.workspaceId,
        taskId: paths.sessionId,
      });
    } catch (error) {
      return failure(
        toHarnessError(error, HarnessErrorCode.LockUnavailable, "Pilot Metrics 锁不可用"),
      );
    }
    let result: Result<T, HarnessError>;
    try {
      const rechecked = await ensureFilePilotMetricsStorePath(paths, createMissing);
      result =
        rechecked.status === ResultStatus.Failure
          ? rechecked
          : !rechecked.value
            ? failure(notFound())
            : await operation();
    } catch (error) {
      result = failure(
        toHarnessError(error, HarnessErrorCode.IoFailure, "Pilot Metrics Store 操作失败"),
      );
    }
    try {
      await lock.release();
    } catch (error) {
      return failure(toHarnessError(error, HarnessErrorCode.IoFailure, "Pilot Metrics 锁释放失败"));
    }
    return result;
  }
}

function parseLocator(locator: PilotMetricsLocator): Result<PilotMetricsLocator, HarnessError> {
  const workspace = parseWorkspaceId(String(locator?.workspaceId ?? ""));
  if (workspace.status === ResultStatus.Failure) return workspace;
  const session = parseCodingTaskSessionId(String(locator?.sessionId ?? ""));
  return session.status === ResultStatus.Failure
    ? session
    : success({ workspaceId: workspace.value, sessionId: session.value });
}

function notFound(): HarnessError {
  return new HarnessError(HarnessErrorCode.PreconditionNotMet, "Pilot Metrics 记录不存在");
}

function toHarnessError(error: unknown, code: HarnessErrorCode, message: string): HarnessError {
  return error instanceof HarnessError ? error : new HarnessError(code, message, {}, error);
}
