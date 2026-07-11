/** Human 对 DecisionRequest 的封闭决策结果。 */
export enum ApprovalDecision {
  /** Human 明确批准继续。 */
  Approved = "approved",
  /** Human 明确拒绝继续。 */
  Rejected = "rejected",
  /** Human 明确豁免某个 Gate 或风险要求。 */
  Waived = "waived",
}
