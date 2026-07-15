/** 单项 Contract Check 的封闭结果。 */
export enum CodexContractCheckOutcome {
  /** Check 的全部机械断言均成立。 */
  Passed = "passed",
  /** 至少一个机械断言不成立。 */
  Failed = "failed",
}

/** 仅用于验证失败证据路径的受控故障点。 */
export enum CodexContractFaultInjection {
  /** 不注入故障。 */
  None = "none",
  /** 让 PostAction Dispatcher 返回非契约附加上下文。 */
  PostAdditionalContext = "post_additional_context",
}
