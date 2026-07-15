/** Codex 兼容性证据所引用的受验观察类型。 */
export enum CodexCompatibilityObservationKind {
  /** Host Smoke Prepare 内绑定的静态 Probe。 */
  StaticProbe = "static_probe",
  /** 真实交互式 Host 正负路径验收。 */
  HostSmoke = "host_smoke",
}

/** Host Result 对 Domain Matrix 支持等级的声明边界。 */
export enum CodexMatrixSupportClaim {
  /** Host Result 只提供证据，不独立计算 Matrix 支持等级。 */
  NotEvaluated = "not_evaluated",
}
