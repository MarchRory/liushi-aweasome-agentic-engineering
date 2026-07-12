/** EvidenceBundle 不可变写入的闭合结果。 */
export enum EvidenceBundleWriteDisposition {
  /** 本次首次持久化 Bundle。 */
  Persisted = "persisted",
  /** 已存在完全相同的 Bundle，复用既有记录。 */
  IdempotentReuse = "idempotent_reuse",
}
