/** Harness 可以编排并记录的标准验证类别。 */
export enum VerificationKind {
  /** 校验 Artifact、配置或数据是否符合 Schema。 */
  Schema = "schema",
  /** 执行 TypeScript 或其他静态类型检查。 */
  Typecheck = "typecheck",
  /** 执行代码、文档或配置 Lint。 */
  Lint = "lint",
  /** 校验唯一格式化结果且不自动修改。 */
  Format = "format",
  /** 执行隔离且快速的单元测试。 */
  UnitTest = "unit_test",
  /** 执行跨模块或外部 Adapter 集成测试。 */
  IntegrationTest = "integration_test",
  /** 执行用户可观察工作流的端到端测试。 */
  EndToEndTest = "end_to_end_test",
  /** 构建发布产物或应用 Bundle。 */
  Build = "build",
  /** 执行静态安全、Secret 或依赖检查。 */
  Security = "security",
  /** 校验实现是否满足当前 Rule Bundle 和架构机制。 */
  RuleCompliance = "rule_compliance",
  /** 执行仓库定义并经 Human 确认的自定义检查。 */
  Custom = "custom",
}

/** 一个 Verification Check 对交付 Gate 的必要程度。 */
export enum VerificationRequirement {
  /** 不通过就不能进入 Review-ready。 */
  Required = "required",
  /** 风险或变更命中条件时变为 Required。 */
  Conditional = "conditional",
  /** 提供额外信号，不单独阻断交付。 */
  Advisory = "advisory",
}

/** 一次 Verification Execution 或 Evidence Bundle 的最终状态。 */
export enum VerificationStatus {
  /** 检查成功且结果适用于当前 Revision。 */
  Passed = "passed",
  /** 检查完成但未满足通过条件。 */
  Failed = "failed",
  /** 环境或能力原因导致检查未执行。 */
  Blocked = "blocked",
  /** Human 明确接受该检查缺失产生的风险。 */
  Waived = "waived",
}

/** Verification 执行失败或被阻断时使用的稳定诊断分类。 */
export enum VerificationFailureKind {
  /** 命令执行并返回失败退出码。 */
  CommandFailed = "command_failed",
  /** 命令超过计划超时时间。 */
  TimedOut = "timed_out",
  /** 执行环境或工具不可用。 */
  Unavailable = "unavailable",
  /** 输出或资源超过执行限制。 */
  OutputLimit = "output_limit",
  /** 执行结果无法按协议解析。 */
  InvalidOutput = "invalid_output",
  /** Mock 或执行器没有为该 Check 提供结果。 */
  Unconfigured = "unconfigured",
}
