import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export function requireAbsolutePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !isAbsolute(value)
  ) {
    throw new Error(`${label} 必须是无 NUL 的绝对路径。`);
  }
  return resolve(value);
}

export async function requireExistingFile(value, label) {
  const path = requireAbsolutePath(value, label);
  await rejectLink(path, label);
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`${label} 必须是普通文件。`);
  return realpath(path);
}

export async function requireExistingDirectory(value, label) {
  const path = requireAbsolutePath(value, label);
  await rejectLink(path, label);
  const metadata = await stat(path);
  if (!metadata.isDirectory()) throw new Error(`${label} 必须是普通目录。`);
  return realpath(path);
}

export async function requireNonexistentDirectory(value, label) {
  const path = requireAbsolutePath(value, label);
  try {
    await lstat(path);
    throw new Error(`${label} 必须不存在。`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const parent = await requireExistingDirectory(dirname(path), `${label} 父目录`);
  if (relative(parent, path).startsWith("..")) throw new Error(`${label} 不在父目录内。`);
  return path;
}

export async function assertPathInside(path, parent, label) {
  const actual = resolve(path);
  const base = resolve(parent);
  const relation = relative(base, actual);
  if (
    relation === "" ||
    relation.startsWith("..") ||
    relation.includes(":") ||
    relation.startsWith("/")
  ) {
    throw new Error(`${label} 必须位于受信根目录内。`);
  }
  return actual;
}

export async function rejectLink(path, label) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink()) throw new Error(`${label} 不得是符号链接或 junction。`);
}

export async function assertOrdinaryTree(paths) {
  for (const [path, label] of paths) await rejectLink(path, label);
}
