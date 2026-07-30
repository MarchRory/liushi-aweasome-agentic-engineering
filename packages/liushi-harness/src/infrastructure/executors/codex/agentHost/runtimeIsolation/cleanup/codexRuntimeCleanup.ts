import {
  lstat as defaultLstat,
  readdir as defaultReaddir,
  realpath as defaultRealpath,
  rm as defaultRm,
  rmdir as defaultRmdir,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type {
  CodexAgentRuntimeCleanupOverrides,
  CodexAgentRuntimePlan,
  RemovedCodexAgentRuntime,
  RuntimeCleanupFileSystem,
} from "../contracts/index.js";
import {
  digestHexFromSourceStateDigest,
  runtimeDedicatedRootForPlan,
  runtimeRootParentForPlan,
  sameRuntimePath,
  validateCodexAgentRuntimePlan,
} from "../plan/index.js";

/** 仅删除摘要匹配的精确 Runtime，并在最后清理空父目录。 */
export async function removeCodexAgentRuntime(
  plan: CodexAgentRuntimePlan,
  overrides: CodexAgentRuntimeCleanupOverrides = {},
): Promise<RemovedCodexAgentRuntime> {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  const fs = createFileSystem(overrides);
  const digestHex = digestHexFromSourceStateDigest(validatedPlan.sourceStateDigest);
  const rootParent = runtimeRootParentForPlan(validatedPlan);
  const dedicatedRoot = runtimeDedicatedRootForPlan(validatedPlan);

  if (!sameRuntimePath(validatedPlan.root, join(rootParent, digestHex))) {
    throw new Error("Codex Agent Runtime 根目录不匹配本次源状态摘要。");
  }
  if (basename(validatedPlan.root) !== digestHex) {
    throw new Error("Codex Agent Runtime 根目录名称不匹配本次源状态摘要。");
  }
  if (!sameRuntimePath(dirname(rootParent), dedicatedRoot)) {
    throw new Error("Codex Agent Runtime 专用根目录不匹配。");
  }

  if (!(await pathExists(validatedPlan.root, fs))) {
    return { plan: validatedPlan, removed: false };
  }

  await assertCanonicalDirectory(validatedPlan.root, "Codex Agent Runtime 根目录", fs);
  await assertOrdinaryTree(validatedPlan.root, fs);
  await fs.rm(validatedPlan.root, { recursive: true, force: false });
  if (await pathExists(validatedPlan.root, fs)) {
    throw new Error("Codex Agent Runtime 删除后仍然存在。");
  }

  await removeEmptyDirectory(rootParent, "Codex Agent Runtime 任务父目录", fs);
  await removeEmptyDirectory(dedicatedRoot, "Codex Agent Runtime 专用父目录", fs);

  return { plan: validatedPlan, removed: true };
}

function createFileSystem(overrides: CodexAgentRuntimeCleanupOverrides): RuntimeCleanupFileSystem {
  const supplied = overrides.fs ?? overrides;
  return {
    lstat: supplied.lstat ?? ((path) => defaultLstat(path)),
    readdir: supplied.readdir ?? ((path) => defaultReaddir(path)),
    realpath: supplied.realpath ?? ((path) => defaultRealpath(path)),
    rm: supplied.rm ?? ((path, options) => defaultRm(path, options)),
    rmdir: supplied.rmdir ?? ((path) => defaultRmdir(path)),
  };
}

async function assertCanonicalDirectory(
  path: string,
  label: string,
  fs: RuntimeCleanupFileSystem,
): Promise<void> {
  const metadata = await fs.lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} 必须是普通目录且不得是符号链接或 junction。`);
  }
  const canonical = await fs.realpath(path);
  if (!sameRuntimePath(path, canonical)) {
    throw new Error(`${label} 的 realpath 发生跳转。`);
  }
}

async function assertOrdinaryTree(path: string, fs: RuntimeCleanupFileSystem): Promise<void> {
  const metadata = await fs.lstat(path);
  if (metadata.isSymbolicLink()) {
    throw new Error("Codex Agent Runtime 目录树不得包含符号链接或 junction。");
  }
  if (metadata.isDirectory()) {
    for (const entry of await fs.readdir(path)) {
      await assertOrdinaryTree(join(path, entry), fs);
    }
    return;
  }
  if (!metadata.isFile()) {
    throw new Error("Codex Agent Runtime 目录树包含非普通文件节点。");
  }
}

async function removeEmptyDirectory(
  path: string,
  label: string,
  fs: RuntimeCleanupFileSystem,
): Promise<void> {
  let metadata;
  try {
    metadata = await fs.lstat(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return;
    }
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} 不得是符号链接或非目录节点。`);
  }
  const canonical = await fs.realpath(path);
  if (!sameRuntimePath(path, canonical)) {
    throw new Error(`${label} 的 realpath 发生跳转。`);
  }
  if ((await fs.readdir(path)).length !== 0) {
    return;
  }

  try {
    await fs.rmdir(path);
  } catch (error) {
    if (
      !hasErrorCode(error, "ENOENT") &&
      !hasErrorCode(error, "ENOTEMPTY") &&
      !hasErrorCode(error, "EEXIST")
    ) {
      throw error;
    }
  }
}

async function pathExists(path: string, fs: RuntimeCleanupFileSystem): Promise<boolean> {
  try {
    await fs.lstat(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
