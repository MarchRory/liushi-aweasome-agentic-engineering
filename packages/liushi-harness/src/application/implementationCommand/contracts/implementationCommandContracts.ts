import type { FileMutation } from "#application/ports/index.js";
import type { ContentDigest } from "#common/index.js";

/** 受控文件写入 Command 的持久化载荷。 */
export interface ApplyImplementationCommandPayload {
  /** CodingTask 所属 Workspace。 */
  readonly workspaceId: string;
  /** 本次 Action Journal 标识。 */
  readonly actionId: string;
  /** 当前仍在运行的实现 Attempt 序号。 */
  readonly attemptNumber: number;
  /** Repository Root 的摘要绑定。 */
  readonly runtimeRootDigest: ContentDigest;
  /** 按路径排序的完整目标文件集合。 */
  readonly mutations: readonly FileMutation[];
}

/** 仅在当前调用期间存在的本机路径。 */
export interface ImplementationCommandRuntimeContext {
  /** 仅在当前进程中使用的 Repository Root。 */
  readonly repositoryRoot: string;
}
