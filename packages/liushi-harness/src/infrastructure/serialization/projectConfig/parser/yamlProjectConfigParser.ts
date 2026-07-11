import { parseDocument } from "yaml";

import {
  ProjectConfigDocumentParseStatus,
  type ProjectConfigDocumentParseResult,
} from "#application/index.js";

import { isSafeJsonCompatibleValue } from "./jsonCompatibleValue.js";

/** 使用 YAML Document API 解析单文档并拒绝 Alias 扩张。 */
export function parseYamlProjectConfig(content: string): ProjectConfigDocumentParseResult {
  try {
    const document = parseDocument(content, {
      logLevel: "silent",
      version: "1.2",
    });
    if (document.errors.length > 0) {
      return {
        status: ProjectConfigDocumentParseStatus.Invalid,
        issue: "yaml:parse_error",
      };
    }
    const value = document.toJS({ maxAliasCount: 0 }) as unknown;
    if (!isSafeJsonCompatibleValue(value)) {
      return {
        status: ProjectConfigDocumentParseStatus.Invalid,
        issue: "yaml:unsafe_or_non_json_value",
      };
    }
    return { status: ProjectConfigDocumentParseStatus.Parsed, value };
  } catch {
    return {
      status: ProjectConfigDocumentParseStatus.Invalid,
      issue: "yaml:unsupported_alias_or_value",
    };
  }
}
