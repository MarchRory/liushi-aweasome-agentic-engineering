import { readFile, stat } from "node:fs/promises";

import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { MAX_CLI_JSON_DOCUMENT_BYTES } from "../constants/index.js";
import type { JsonDocumentReader } from "../contracts/index.js";

/** 使用 Node 文件系统读取受大小限制的 CLI JSON 文档。 */
export class NodeJsonDocumentReaderAdapter implements JsonDocumentReader {
  /** 读取普通文件并返回解析后的未知 JSON 值。 */
  public async read(filePath: string): Promise<Result<unknown, HarnessError>> {
    try {
      const metadata = await stat(filePath);
      if (!metadata.isFile()) {
        return failure(
          new HarnessError(HarnessErrorCode.InvalidInput, "JSON input path is not a file.", {
            filePath,
          }),
        );
      }
      if (metadata.size > MAX_CLI_JSON_DOCUMENT_BYTES) {
        return documentTooLarge(filePath);
      }

      const content = await readFile(filePath);
      if (content.byteLength > MAX_CLI_JSON_DOCUMENT_BYTES) {
        return documentTooLarge(filePath);
      }
      try {
        return success(JSON.parse(content.toString("utf8")) as unknown);
      } catch (error) {
        return failure(
          new HarnessError(
            HarnessErrorCode.InvalidInput,
            "JSON input document is invalid.",
            { filePath },
            error,
          ),
        );
      }
    } catch (error) {
      return failure(
        error instanceof HarnessError
          ? error
          : new HarnessError(
              HarnessErrorCode.IoFailure,
              "Unable to read JSON input document.",
              { filePath },
              error,
            ),
      );
    }
  }
}

function documentTooLarge(filePath: string): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.InvalidInput, "JSON input document exceeds the size limit.", {
      filePath,
      maxBytes: String(MAX_CLI_JSON_DOCUMENT_BYTES),
    }),
  );
}
