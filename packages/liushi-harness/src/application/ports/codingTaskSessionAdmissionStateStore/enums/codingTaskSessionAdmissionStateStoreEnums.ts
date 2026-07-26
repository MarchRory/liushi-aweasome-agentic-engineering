/** Admission State create 的严格幂等结果。 */
export enum CodingTaskSessionAdmissionStateCreateDisposition {
  /** 首次 create-only 发布成功。 */
  Created = "created",
  /** 已有字节内容完全一致，安全复用。 */
  Reused = "reused",
  /** 已有状态与输入不一致，拒绝覆盖。 */
  Conflict = "conflict",
}
