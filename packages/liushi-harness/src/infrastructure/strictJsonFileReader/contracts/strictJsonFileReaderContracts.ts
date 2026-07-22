import type { StrictJsonCanonicalPolicy } from "../enums/index.js";

/** 严格 JSON 文件读取输入。 */
export interface StrictJsonFileReadInput {
  /** 要读取且不得经过符号链接或目录联接的绝对路径。 */
  readonly filePath: string;
  /** 调用方精确预期的正整数字节数。 */
  readonly expectedByteLength: number;
  /** 调用方必须显式选择 canonical 字节策略。 */
  readonly canonicalPolicy: StrictJsonCanonicalPolicy;
}
