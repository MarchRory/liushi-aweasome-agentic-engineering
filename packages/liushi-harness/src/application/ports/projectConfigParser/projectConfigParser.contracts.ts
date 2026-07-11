import type {
  ProjectConfigDocumentFormat,
  ProjectConfigDocumentParseStatus,
} from "./projectConfigParser.enums.js";

/** Project Config Parser 的单文档输入。 */
export interface ParseProjectConfigDocumentInput {
  /** 配置文件的结构化格式。 */
  format: ProjectConfigDocumentFormat;
  /** 已由 FileSystem Port 验证的 UTF-8 文本。 */
  content: string;
}

/** Project Config Parser 的确定性结果。 */
export interface ProjectConfigDocumentParseResult {
  /** 解析是否成功。 */
  status: ProjectConfigDocumentParseStatus;
  /** Parsed 状态下的 JSON-compatible Value。 */
  value?: unknown;
  /** Invalid 状态下不含原文的稳定问题摘要。 */
  issue?: string;
}
