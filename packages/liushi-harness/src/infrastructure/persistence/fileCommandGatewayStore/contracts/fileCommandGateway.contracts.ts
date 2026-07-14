import type { CommandInvocationProvenance, CommandReceipt } from "#application/index.js";
import type { ContentDigest } from "#common/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";

import type { COMMAND_RESERVATION_FILE_SCHEMA_VERSION } from "../constants/index.js";

/** 不包含业务 Payload 的持久化 Command Reservation。 */
export interface PersistedCommandReservation {
  /** Reservation 文件 Schema 版本。 */
  readonly schemaVersion: typeof COMMAND_RESERVATION_FILE_SCHEMA_VERSION;
  /** 目标 Aggregate 类型。 */
  readonly aggregateType: string;
  /** 目标聚合 Aggregate ID。 */
  readonly aggregateId: string;
  /** 命令 Command Type。 */
  readonly commandType: string;
  /** 幂等键。 */
  readonly idempotencyKey: string;
  /** 首次获得执行权的 Command ID。 */
  readonly commandId: string;
  /** 首次请求摘要。 */
  readonly requestDigest: ContentDigest;
  /** 首次请求提交时间。 */
  readonly submittedAt: string;
  /** 首次请求携带的调用来源证明。 */
  readonly invocationProvenance?: CommandInvocationProvenance;
  /** Handler 完成并可靠落盘后的 Receipt。 */
  readonly receipt?: CommandReceipt;
}

/** 单个 Command 幂等作用域的规范路径。 */
export interface CommandReservationPaths {
  /** 分区目录。 */
  readonly directory: string;
  /** Reservation JSON 文件。 */
  readonly recordFile: string;
  /** Reservation 排他 Lock。 */
  readonly lockFile: string;
}

/** File Command Reservation Store 的基础设施依赖。 */
export interface FileCommandReservationStoreDependencies {
  /** 跨进程排他 Lock。 */
  readonly lockManager: FileLockManager;
  /** 原子 Rename 后的父目录耐久性。 */
  readonly parentDirectoryDurability: ParentDirectoryDurability;
}
