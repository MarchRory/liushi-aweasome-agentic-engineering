/** 不可变 Publication Bundle 文件的封闭写入处置。 */
export enum ExecutorCompatibilityPublicationWriteDisposition {
  /** 本次首次创建完整发布文件。 */
  Created = "created",
  /** 目标已存在完全相同的规范字节，复用既有文件。 */
  IdempotentReuse = "idempotent_reuse",
}
