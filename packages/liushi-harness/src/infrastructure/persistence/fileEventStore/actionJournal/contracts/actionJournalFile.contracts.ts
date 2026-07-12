import type { FileLockManager } from "../../lock/index.js";
import type { ParentDirectoryDurability } from "../../parentDirectoryDurability/index.js";
import type { ActionJournalRecord } from "#domain/actionJournal/index.js";

import type { ACTION_JOURNAL_FILE_SCHEMA_VERSION } from "../constants/index.js";

/** Action Journal 写入失败所在的封闭提交阶段。 */
export enum ActionJournalCommitFailureStage {
  /** Journal Record 写入未能正常完成。 */
  Write = "write",
  /** Record 写入完成但 fsync 未能正常完成。 */
  Sync = "sync",
}

/** Action Journal 已提交后的文件句柄状态。 */
export enum ActionJournalHandleStatus {
  /** Journal 已 fsync 且句柄已关闭。 */
  Released = "released",
  /** Journal 已 fsync，但句柄需要显式恢复。 */
  RecoveryRequired = "recovery_required",
}

/** Action Journal 提交边界所需的最小文件句柄协议。 */
export interface ActionJournalCommitHandle {
  /** 刷新已经写入的 Journal 内容。 */
  sync(): Promise<void>;
  /** 关闭 Journal 文件句柄。 */
  close(): Promise<void>;
}

/** Action Journal Record 跨过提交边界后的结果。 */
export interface ActionJournalCommitOutcome {
  /** 已提交 Journal 对应的文件句柄状态。 */
  readonly handle: ActionJournalHandleStatus;
}

/** actions.jsonl 中带全局 Sequence 与 Hash Chain 的一条记录。 */
export interface ActionJournalFileRecord {
  /** Action Journal File Schema 版本。 */
  readonly schemaVersion: typeof ACTION_JOURNAL_FILE_SCHEMA_VERSION;
  /** Task actions.jsonl 内从 1 开始严格递增的全局序号。 */
  readonly journalSequence: number;
  /** 已通过领域严格 Schema 的 Action Record。 */
  readonly record: ActionJournalRecord;
  /** 前一条 File Record Hash 或固定 Genesis Hash。 */
  readonly previousHash: string;
  /** 当前 File Record 的 RFC 8785 SHA-256 Hash。 */
  readonly hash: string;
}

/** File Action Journal Repository 的可替换依赖。 */
export interface FileActionJournalRepositoryDependencies {
  /** Action Journal 跨进程排他锁。 */
  readonly lockManager: FileLockManager;
  /** Journal 文件父目录耐久性边界。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}
