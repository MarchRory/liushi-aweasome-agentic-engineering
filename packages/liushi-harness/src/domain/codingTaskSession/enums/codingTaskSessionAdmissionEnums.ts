/** Admission Control State 的当前生命周期与控制状态。 */
export enum CodingTaskSessionAdmissionStatus {
  /** 等待 Agent 提交新的 Action Admission。 */
  WaitingAgent = "waiting_agent",
  /** Session 正在关闭，不再接受新的 Admission。 */
  Closing = "closing",
  /** 某次提交结果无法确认，保留诊断状态并禁止继续 Admission。 */
  OutcomeUnknown = "outcome_unknown",
}
