/** Task 当前所在的业务阶段。 */
export enum TaskPhase {
  /** 正在发现和校验项目上下文。 */
  Context = "context",
  /** 正在形成并确认 Requirement Contract。 */
  Requirements = "requirements",
  /** 正在形成 Plan、Risk 和 Gate。 */
  Planning = "planning",
  /** 正在批准的 Write Set 内实现。 */
  Implementation = "implementation",
  /** 正在运行验证并构建 Evidence。 */
  Verification = "verification",
  /** 已准备 Human Review 或交付。 */
  Review = "review",
  /** 正在生成 Learning Candidate。 */
  Learning = "learning",
  /** Task 已满足完成条件。 */
  Done = "done",
}

/** Task 当前是否可以继续运行。 */
export enum TaskRunState {
  /** Task 可以继续执行当前阶段。 */
  Running = "running",
  /** Task 正在等待 Human 决策。 */
  WaitingHuman = "waiting_human",
  /** Task 已安全暂停。 */
  Paused = "paused",
  /** Task 因不可自动恢复错误失败。 */
  Failed = "failed",
  /** Task 已被取消。 */
  Cancelled = "cancelled",
}
