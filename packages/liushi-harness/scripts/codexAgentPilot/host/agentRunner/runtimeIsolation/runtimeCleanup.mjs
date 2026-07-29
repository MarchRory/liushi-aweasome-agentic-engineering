import {
  lstat as defaultLstat,
  readdir as defaultReaddir,
  realpath as defaultRealpath,
  rm as defaultRm,
  rmdir as defaultRmdir,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  digestHexFromSourceStateDigest,
  runtimeDedicatedRootForPlan,
  runtimeRootParentForPlan,
  sameRuntimePath,
  validateCodexAgentRuntimePlan,
} from "./runtimePlan.mjs";

export async function removeCodexAgentRuntime(plan, overrides = {}) {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  const fs = createFileSystem(overrides);
  const digestHex = digestHexFromSourceStateDigest(validatedPlan.sourceStateDigest);
  const rootParent = runtimeRootParentForPlan(validatedPlan);
  const dedicatedRoot = runtimeDedicatedRootForPlan(validatedPlan);

  if (!sameRuntimePath(validatedPlan.root, join(rootParent, digestHex))) {
    throw new Error("Codex Agent Runtime root 不匹配本次 sourceStateDigest。");
  }
  if (basename(validatedPlan.root) !== digestHex) {
    throw new Error("Codex Agent Runtime root basename 不匹配 sourceStateDigest。");
  }
  if (!sameRuntimePath(dirname(rootParent), dedicatedRoot)) {
    throw new Error("Codex Agent Runtime 专用根不匹配。");
  }

  if (!(await pathExists(validatedPlan.root, fs))) {
    return { plan: validatedPlan, removed: false };
  }

  await assertCanonicalDirectory(validatedPlan.root, "Codex Agent Runtime root", fs);
  await assertOrdinaryTree(validatedPlan.root, fs);
  await fs.rm(validatedPlan.root, { recursive: true, force: false });
  if (await pathExists(validatedPlan.root, fs)) {
    throw new Error("Codex Agent Runtime 删除后仍然存在。");
  }

  await removeEmptyDirectory(rootParent, "Codex Agent Runtime task parent", fs);
  await removeEmptyDirectory(dedicatedRoot, "Codex Agent Runtime dedicated parent", fs);
  return { plan: validatedPlan, removed: true };
}

async function assertCanonicalDirectory(path, label, fs) {
  const metadata = await fs.lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} 必须是普通目录且不得是符号链接或 junction。`);
  }
  const canonical = await fs.realpath(path);
  if (!sameRuntimePath(path, canonical)) throw new Error(`${label} realpath 发生跳转。`);
}

async function assertOrdinaryTree(path, fs) {
  const metadata = await fs.lstat(path);
  if (metadata.isSymbolicLink()) {
    throw new Error("Codex Agent Runtime 树不得包含符号链接或 junction。");
  }
  if (metadata.isDirectory()) {
    for (const entry of await fs.readdir(path)) {
      await assertOrdinaryTree(join(path, entry), fs);
    }
    return;
  }
  if (!metadata.isFile()) throw new Error("Codex Agent Runtime 树包含非普通文件节点。");
}

async function removeEmptyDirectory(path, label, fs) {
  let metadata;
  try {
    metadata = await fs.lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} 不得是符号链接或非目录。`);
  }
  const canonical = await fs.realpath(path);
  if (!sameRuntimePath(path, canonical)) throw new Error(`${label} realpath 发生跳转。`);
  if ((await fs.readdir(path)).length !== 0) return;
  try {
    await fs.rmdir(path);
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "ENOTEMPTY" && error?.code !== "EEXIST") {
      throw error;
    }
  }
}

async function pathExists(path, fs) {
  try {
    await fs.lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function createFileSystem(overrides) {
  const supplied = overrides.fs ?? overrides;
  return {
    lstat: supplied.lstat ?? defaultLstat,
    readdir: supplied.readdir ?? defaultReaddir,
    realpath: supplied.realpath ?? defaultRealpath,
    rm: supplied.rm ?? defaultRm,
    rmdir: supplied.rmdir ?? defaultRmdir,
  };
}
