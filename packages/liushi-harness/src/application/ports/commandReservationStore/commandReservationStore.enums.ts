/** Command Reservation Store 的封闭结果类别。 */
export enum CommandReservationDisposition {
  /** 当前调用获得首次执行权。 */
  Acquired = "acquired",
  /** 当前调用应直接返回 Store 提供的稳定 Receipt。 */
  Resolved = "resolved",
  /** 首次 Handler 可能仍在执行，调用方只能等待或返回未知态。 */
  Pending = "pending",
}
