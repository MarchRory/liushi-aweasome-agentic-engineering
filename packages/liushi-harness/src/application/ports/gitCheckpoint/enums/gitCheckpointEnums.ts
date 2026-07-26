/** Git Checkpoint 只读状态检查的闭合结果。 */
export enum GitCheckpointInspectionStatus {
  /** 已证明当前不存在 Checkpoint，可以继续提交前复验。 */
  Absent = "absent",
  /** 已证明存在满足基础后置条件的 Checkpoint。 */
  Present = "present",
  /** 无法证明 Checkpoint 存在或不存在，禁止继续副作用。 */
  Unknown = "unknown",
}
