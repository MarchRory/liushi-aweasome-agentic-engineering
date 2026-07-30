/** Pilot Metrics create-only 写入的结果分类。 */
export enum PilotMetricsCreateDisposition {
  /** 首次写入。 */
  Created = "created",
  /** 相同规范内容已存在。 */
  Reused = "reused",
  /** 同一定位下已有不同规范内容。 */
  Conflict = "conflict",
}
