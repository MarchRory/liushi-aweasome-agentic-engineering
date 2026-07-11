import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";

import {
  ProjectConfigDocumentParseStatus,
  type ProjectConfigDocumentParseResult,
} from "#application/index.js";

import { isSafeJsonCompatibleValue } from "./jsonCompatibleValue.js";

/** 使用 Microsoft jsonc-parser 严格解析 JSON/JSONC 配置。 */
export function parseJsoncProjectConfig(content: string): ProjectConfigDocumentParseResult {
  const errors: ParseError[] = [];
  const value = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: false,
  }) as unknown;
  if (errors.length > 0) {
    const firstError = errors[0];
    return {
      status: ProjectConfigDocumentParseStatus.Invalid,
      issue:
        firstError === undefined
          ? "jsonc:parse_error"
          : `jsonc:${printParseErrorCode(firstError.error)}`,
    };
  }
  if (!isSafeJsonCompatibleValue(value)) {
    return {
      status: ProjectConfigDocumentParseStatus.Invalid,
      issue: "jsonc:unsafe_or_non_json_value",
    };
  }
  return { status: ProjectConfigDocumentParseStatus.Parsed, value };
}
