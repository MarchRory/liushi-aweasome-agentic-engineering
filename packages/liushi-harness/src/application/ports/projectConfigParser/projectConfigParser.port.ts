import type {
  ParseProjectConfigDocumentInput,
  ProjectConfigDocumentParseResult,
} from "./projectConfigParser.contracts.js";

/** Application 安全解析 JSONC 与 YAML 配置的 Port。 */
export interface ProjectConfigParserPort {
  /** 解析纯文本但不 import、require 或执行配置代码。 */
  parse(input: ParseProjectConfigDocumentInput): ProjectConfigDocumentParseResult;
}
