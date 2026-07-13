/** CodingTask Application Command 的稳定类型。 */
export enum CodingTaskCommandType {
  /** 创建 CodingTask。 */
  Create = "coding_task.create",
  /** 开始 Attempt。 */
  StartAttempt = "coding_task.start_attempt",
  /** 完成 Attempt。 */
  FinishAttempt = "coding_task.finish_attempt",
  /** 原子提交实现并进入 Verification。 */
  SubmitImplementation = "coding_task.submit_implementation",
  /** 请求 Verification。 */
  RequestVerification = "coding_task.request_verification",
  /** 完成 Verification。 */
  FinishVerification = "coding_task.finish_verification",
  /** 应用 Human 控制。 */
  Control = "coding_task.control",
  /** 解决 Human 阻塞。 */
  ResolveHuman = "coding_task.resolve_human",
}
