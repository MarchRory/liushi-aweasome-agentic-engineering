/** Executor Compatibility 不可变记录的封闭写入处置。 */
export enum ExecutorCompatibilityWriteDisposition {
  /** 本次首次持久化不可变记录。 */
  Persisted = "persisted",
  /** 已存在内容完全相同的不可变记录。 */
  IdempotentReuse = "idempotent_reuse",
}
