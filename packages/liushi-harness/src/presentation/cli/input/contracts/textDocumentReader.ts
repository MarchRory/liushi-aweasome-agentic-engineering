import type { HarnessError, Result } from "#common/index.js";

/** CLI 读取不受信任文本文件的可替换边界。 */
export interface TextDocumentReader {
  /** 读取、限制大小并解码一个 UTF-8 文本文件。 */
  read(filePath: string): Promise<Result<string, HarnessError>>;
}
