/** Action Journal Mutation 的持久化处置。 */
export enum ActionJournalMutationDisposition {
  /** 新 Record 已追加到权威 Journal。 */
  Appended = "appended",
  /** 相同幂等意图已经存在，本次没有重复写入。 */
  IdempotentReuse = "idempotent_reuse",
}
