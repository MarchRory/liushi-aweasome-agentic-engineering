/** Pilot 任务的封闭分类。 */
export enum PilotTaskClass {
  /** 新功能任务。 */
  Feature = "feature",
  /** 缺陷修复任务。 */
  BugFix = "bug_fix",
  /** 重构任务。 */
  Refactor = "refactor",
  /** 文档任务。 */
  Documentation = "documentation",
  /** 测试任务。 */
  Test = "test",
  /** 其他维护任务。 */
  Maintenance = "maintenance",
}

/** Enrollment 的固定持久化版本。 */
export enum PilotEnrollmentSchemaVersion {
  /** 当前 Enrollment 版本。 */
  V1 = "liushi.pilot-metrics.enrollment.v1",
}

/** Settlement 的固定持久化版本。 */
export enum PilotSettlementSchemaVersion {
  /** 当前 Settlement 版本。 */
  V1 = "liushi.pilot-metrics.settlement.v1",
}

/** Pilot 任务的风险等级。 */
export enum PilotRiskLevel {
  /** 低风险。 */
  Low = "low",
  /** 中风险。 */
  Medium = "medium",
  /** 高风险。 */
  High = "high",
  /** 严重风险。 */
  Critical = "critical",
}

/** 预登记步骤所属的执行阶段。 */
export enum PilotStepPhase {
  /** 计划阶段。 */
  Plan = "plan",
  /** 实施阶段。 */
  Implement = "implement",
  /** 验证阶段。 */
  Verify = "verify",
  /** Review 阶段。 */
  Review = "review",
  /** 恢复阶段。 */
  Recover = "recover",
}

/** 步骤预期采用的执行方式。 */
export enum PilotExecutionMode {
  /** 机器自动执行。 */
  Automated = "automated",
  /** Human 执行。 */
  Human = "human",
  /** Human 与机器共同执行。 */
  Mixed = "mixed",
  /** 实际事实中未执行。 */
  NotExecuted = "not_executed",
}

/** 步骤执行事实的结果。 */
export enum PilotStepOutcome {
  /** 步骤完成。 */
  Completed = "completed",
  /** 步骤失败。 */
  Failed = "failed",
  /** 步骤被跳过。 */
  Skipped = "skipped",
  /** 步骤事实未测量。 */
  NotMeasured = "not_measured",
}

/** Human Touch 的活动类别。 */
export enum PilotHumanTouchCategory {
  /** 需求澄清。 */
  RequirementClarification = "requirement_clarification",
  /** 方案确认。 */
  PlanConfirmation = "plan_confirmation",
  /** Prompt 修正。 */
  PromptCorrection = "prompt_correction",
  /** 人工复核。 */
  Review = "review",
  /** 返工。 */
  Rework = "rework",
  /** 恢复。 */
  Recovery = "recovery",
  /** 验证解释。 */
  VerificationExplanation = "verification_explanation",
}

/** Human Touch 区间的事实来源。 */
export enum PilotHumanTouchSource {
  /** Human 显式报告。 */
  Reported = "reported",
  /** 受信宿主观测。 */
  Observed = "observed",
}

/** Settlement 的完整性声明。 */
export enum PilotAttestation {
  /** Human 声明记录完整。 */
  Complete = "complete",
  /** Human 声明记录不完整。 */
  Incomplete = "incomplete",
  /** 无可信区间或完整性事实。 */
  NotMeasured = "not_measured",
}

/** Settlement 质量事实的封闭类别。 */
export enum PilotQualityFactKind {
  /** 重试事实。 */
  Retry = "retry",
  /** 返工事实。 */
  Rework = "rework",
  /** Gate 误报事实。 */
  GateFalsePositive = "gate_false_positive",
  /** 已逃逸缺陷事实。 */
  EscapedDefect = "escaped_defect",
  /** Waiver 事实。 */
  Waiver = "waiver",
  /** 安全事件事实。 */
  SecurityIncident = "security_incident",
  /** 隐私事件事实。 */
  PrivacyIncident = "privacy_incident",
  /** 结果未知事实。 */
  OutcomeUnknown = "outcome_unknown",
}
