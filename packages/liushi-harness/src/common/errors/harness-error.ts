/** Harness 可以稳定暴露给 CLI、Adapter 和测试的错误类别。 */
export enum HarnessErrorCode {
  /** 输入缺失、格式非法或包含未支持参数。 */
  InvalidInput = "invalid_input",
  /** 请求的 Task 不存在。 */
  TaskNotFound = "task_not_found",
  /** 相同 Workspace 和 Task ID 已存在。 */
  TaskAlreadyExists = "task_already_exists",
  /** Task 当前状态不允许目标迁移。 */
  InvalidStateTransition = "invalid_state_transition",
  /** 另一个进程或未修复 Lock 阻止当前操作。 */
  LockUnavailable = "lock_unavailable",
  /** Event、Snapshot、Hash 或 Schema 无法通过完整性校验。 */
  CorruptStore = "corrupt_store",
  /** 文件系统操作失败且没有更具体的稳定错误。 */
  IoFailure = "io_failure",
}

/** Harness 跨层返回的可分类错误。 */
export class HarnessError extends Error {
  /** 稳定错误类别。 */
  public readonly code: HarnessErrorCode;

  /** 支撑诊断但不包含 Secret 的结构化细节。 */
  public readonly details: Readonly<Record<string, string>>;

  public constructor(
    code: HarnessErrorCode,
    message: string,
    details: Readonly<Record<string, string>> = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "HarnessError";
    this.code = code;
    this.details = details;
  }
}
