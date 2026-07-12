import type { HarnessError, Result } from "#common/index.js";
import type { ContentDigest } from "#common/index.js";
import type { ActionOutcome } from "#domain/actionJournal/index.js";
import type { WorktreeBinding } from "#domain/codingTask/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type { FileMutationKind } from "../enums/index.js";

/** 单个文本文件的确定性目标状态。 */
export interface FileMutation {
  /** Repository 相对 POSIX 路径。 */
  readonly path: string;
  /** 文件操作类型。 */
  readonly kind: FileMutationKind;
  /** Replace 时必须匹配的当前文本摘要。 */
  readonly expectedContentDigest?: ContentDigest;
  /** 要写入的完整 UTF-8 文本。 */
  readonly content: string;
  /** 完整目标文本的摘要。 */
  readonly contentDigest: ContentDigest;
}

/** 文件变更 Executor 的完整运行输入。 */
export interface ApplyFileMutationsInput {
  /** Repository 稳定标识。 */
  readonly repositoryId: RepositoryId;
  /** 仅供本次检查使用的 Repository Root。 */
  readonly repositoryRoot: string;
  /** 仅供本次写入使用的 Worktree Root。 */
  readonly worktreeRoot: string;
  /** 已由 CodingTask 锁定的工作树绑定。 */
  readonly worktreeBinding: WorktreeBinding;
  /** 已由 CodingTask 锁定的基础版本。 */
  readonly baseRevision: string;
  /** 已经 Human 确认的完整写入范围。 */
  readonly writeSet: readonly string[];
  /** 本次 Action 的有序目标状态集合。 */
  readonly mutations: readonly FileMutation[];
}

/** 文件变更执行后可写入 Action Journal 的封闭结果。 */
export interface FileMutationExecutionResult {
  /** 当前证据支持的副作用结果。 */
  readonly outcome: ActionOutcome;
  /** 支撑结果的稳定证据标识。 */
  readonly evidenceIds: readonly string[];
  /** 成功时目标文件集合的内容摘要。 */
  readonly outputDigest?: ContentDigest;
  /** 非成功结果的稳定错误分类。 */
  readonly errorCode?: string;
}

/** 受控文件变更 Port。 */
export interface FileMutationExecutorPort {
  /** 应用完整目标文本，并用 Git Inspector 验收实际变更范围。 */
  execute(
    input: ApplyFileMutationsInput,
  ): Promise<Result<FileMutationExecutionResult, HarnessError>>;
}
