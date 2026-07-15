import type { HarnessError, Result } from "#common/index.js";
import type {
  ActualManagedFileState,
  ManagedManifestSnapshot,
} from "#domain/installation/index.js";

/** Repository 受管文件的只读现场检查边界。 */
export interface ManagedFileStateReader {
  /** 按当前平台规则生成受管相对路径的物理身份键。 */
  identifyPath(path: string): string;
  /** 校验 Repository root 并返回平台规范化后的真实绝对路径。 */
  resolveRoot(root: string): Promise<Result<string, HarnessError>>;
  /** 验证 root 并读取目标文件的现场状态，绝不写 Repository。 */
  readActual(root: string, path: string): Promise<Result<ActualManagedFileState, HarnessError>>;
  /** 严格读取 managed-files manifest；缺失视为空清单。 */
  readManifest(root: string): Promise<Result<ManagedManifestSnapshot, HarnessError>>;
}
