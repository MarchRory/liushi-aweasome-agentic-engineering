/** CodingTask 所处的业务阶段。 */
export enum CodingTaskPhase {
  /** 等待实现尝试。 */
  Implementation = "implementation",
  /** 等待验证流程。 */
  Verification = "verification",
}

/** CodingTask 当前的运行状态。 */
export enum CodingTaskRunState {
  /** 当前允许执行实现动作。 */
  Active = "active",
  /** 当前等待 Human 处理。 */
  WaitingHuman = "waiting_human",
  /** 已被 Human 暂停。 */
  Paused = "paused",
  /** 已完成且不可继续。 */
  Completed = "completed",
  /** 已取消且不可继续。 */
  Cancelled = "cancelled",
}

/** CodingTask 的 Human 控制动作。 */
export enum CodingTaskControlAction {
  /** 暂停当前 CodingTask。 */
  Pause = "pause",
  /** 恢复已暂停的 CodingTask。 */
  Resume = "resume",
  /** 取消当前 CodingTask。 */
  Cancel = "cancel",
}

/** CodingTask Attempt 的封闭结果。 */
export enum CodingTaskAttemptOutcome {
  /** 实现尝试成功完成。 */
  Succeeded = "succeeded",
  /** 实现尝试明确失败。 */
  Failed = "failed",
  /** 实现结果无法可靠确认。 */
  OutcomeUnknown = "outcome_unknown",
}

/** CodingTask Verification 的封闭结果。 */
export enum CodingTaskVerificationOutcome {
  /** 当前 Attempt 的测试和验证 Oracle 全部通过。 */
  Passed = "passed",
  /** 验证明确失败。 */
  Failed = "failed",
  /** 验证过程或副作用结果无法可靠确认。 */
  OutcomeUnknown = "outcome_unknown",
}

/** Human 对 WaitingHuman CodingTask 的封闭处置动作。 */
export enum CodingTaskHumanResolution {
  /** 重新确认输入绑定后恢复实现。 */
  ResumeImplementation = "resume_implementation",
  /** 明确取消当前 CodingTask。 */
  Cancel = "cancel",
}

/** 复用 Workflow 已定义的失败分类。 */
export { FailureTaxonomy } from "#domain/workflow/enums/index.js";
