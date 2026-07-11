/** Project FileSystem Port 读取文本文件的结果。 */
export enum ProjectTextFileReadStatus {
  /** 文件在预算内作为严格 UTF-8 读取。 */
  Read = "read",
  /** 文件超过单文件或总字节预算。 */
  Oversized = "oversized",
  /** 文件不是有效 UTF-8。 */
  InvalidEncoding = "invalid_encoding",
  /** 文件在枚举后消失或变得不可读取。 */
  Unavailable = "unavailable",
  /** 文件解析后位于 Link 或 Repository Root 之外。 */
  UnsafePath = "unsafe_path",
}
