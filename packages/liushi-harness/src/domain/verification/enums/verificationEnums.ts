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

/** Project Verification Check 的影响面选择方式。 */
export enum VerificationSelectionMode {
  /** 不依赖变更影响面，始终进入候选执行集合。 */
  Always = "always",
  /** 由变更路径或关联 Rule Validator 决定是否进入执行集合。 */
  ChangedPaths = "changed_paths",
}

/** 单个 Project Verification Check 的选择状态。 */
export enum VerificationCheckSelectionStatus {
  /** 当前影响面要求执行该 Check。 */
  Selected = "selected",
  /** 已有充分信息证明当前影响面不需要该 Check。 */
  Excluded = "excluded",
}

/** 单个 Project Verification Check 的稳定选择原因。 */
export enum VerificationCheckSelectionReason {
  /** Required Check 无条件进入执行集合。 */
  Required = "required",
  /** Check 被配置为始终执行。 */
  Always = "always",
  /** 变更路径命中了 Check 的 Path Glob。 */
  PathGlobMatched = "path_glob_matched",
  /** Applicable Rule 的 Validator 映射命中了 Check。 */
  RuleValidatorMatched = "rule_validator_matched",
  /** 路径与 Rule Validator 同时命中了 Check。 */
  PathGlobAndRuleValidatorMatched = "path_glob_and_rule_validator_matched",
  /** 输入不足以证明安全排除，因而保守选择。 */
  Conservative = "conservative",
  /** 路径和 Rule Validator 均未证明该 Check 受影响。 */
  NotImpacted = "not_impacted",
}

/** Verification 影响面选择结果是否可以继续使用。 */
export enum VerificationImpactSelectionStatus {
  /** 选择结果满足全部 fail-closed 不变量。 */
  Ready = "ready",
  /** 选择结果缺少必要映射或配置，不能继续使用。 */
  Blocked = "blocked",
}

/** Verification 影响面选择器的稳定诊断代码。 */
export enum VerificationImpactDiagnosticCode {
  /** 当前项目没有任何已确认 Verification Check。 */
  VerificationChecksMissing = "verification_checks_missing",
  /** Changed Path 不是规范 Repository 相对路径。 */
  ChangedPathInvalid = "changed_path_invalid",
  /** Rule Bundle Target 未完整覆盖 Changed Paths。 */
  RuleTargetCoverageIncomplete = "rule_target_coverage_incomplete",
  /** Applicable Blocking Rule 的 Validator 没有任何 Check 映射。 */
  BlockingRuleValidatorUnmapped = "blocking_rule_validator_unmapped",
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
  /** Worktree 不是可验证的 Git Root。 */
  WorktreeUnavailable = "worktree_unavailable",
  /** Worktree HEAD、Target 或 Base Revision 与 Plan 不一致。 */
  RevisionMismatch = "revision_mismatch",
  /** Verification 开始前 Worktree 包含未提交变化。 */
  WorktreeDirty = "worktree_dirty",
  /** Verification Check 修改了 Worktree 内容或 HEAD。 */
  WorktreeModified = "worktree_modified",
  /** Worktree 当前 Branch 与 Plan 不一致。 */
  BranchMismatch = "branch_mismatch",
  /** Mock 或执行器没有为该 Check 提供结果。 */
  Unconfigured = "unconfigured",
}
