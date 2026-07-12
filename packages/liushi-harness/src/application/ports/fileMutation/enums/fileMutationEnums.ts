/** 受控文件变更允许的封闭操作集合。 */
export enum FileMutationKind {
  /** 创建此前不存在的文本文件。 */
  Create = "create",
  /** 在前置内容摘要匹配时替换文本文件。 */
  Replace = "replace",
}
