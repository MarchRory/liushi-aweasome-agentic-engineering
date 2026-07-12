import type { CommandReceipt } from "#application/command/index.js";

import type { CommandReservationDisposition } from "./commandReservationStore.enums.js";

/** 首次调用获得的 Command 执行权。 */
export interface AcquiredCommandReservation {
  /** Reservation 已持久化，可执行一次 Handler。 */
  readonly disposition: CommandReservationDisposition.Acquired;
}

/** 已有幂等记录解析出的稳定结果。 */
export interface ResolvedCommandReservation {
  /** 当前调用不得再次执行 Handler。 */
  readonly disposition: CommandReservationDisposition.Resolved;
  /** 原 Receipt、Duplicate、Conflict 或 OutcomeUnknown Receipt。 */
  readonly receipt: CommandReceipt;
}

/** 已存在但尚未写入 Receipt 的 Reservation。 */
export interface PendingCommandReservation {
  /** 当前调用不得执行第二次 Handler。 */
  readonly disposition: CommandReservationDisposition.Pending;
  /** 首次获得执行权的 Command ID。 */
  readonly ownerCommandId: string;
}

/** Command Reservation Store 的完整结果。 */
export type CommandReservation =
  AcquiredCommandReservation | ResolvedCommandReservation | PendingCommandReservation;
