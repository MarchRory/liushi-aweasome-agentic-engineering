import { lstat, readFile, realpath, readdir, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import { isCodexPreflightAbsolutePath, sameCodexPreflightPath } from "../platform/index.js";
import {
  CODEX_PREFLIGHT_OWNER_FILE,
  CODEX_PREFLIGHT_OWNER_MARKER,
  CODEX_PREFLIGHT_TEMPORARY_ROOT_PREFIX,
} from "../constants/index.js";
import type { CodexPreflightTemporaryRootDescriptor } from "../contracts/index.js";
import { validateCodexAppServerPreflightRootDescriptor } from "../evidence/index.js";

/** 校验 descriptor 的基础形状，不把进程内状态作为 authority。 */
export function requireDescriptor(value: unknown): CodexPreflightTemporaryRootDescriptor {
  validateCodexAppServerPreflightRootDescriptor(value);
  return value;
}

/** 验证临时根及其 marker，返回经过规范化的 root。 */
export async function assertOwnedRoot(
  descriptor: CodexPreflightTemporaryRootDescriptor,
  trustedTempParent: string,
): Promise<string> {
  const checked = requireDescriptor(descriptor);
  const parent = await assertCanonicalDirectory(trustedTempParent, "trusted 临时父目录");
  const root = checked.root;
  const rootParent = resolve(dirname(root));
  if (
    !sameCodexPreflightPath(rootParent, parent) ||
    !basename(root).startsWith(CODEX_PREFLIGHT_TEMPORARY_ROOT_PREFIX)
  ) {
    throw new Error("预检临时根不是 trusted 临时父目录的直接固定前缀子目录。");
  }
  const rootStatus = await lstat(root);
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) {
    throw new Error("预检临时根必须是普通目录。");
  }
  if (!sameCodexPreflightPath(await realpath(root), root)) {
    throw new Error("预检临时根不是规范路径。");
  }
  const marker = join(root, CODEX_PREFLIGHT_OWNER_FILE);
  const markerStatus = await lstat(marker);
  if (markerStatus.isSymbolicLink() || !markerStatus.isFile()) {
    throw new Error("预检 ownership marker 必须是普通文件。");
  }
  if (!sameCodexPreflightPath(await realpath(marker), marker)) {
    throw new Error("预检 ownership marker 不是规范路径。");
  }
  const markerText = await readFile(marker, "utf8");
  const expected = `${CODEX_PREFLIGHT_OWNER_MARKER}\n${checked.ownerToken}\n`;
  if (markerText !== expected) {
    throw new Error("预检 ownership marker 与 descriptor 不匹配。");
  }
  return root;
}

/** 递归拒绝链接、重定向和特殊节点；只在完整验证后允许递归删除。 */
export async function assertOrdinaryTree(root: string): Promise<void> {
  const rootPath = resolve(root);
  const status = await lstat(rootPath);
  if (status.isSymbolicLink()) throw new Error("预检树包含符号链接或 junction。");
  if (!status.isDirectory() && !status.isFile()) throw new Error("预检树包含特殊节点。");
  if (!sameCodexPreflightPath(await realpath(rootPath), rootPath)) {
    throw new Error("预检树包含重定向路径。");
  }
  if (!status.isDirectory()) return;
  for (const entry of await readdir(rootPath)) {
    const child = join(rootPath, entry);
    if (relative(rootPath, child).startsWith("..")) {
      throw new Error("预检树包含路径穿越。");
    }
    await assertOrdinaryTree(child);
  }
}

/** 只在 ownership 已完整证明时删除创建失败的根。 */
export async function tryRemoveOwnedRoot(
  descriptor: CodexPreflightTemporaryRootDescriptor,
  trustedTempParent: string,
): Promise<void> {
  try {
    const root = await assertOwnedRoot(descriptor, trustedTempParent);
    await assertOrdinaryTree(root);
    await rm(root, { recursive: true, force: false });
  } catch {
    // 无法确认 ownership 或树形安全时保持现场，禁止危险删除。
  }
}

/** 校验并规范化绝对路径。 */
export function requireAbsolutePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new TypeError(`${label}必须是非空路径且不得包含 NUL。`);
  }
  if (!isCodexPreflightAbsolutePath(value)) {
    throw new TypeError(`${label}必须是绝对路径。`);
  }
  return resolve(value);
}

/** trusted parent 自身必须是普通、规范目录。 */
export async function assertTrustedTempParent(path: string): Promise<string> {
  return assertCanonicalDirectory(path, "trusted 临时父目录");
}

async function assertCanonicalDirectory(path: string, label: string): Promise<string> {
  const candidate = requireAbsolutePath(path, label);
  const status = await lstat(candidate);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${label}必须是普通目录。`);
  }
  if (!sameCodexPreflightPath(await realpath(candidate), candidate)) {
    throw new Error(`${label}必须是 canonical 目录。`);
  }
  return candidate;
}
