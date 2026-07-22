/** 严格 JSON Reader 的 canonical 字节策略。 */
export enum StrictJsonCanonicalPolicy {
  /** 只要求严格 UTF-8 JSON 语法。 */
  NotRequired = "not_required",
  /** 要求 RFC 8785 JSON 加单一末尾换行。 */
  Required = "required",
}
