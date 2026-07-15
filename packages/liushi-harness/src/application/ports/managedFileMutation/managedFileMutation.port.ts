import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { ActualManagedFileState } from "#domain/installation/index.js";

/** 带现场前置条件的单文件原子替换输入。 */
export interface ReplaceManagedFileInput {
  /** 经 Reader 验证的 Repository 真实根目录。 */
  readonly root: string;
  /** 受限的 Repository 相对路径。 */
  readonly path: string;
  /** 写入前必须仍然成立的文件现场状态。 */
  readonly expected: ActualManagedFileState;
  /** 待写入的完整 UTF-8 内容。 */
  readonly content: string;
  /** 待写入内容的预先计算摘要。 */
  readonly digest: ContentDigest;
}

/** Repository 内受管文件的受控原子变更边界。 */
export interface ManagedFileMutationPort {
  /** 仅当前置状态精确匹配时原子替换文件，并返回已验证后置状态。 */
  replace(input: ReplaceManagedFileInput): Promise<Result<ActualManagedFileState, HarnessError>>;
}
