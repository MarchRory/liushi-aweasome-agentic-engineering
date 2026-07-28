/** Session Delivery Submission 对当前 CodingTask 的封闭处理分类。 */
export enum CodingTaskSessionDeliverySubmissionDisposition {
  /** 需要追加唯一的 ImplementationSubmitted Event。 */
  SubmitRequired = "submit_required",
  /** CodingTask 已精确接纳同一个 Checkpoint，只需返回当前版本。 */
  AlreadySubmitted = "already_submitted",
}
