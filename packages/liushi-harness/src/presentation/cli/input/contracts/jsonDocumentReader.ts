import type { HarnessError, Result } from "#common/index.js";

/** CLI 读取不受信任 JSON 文档的可替换边界。 */
export interface JsonDocumentReader {
  /** 读取、限制大小并解析一个 JSON 文档。 */
  read(filePath: string): Promise<Result<unknown, HarnessError>>;
}
