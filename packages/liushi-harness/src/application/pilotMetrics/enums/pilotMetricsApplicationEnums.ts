/** Pilot Metrics 单 Session 报告状态。 */
export enum PilotMetricsReportStatus {
  /** 尚未形成完整 Settlement，仅能报告缺失事实。 */
  NotMeasured = "not_measured",
  /** 已完成权威证据绑定，可提供描述性原始事实。 */
  DescriptiveAvailable = "descriptive_available",
}

/** 当前报告是否允许形成效果声明。 */
export enum PilotMetricsClaimEligibility {
  /** 仅允许描述单 Session 原始事实。 */
  DescriptiveOnly = "descriptive_only",
  /** 原始事实不完整或存在 No-Go 信号，禁止效果声明。 */
  Blocked = "blocked",
}

/** 报告缺失的稳定事实类别。 */
export enum PilotMetricsMissingFact {
  /** 尚未预登记 Enrollment。 */
  Enrollment = "enrollment",
  /** 尚未提交 Settlement。 */
  Settlement = "settlement",
}
