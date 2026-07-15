/** Installation Revision Intent 的幂等保留结果。 */
export enum InstallationRevisionReservationDisposition {
  /** 首次持久化该幂等作用域的 Intent。 */
  Acquired = "acquired",
  /** 同一幂等作用域已存在语义相同的 Intent。 */
  Existing = "existing",
}
