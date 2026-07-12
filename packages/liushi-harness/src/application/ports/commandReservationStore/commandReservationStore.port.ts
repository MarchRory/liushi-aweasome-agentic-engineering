import type { CommandEnvelope, CommandReceipt } from "#application/command/index.js";
import type { HarnessError, Result } from "#common/index.js";

import type { CommandReservation } from "./commandReservationStore.contracts.js";

/** Gateway 的持久化幂等 Reservation Port。 */
export interface CommandReservationStore {
  /** 原子获得首次执行权，或解析已存在的稳定结果。 */
  reserve(command: CommandEnvelope): Promise<Result<CommandReservation, HarnessError>>;
  /** 将 Handler 结果原子写回同一个 Reservation。 */
  complete(
    command: CommandEnvelope,
    receipt: CommandReceipt,
  ): Promise<Result<CommandReceipt, HarnessError>>;
}
