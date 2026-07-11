import { access, readdir } from "node:fs/promises";

/** 判断路径是否存在，并保留非 ENOENT 文件系统错误。 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/** 返回 Task Store 目录中的直接条目名称。 */
export async function listTaskStoreEntries(taskDirectory: string): Promise<string[]> {
  return readdir(taskDirectory);
}

/** 返回 Workspace tasks 目录中的直接条目；目录不存在时视为空。 */
export async function listWorkspaceTaskEntries(tasksDirectory: string): Promise<string[]> {
  try {
    return await readdir(tasksDirectory);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
