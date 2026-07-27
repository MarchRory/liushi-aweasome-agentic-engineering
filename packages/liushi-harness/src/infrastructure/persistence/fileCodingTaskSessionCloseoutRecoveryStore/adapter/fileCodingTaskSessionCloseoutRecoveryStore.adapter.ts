import { isAbsolute, resolve } from "node:path";

import {
  rebuildCodingTaskSessionCloseoutRecoveryState,
  type CodingTaskSessionCloseoutRecoveryState,
} from "#application/codingTaskSessionCloseoutRecovery/state/index.js";
import type {
  CodingTaskSessionCloseoutRecoveryStateCreateResult,
  CodingTaskSessionCloseoutRecoveryStateLocator,
  CodingTaskSessionCloseoutRecoveryStateReplaceInput,
  CodingTaskSessionCloseoutRecoveryStateStore,
} from "#application/ports/codingTaskSessionCloseoutRecoveryStateStore/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import type { FileCodingTaskSessionCloseoutRecoveryStoreDependencies } from "../contracts/index.js";
import { codingTaskSessionCloseoutRecoveryStateNotFound } from "../errors/index.js";
import {
  FileCodingTaskSessionCloseoutRecoveryStoreMutationService,
  isApprovedInitialRecoveryState,
} from "../implementation/index.js";
import { readCodingTaskSessionCloseoutRecoveryState } from "../io/index.js";
import { withCodingTaskSessionCloseoutRecoveryMutationLock } from "../mutation/index.js";
import { resolveCodingTaskSessionCloseoutRecoveryStorePaths } from "../path/index.js";
import {
  ensureCodingTaskSessionCloseoutRecoveryStorePath,
  isCodingTaskSessionCloseoutRecoveryStatePresent,
  parseCodingTaskSessionCloseoutRecoveryStateLocator,
} from "../validation/index.js";

/** 使用独立 Recovery 锁实现 create-only 与版本化 CAS replace 的 File Adapter。 */
export class FileCodingTaskSessionCloseoutRecoveryStore implements CodingTaskSessionCloseoutRecoveryStateStore<CodingTaskSessionCloseoutRecoveryState> {
  private readonly storeRoot: string;
  private readonly digest: FileCodingTaskSessionCloseoutRecoveryStoreDependencies["digest"];
  private readonly lockManager: FileCodingTaskSessionCloseoutRecoveryStoreDependencies["lockManager"];
  private readonly mutationService: FileCodingTaskSessionCloseoutRecoveryStoreMutationService;

  /** 接收 Composition Root 注入的摘要、锁和父目录耐久化能力。 */
  public constructor(
    storeRoot: string,
    dependencies: FileCodingTaskSessionCloseoutRecoveryStoreDependencies,
  ) {
    if (!isAbsolute(storeRoot)) {
      throw new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Closeout Recovery Store Root 必须是绝对路径。",
        { storeRoot },
      );
    }
    this.storeRoot = resolve(storeRoot);
    this.digest = dependencies.digest;
    this.lockManager = dependencies.lockManager;
    this.mutationService = new FileCodingTaskSessionCloseoutRecoveryStoreMutationService(
      this.digest,
      dependencies.parentDirectoryDurability,
    );
  }

  /** 只发布 Approved v0；同一身份返回现有进度。 */
  public async create(
    state: CodingTaskSessionCloseoutRecoveryState,
  ): Promise<
    Result<
      CodingTaskSessionCloseoutRecoveryStateCreateResult<CodingTaskSessionCloseoutRecoveryState>,
      HarnessError
    >
  > {
    const rebuilt = rebuildCodingTaskSessionCloseoutRecoveryState(state, this.digest);
    if (rebuilt.status === ResultStatus.Failure) return rebuilt;
    if (!isApprovedInitialRecoveryState(rebuilt.value)) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Recovery create 必须是 Approved v0。"),
      );
    }
    const paths = resolveCodingTaskSessionCloseoutRecoveryStorePaths(
      this.storeRoot,
      rebuilt.value.workspaceId,
      rebuilt.value.sessionId,
    );
    return withCodingTaskSessionCloseoutRecoveryMutationLock({
      paths,
      createMissing: true,
      lockManager: this.lockManager,
      operation: () => this.mutationService.create(paths, rebuilt.value),
    });
  }

  /** 按严格定位查找 Recovery State；不存在时返回 null。 */
  public async find(
    locator: CodingTaskSessionCloseoutRecoveryStateLocator,
  ): Promise<Result<CodingTaskSessionCloseoutRecoveryState | null, HarnessError>> {
    const parsed = parseCodingTaskSessionCloseoutRecoveryStateLocator(locator);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const paths = resolveCodingTaskSessionCloseoutRecoveryStorePaths(
      this.storeRoot,
      parsed.value.workspaceId,
      parsed.value.sessionId,
    );
    const prepared = await ensureCodingTaskSessionCloseoutRecoveryStorePath(paths, false);
    if (prepared.status === ResultStatus.Failure) return prepared;
    if (!prepared.value) return success(null);
    const present = await isCodingTaskSessionCloseoutRecoveryStatePresent(paths.stateFile);
    if (present.status === ResultStatus.Failure) return present;
    if (!present.value) return success(null);
    return readCodingTaskSessionCloseoutRecoveryState(paths, this.digest);
  }

  /** 严格加载 Recovery State；不存在时返回 PreconditionNotMet。 */
  public async load(
    locator: CodingTaskSessionCloseoutRecoveryStateLocator,
  ): Promise<Result<CodingTaskSessionCloseoutRecoveryState, HarnessError>> {
    const found = await this.find(locator);
    if (found.status === ResultStatus.Failure) return found;
    return found.value === null
      ? failure(codingTaskSessionCloseoutRecoveryStateNotFound())
      : success(found.value);
  }

  /** 在独立 Recovery 锁内重读 current 并执行严格 successor CAS。 */
  public async replace(
    input: CodingTaskSessionCloseoutRecoveryStateReplaceInput<CodingTaskSessionCloseoutRecoveryState>,
  ): Promise<Result<CodingTaskSessionCloseoutRecoveryState, HarnessError>> {
    if (
      !Number.isSafeInteger(input?.expectedVersion) ||
      input.expectedVersion < 0 ||
      input.expectedVersion >= Number.MAX_SAFE_INTEGER
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "expectedVersion 必须是可递增的非负安全整数。",
        ),
      );
    }
    const candidate = rebuildCodingTaskSessionCloseoutRecoveryState(input.state, this.digest);
    if (candidate.status === ResultStatus.Failure) return candidate;
    if (candidate.value.version !== input.expectedVersion + 1) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Recovery State version 必须递增一位。"),
      );
    }
    const paths = resolveCodingTaskSessionCloseoutRecoveryStorePaths(
      this.storeRoot,
      candidate.value.workspaceId,
      candidate.value.sessionId,
    );
    return withCodingTaskSessionCloseoutRecoveryMutationLock({
      paths,
      createMissing: false,
      lockManager: this.lockManager,
      operation: () => this.mutationService.replace(paths, input.expectedVersion, candidate.value),
    });
  }
}
