/** Closeout State create-only 的严格结果分类。 */
export enum CodingTaskSessionCloseoutStateCreateDisposition {
  /** 首次发布初始 State。 */
  Created = "created",
  /** 已有 State 属于同一不可变请求身份，可从现有进度恢复。 */
  Reused = "reused",
  /** 已有 State 属于不同请求身份，拒绝覆盖。 */
  Conflict = "conflict",
}
