/** CodingTask 领域事件类型。 */
export enum CodingTaskEventType {
  /** 创建 CodingTask。 */
  CodingTaskCreated = "coding_task_created",
  /** 开始一次实现尝试。 */
  AttemptStarted = "attempt_started",
  /** 完成一次实现尝试。 */
  AttemptFinished = "attempt_finished",
  /** 原子提交实现结果并进入验证阶段。 */
  ImplementationSubmitted = "implementation_submitted",
  /** 请求进入验证阶段。 */
  VerificationRequested = "verification_requested",
  /** 接纳一次 Verification 结果。 */
  VerificationFinished = "verification_finished",
  /** 应用 Human 控制。 */
  HumanControlApplied = "human_control_applied",
  /** 应用 Human 对阻塞 Attempt 的处置。 */
  HumanResolutionApplied = "human_resolution_applied",
}
