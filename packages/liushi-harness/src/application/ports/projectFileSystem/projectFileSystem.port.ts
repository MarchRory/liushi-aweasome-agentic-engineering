import type { HarnessError, Result } from "#common/index.js";

import type {
  InspectProjectRepositoryInput,
  ProjectRepositoryFileInventory,
  ProjectTextFileReadResult,
  ReadProjectTextFilesInput,
} from "./projectFileSystem.contracts.js";

/** Application 只读检查 Repository 文件树和配置文本的 Port。 */
export interface ProjectFileSystemPort {
  /** 枚举文件树，不跟随 Symlink/Junction，也不返回绝对路径。 */
  inspectRepository(
    input: InspectProjectRepositoryInput,
  ): Promise<Result<ProjectRepositoryFileInventory, HarnessError>>;

  /** 对已选配置文件执行边界与 UTF-8 校验后读取。 */
  readTextFiles(
    input: ReadProjectTextFilesInput,
  ): Promise<Result<readonly ProjectTextFileReadResult[], HarnessError>>;
}
