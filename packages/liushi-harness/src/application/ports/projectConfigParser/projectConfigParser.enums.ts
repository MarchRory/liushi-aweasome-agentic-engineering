/** Project 配置内容允许使用的结构化格式。 */
export enum ProjectConfigDocumentFormat {
  /** 支持注释与尾逗号的 JSONC。 */
  Jsonc = "jsonc",
  /** YAML 1.2 单文档。 */
  Yaml = "yaml",
}

/** Project Config Parser 的结果状态。 */
export enum ProjectConfigDocumentParseStatus {
  /** 配置已解析为 JSON-compatible Value。 */
  Parsed = "parsed",
  /** 配置包含语法、Alias 或不支持的数据。 */
  Invalid = "invalid",
}
