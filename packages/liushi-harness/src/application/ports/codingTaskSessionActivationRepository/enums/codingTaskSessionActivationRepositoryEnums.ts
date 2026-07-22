/** Activation Record create 的稳定结果分类。 */
export enum CodingTaskSessionActivationDisposition {
  /** 本次调用首次原子创建了 Record。 */
  Created = "created",
  /** 已存在且规范字段完全一致，安全复用已有 Record。 */
  Reused = "reused",
  /** 已存在相同 Session ID，但规范字段不同。 */
  Conflict = "conflict",
}
