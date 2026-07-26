import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type {
  CODING_TASK_SESSION_CHANGE_SET_SCHEMA_VERSION,
  CODING_TASK_SESSION_CHANGE_SET_SNAPSHOT_SCHEMA_VERSION,
} from "../constants/index.js";
import type { CodingTaskSessionChangeKind } from "../enums/index.js";

/** 计算 CodingTask Session ChangeSet 与 Snapshot 摘要的领域端口。 */
export interface CodingTaskSessionChangeSetDigestPort {
  /** 对 JSON-compatible 的规范字段计算稳定 Content Digest。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}

/** 不包含目标内容摘要的 ChangeSet 变化路径与类型。 */
export interface CodingTaskSessionChangePathInput {
  /** 变化后的 Repository 相对 POSIX 路径。 */
  readonly path: string;
  /** Inspector 提供的 Rename 或 Copy 关系提示；只用于输入，永不进入规范 ChangeSet 输出。 */
  readonly originalPath?: string;
  /** 变化的闭合分类。 */
  readonly kind: CodingTaskSessionChangeKind;
}

/** ChangeSet 中一项带有目标原始字节摘要的变化。 */
export interface CodingTaskSessionChange extends CodingTaskSessionChangePathInput {
  /** 目标原始字节的 SHA-256；删除变化必须显式为 null。 */
  readonly targetContentDigest: ContentDigest | null;
}

/** 计算 ChangeSet Digest 时使用的规范字段。 */
export interface CodingTaskSessionChangeSetDigestInput {
  /** ChangeSet 契约版本。 */
  readonly schemaVersion: typeof CODING_TASK_SESSION_CHANGE_SET_SCHEMA_VERSION;
  /** Repository 的稳定标识。 */
  readonly repositoryId: RepositoryId;
  /** CodingTask Session 锁定的基础 Revision。 */
  readonly baseRevision: string;
  /** 按路径稳定排序的完整变化集合。 */
  readonly changes: readonly CodingTaskSessionChange[];
}

/** 不可变的权威 Git ChangeSet 及其独立摘要。 */
export interface CodingTaskSessionChangeSet extends CodingTaskSessionChangeSetDigestInput {
  /** 仅由 schema、Repository、Base 和规范变化集合计算的摘要。 */
  readonly changeSetDigest: ContentDigest;
}

/** 创建权威 ChangeSet 所需的运行时输入。 */
export interface CreateCodingTaskSessionChangeSetInput {
  /** Repository 的稳定标识。 */
  readonly repositoryId: RepositoryId;
  /** CodingTask Session 锁定的基础 Revision。 */
  readonly baseRevision: string;
  /** 尚未计算或已计算目标摘要的变化集合。 */
  readonly changes: readonly CodingTaskSessionChange[];
}

/** 创建 ChangeSet Snapshot 所需的受检运行时输入。 */
export interface CreateCodingTaskSessionChangeSetSnapshotInput {
  /** 已完成 ChangeSet 摘要校验的权威 ChangeSet。 */
  readonly changeSet: CodingTaskSessionChangeSet;
  /** 受管 Worktree 的稳定标识。 */
  readonly worktreeId: string;
  /** Worktree 相对于 Repository Root 的规范 POSIX 路径。 */
  readonly worktreeRelativePath: string;
  /** 实际观察到的 Worktree 分支名称。 */
  readonly branchName: string;
  /** 实际观察到的 Worktree HEAD Revision。 */
  readonly observedHeadRevision: string;
  /** 规范化且完整的受控 Write Set。 */
  readonly writeSet: readonly string[];
}

/** 计算 Snapshot Digest 时使用的完整规范字段。 */
export interface CodingTaskSessionChangeSetSnapshotDigestInput {
  /** Snapshot 契约版本。 */
  readonly schemaVersion: typeof CODING_TASK_SESSION_CHANGE_SET_SNAPSHOT_SCHEMA_VERSION;
  /** Repository 的稳定标识。 */
  readonly repositoryId: RepositoryId;
  /** 受管 Worktree 的稳定标识。 */
  readonly worktreeId: string;
  /** Worktree 相对于 Repository Root 的规范 POSIX 路径。 */
  readonly worktreeRelativePath: string;
  /** 实际观察到的 Worktree 分支名称。 */
  readonly branchName: string;
  /** CodingTask Session 锁定的基础 Revision。 */
  readonly baseRevision: string;
  /** 实际观察到的 Worktree HEAD Revision。 */
  readonly observedHeadRevision: string;
  /** 规范化且完整的受控 Write Set。 */
  readonly writeSet: readonly string[];
  /** 变化涉及的全部 Repository 相对路径。 */
  readonly changedPaths: readonly string[];
  /** Snapshot 携带的规范变化集合。 */
  readonly changes: readonly CodingTaskSessionChange[];
  /** 独立 ChangeSet Digest。 */
  readonly changeSetDigest: ContentDigest;
}

/** 绑定 Worktree 现场并单独摘要的 ChangeSet Snapshot。 */
export interface CodingTaskSessionChangeSetSnapshot extends CodingTaskSessionChangeSetSnapshotDigestInput {
  /** 绑定 Snapshot 现场与完整内容的独立摘要。 */
  readonly snapshotDigest: ContentDigest;
}
