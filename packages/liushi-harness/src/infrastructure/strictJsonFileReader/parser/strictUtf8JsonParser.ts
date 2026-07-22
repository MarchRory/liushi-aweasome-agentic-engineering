import { visit, type ParseError } from "jsonc-parser";

import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import { UTF8_BYTE_ORDER_MARK } from "../constants/index.js";
import { StrictJsonCanonicalPolicy } from "../enums/index.js";

/** 严格解析 UTF-8 JSON，并可选要求 RFC 8785 字节规范。 */
export function parseStrictUtf8Json(
  content: Uint8Array,
  canonicalPolicy: StrictJsonCanonicalPolicy,
): Result<unknown, HarnessError> {
  if (hasUtf8ByteOrderMark(content)) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "严格 JSON 文件不得包含 UTF-8 BOM。"),
    );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch (error) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "JSON 文件不是合法 UTF-8。", {}, error),
    );
  }
  const errors: ParseError[] = [];
  let duplicateKeyCount = 0;
  const objectKeys: Set<string>[] = [];
  visit(
    text,
    {
      onObjectBegin: () => {
        objectKeys.push(new Set<string>());
      },
      onObjectProperty: (name) => {
        const keys = objectKeys[objectKeys.length - 1];
        if (keys?.has(name)) {
          duplicateKeyCount += 1;
        }
        keys?.add(name);
      },
      onObjectEnd: () => {
        objectKeys.pop();
      },
      onError: (error, offset, length) => {
        errors.push({ error, offset, length });
      },
    },
    { allowTrailingComma: false, disallowComments: true },
  );
  if (errors.length > 0) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "JSON 语法、注释或尾逗号非法。", {
        parseErrorCount: String(errors.length),
      }),
    );
  }
  if (duplicateKeyCount > 0) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "JSON 对象包含重复键。", {
        duplicateKeyCount: String(duplicateKeyCount),
      }),
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "JSON 语法非法。", {}, error));
  }
  if (canonicalPolicy === StrictJsonCanonicalPolicy.Required) {
    try {
      if (text !== `${canonicalizeJson(value)}\n`) {
        return failure(
          new HarnessError(
            HarnessErrorCode.InvalidInput,
            "JSON 文件不是 RFC 8785 规范 JSON 加单一末尾换行。",
          ),
        );
      }
    } catch (error) {
      return failure(
        error instanceof HarnessError
          ? error
          : new HarnessError(HarnessErrorCode.InvalidInput, "JSON 无法规范化。", {}, error),
      );
    }
  }
  return success(value);
}

function hasUtf8ByteOrderMark(content: Uint8Array): boolean {
  return UTF8_BYTE_ORDER_MARK.every((byte, index) => content[index] === byte);
}
