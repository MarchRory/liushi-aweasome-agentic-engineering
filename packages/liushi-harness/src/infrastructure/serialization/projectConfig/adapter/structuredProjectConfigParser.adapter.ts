import {
  ProjectConfigDocumentFormat,
  type ParseProjectConfigDocumentInput,
  type ProjectConfigDocumentParseResult,
  type ProjectConfigParserPort,
} from "#application/index.js";

import { parseJsoncProjectConfig, parseYamlProjectConfig } from "../parser/index.js";

/** 不执行项目代码的 JSONC/YAML ProjectConfigParserPort Adapter。 */
export class StructuredProjectConfigParserAdapter implements ProjectConfigParserPort {
  /** 按显式格式路由到结构化纯文本 Parser。 */
  public parse(input: ParseProjectConfigDocumentInput): ProjectConfigDocumentParseResult {
    switch (input.format) {
      case ProjectConfigDocumentFormat.Jsonc:
        return parseJsoncProjectConfig(input.content);
      case ProjectConfigDocumentFormat.Yaml:
        return parseYamlProjectConfig(input.content);
    }
  }
}
