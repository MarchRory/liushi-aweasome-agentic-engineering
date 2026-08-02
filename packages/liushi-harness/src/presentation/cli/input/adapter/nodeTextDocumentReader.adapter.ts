import { readFile, stat } from "node:fs/promises";

import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { MAX_CLI_TEXT_DOCUMENT_BYTES } from "../constants/index.js";
import type { TextDocumentReader } from "../contracts/index.js";

/** 使用 Node 文件系统读取受大小限制的 UTF-8 文本。 */
export class NodeTextDocumentReaderAdapter implements TextDocumentReader {
  /** 读取普通文件并拒绝超限或包含 NUL 的内容。 */
  public async read(filePath: string): Promise<Result<string, HarnessError>> {
    try {
      const metadata = await stat(filePath);
      if (!metadata.isFile()) return failure(invalidTextFile(filePath, "path is not a file"));
      if (metadata.size > MAX_CLI_TEXT_DOCUMENT_BYTES) return failure(textTooLarge(filePath));

      const content = await readFile(filePath);
      if (content.byteLength > MAX_CLI_TEXT_DOCUMENT_BYTES) return failure(textTooLarge(filePath));
      const text = content.toString("utf8").replace(/^\uFEFF/u, "");
      return text.includes("\0")
        ? failure(invalidTextFile(filePath, "content contains NUL"))
        : success(text);
    } catch (error) {
      return failure(
        error instanceof HarnessError
          ? error
          : new HarnessError(
              HarnessErrorCode.IoFailure,
              "Unable to read text input document.",
              { filePath },
              error,
            ),
      );
    }
  }
}

function invalidTextFile(filePath: string, reason: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "Text input document is invalid.", {
    filePath,
    reason,
  });
}

function textTooLarge(filePath: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "Text input document exceeds the limit.", {
    filePath,
    maxBytes: String(MAX_CLI_TEXT_DOCUMENT_BYTES),
  });
}
