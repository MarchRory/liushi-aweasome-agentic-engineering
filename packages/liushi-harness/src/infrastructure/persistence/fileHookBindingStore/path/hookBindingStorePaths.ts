import { resolve } from "node:path";

import {
  HOOK_BINDINGS_DIRECTORY_NAME,
  HOOK_BINDINGS_FILE_NAME,
  HOOK_BINDINGS_LOCK_FILE_NAME,
} from "../constants/index.js";

/** Hook Binding Store 的全部持久化路径。 */
export interface HookBindingStorePaths {
  /** Binding 文件所在目录。 */
  readonly directory: string;
  /** Binding JSON 文件。 */
  readonly recordFile: string;
  /** Binding 更新 Lock 文件。 */
  readonly lockFile: string;
}

/** 从 Runtime Store 根目录确定性解析 Hook Binding 路径。 */
export function resolveHookBindingStorePaths(storeRoot: string): HookBindingStorePaths {
  const directory = resolve(storeRoot, HOOK_BINDINGS_DIRECTORY_NAME);
  return {
    directory,
    recordFile: resolve(directory, HOOK_BINDINGS_FILE_NAME),
    lockFile: resolve(directory, HOOK_BINDINGS_LOCK_FILE_NAME),
  };
}
