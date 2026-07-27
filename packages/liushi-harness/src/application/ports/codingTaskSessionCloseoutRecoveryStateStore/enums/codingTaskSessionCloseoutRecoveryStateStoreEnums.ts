/** Recovery State create-only 的结果分类。 */
export enum CodingTaskSessionCloseoutRecoveryStateCreateDisposition {
  /** 首次发布 Approved v0。 */
  Created = "created",
  /** 请求身份相同，返回已有 Recovery Process 进度。 */
  Reused = "reused",
  /** 请求身份不同，拒绝覆盖已有 Recovery Process。 */
  Conflict = "conflict",
}
