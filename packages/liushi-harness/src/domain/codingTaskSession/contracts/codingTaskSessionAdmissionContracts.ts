import type { ContentDigest } from "#common/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { CodingTaskSessionAdmissionSchemaVersion } from "../constants/index.js";
import type { CodingTaskSessionAdmissionStatus } from "../enums/index.js";
import type { CodingTaskSessionId } from "../identifiers/index.js";

/** Admission Pending 的最小身份记录，不复制完整 Action Intent。 */
export interface CodingTaskSessionAdmissionPending {
  /** 等待准入的 Action ID。 */
  readonly actionId: string;
  /** Action Intent 的内容摘要。 */
  readonly intentDigest: ContentDigest;
  /** 声明执行器 Session 的摘要。 */
  readonly executorSessionIdDigest: ContentDigest;
}

/** Admission Control State 的持久化状态。 */
export interface CodingTaskSessionAdmissionState {
  /** Admission State Schema 版本。 */
  readonly schemaVersion: CodingTaskSessionAdmissionSchemaVersion;
  /** Harness 工作区标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask 会话标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** Activation 绑定摘要。 */
  readonly activationBindingDigest: ContentDigest;
  /** Session 绑定摘要。 */
  readonly sessionBindingDigest: ContentDigest;
  /** Admission 控制状态。 */
  readonly status: CodingTaskSessionAdmissionStatus;
  /** 当前等待 Action Journal 决定的唯一 Admission。 */
  readonly pendingAdmission: CodingTaskSessionAdmissionPending | null;
  /** 已成功准入的 Action ID 列表。 */
  readonly admittedActionIds: readonly string[];
  /** 首次 claim 的 executor session Digest；尚未 claim 时为 null。 */
  readonly claimedExecutorSessionIdDigest: ContentDigest | null;
  /** Admission State 版本，用于乐观并发检查。 */
  readonly version: number;
  /** 最后一次状态变化时间，必须是规范 ISO UTC。 */
  readonly updatedAt: string;
}

/** 创建 Admission State 所需的不可变绑定输入。 */
export interface CodingTaskSessionAdmissionStateInput {
  /** Harness 工作区标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask 会话标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** Activation 绑定摘要。 */
  readonly activationBindingDigest: ContentDigest;
  /** Session 绑定摘要。 */
  readonly sessionBindingDigest: ContentDigest;
  /** 初始状态的更新时间。 */
  readonly updatedAt: string;
}

/** 开始 Admission Pending 所需的输入。 */
export interface CodingTaskSessionAdmissionBeginPendingInput extends CodingTaskSessionAdmissionPending {
  /** 本次状态迁移的更新时间。 */
  readonly updatedAt: string;
}

/** 提交 Admission Pending 所需的输入。 */
export interface CodingTaskSessionAdmissionCommitPendingInput extends CodingTaskSessionAdmissionPending {
  /** 本次状态迁移的更新时间。 */
  readonly updatedAt: string;
}

/** 仅包含更新时间的 Admission 状态迁移输入。 */
export interface CodingTaskSessionAdmissionTimestampInput {
  /** 本次状态迁移的更新时间。 */
  readonly updatedAt: string;
}
