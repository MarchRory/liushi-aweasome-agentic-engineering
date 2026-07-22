/** 不可变文件写入处置。 */
export enum ImmutableFileWriteDisposition {
  /** 首次创建并发布文件。 */
  Created = "created",
  /** 目标已存在且字节完全一致。 */
  IdempotentReuse = "idempotent_reuse",
}

/** 不可变文件 primitive 的父目录处理策略。 */
export enum ImmutableFileParentDirectoryPolicy {
  /** 兼容 Publication Writer，递归创建缺失父目录。 */
  CreateRecursively = "create_recursively",
  /** 要求父目录已经存在，禁止 primitive 创建目录。 */
  RequireExisting = "require_existing",
}
