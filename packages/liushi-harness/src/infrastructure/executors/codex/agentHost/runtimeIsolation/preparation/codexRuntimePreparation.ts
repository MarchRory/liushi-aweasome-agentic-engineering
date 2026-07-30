import { constants as fileSystemConstants } from "node:fs";
import {
  chmod as defaultChmod,
  copyFile as defaultCopyFile,
  lstat as defaultLstat,
  mkdir as defaultMkdir,
  realpath as defaultRealpath,
  readdir as defaultReaddir,
  rm as defaultRm,
  rmdir as defaultRmdir,
  stat as defaultStat,
} from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";

import {
  assertCodexAgentAuthCopyIsolated,
  captureCodexAgentAuthSourceSnapshot,
} from "../auth/index.js";
import { removeCodexAgentRuntime } from "../cleanup/index.js";
import type {
  CodexAgentRuntimeIsolationOverrides,
  CodexAgentRuntimePlan,
  PreparedCodexAgentRuntime,
  RuntimeFileSystem,
} from "../contracts/index.js";
import { createCodexAgentEnvironment } from "../environment/index.js";
import { sameRuntimePath, validateCodexAgentRuntimePlan } from "../plan/index.js";
import { secureCodexAgentRuntimeDirectory } from "../platform/index.js";

/** 创建隔离 Runtime；任一步失败时清理本次已创建根目录并保留 cleanupError。 */
export async function prepareCodexAgentRuntime(
  plan: CodexAgentRuntimePlan,
  overrides: CodexAgentRuntimeIsolationOverrides = {},
): Promise<PreparedCodexAgentRuntime> {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  const fs = createFileSystem(overrides);
  const runProcess = overrides.runProcess ?? overrides.processRunner;
  const sourceEnv = overrides.sourceEnv ?? overrides.environment ?? overrides.env ?? process.env;
  let rootCreated = false;

  try {
    await assertCanonicalCodexHomeSource(validatedPlan, fs);
    const credentialSourceSnapshot = await captureCodexAgentAuthSourceSnapshot(validatedPlan, {
      fs,
    });
    await assertPathAbsent(validatedPlan.root, "Codex Agent Runtime 根目录", fs);
    await createDirectory(dirname(dirname(validatedPlan.root)), fs);
    await createDirectory(dirname(validatedPlan.root), fs);
    await assertPathAbsent(validatedPlan.root, "Codex Agent Runtime 根目录", fs);
    await fs.mkdir(validatedPlan.root, { mode: 0o700 });
    rootCreated = true;
    await assertOrdinaryDirectory(validatedPlan.root, "Codex Agent Runtime 根目录", fs);

    for (const directory of [
      validatedPlan.codexHome,
      validatedPlan.sqliteHome,
      validatedPlan.tempHome,
      validatedPlan.profileHome,
    ]) {
      await fs.mkdir(directory, { mode: 0o700 });
      await assertOrdinaryDirectory(directory, "Codex Agent Runtime 子目录", fs);
    }

    await secureCodexAgentRuntimeDirectory(validatedPlan.root, {
      chmod: (path, mode) => fs.chmod(path, mode),
      ...(overrides.platform === undefined ? {} : { platform: overrides.platform }),
      ...(runProcess === undefined ? {} : { runProcess }),
    });
    await fs.copyFile(
      validatedPlan.authSourceFile,
      validatedPlan.authFile,
      fileSystemConstants.COPYFILE_EXCL,
    );
    await fs.chmod(validatedPlan.authFile, 0o600);
    await assertCodexAgentAuthCopyIsolated(validatedPlan, credentialSourceSnapshot, { fs });

    return {
      plan: validatedPlan,
      env: createCodexAgentEnvironment(sourceEnv, validatedPlan),
      credentialSourceSnapshot,
    };
  } catch (error) {
    if (rootCreated) {
      try {
        await removeCodexAgentRuntime(validatedPlan, { fs });
      } catch (cleanupError) {
        attachCleanupError(error, cleanupError);
      }
    }
    throw error;
  }
}

function createFileSystem(overrides: CodexAgentRuntimeIsolationOverrides): RuntimeFileSystem {
  const supplied = overrides.fs ?? overrides;
  return {
    chmod: supplied.chmod ?? ((path, mode) => defaultChmod(path, mode)),
    copyFile:
      supplied.copyFile ??
      ((source, destination, mode) => defaultCopyFile(source, destination, mode)),
    lstat: supplied.lstat ?? ((path) => defaultLstat(path)),
    mkdir: supplied.mkdir ?? ((path, options) => defaultMkdir(path, options)),
    realpath: supplied.realpath ?? ((path) => defaultRealpath(path)),
    readdir: supplied.readdir ?? ((path) => defaultReaddir(path)),
    rm: supplied.rm ?? ((path, options) => defaultRm(path, options)),
    rmdir: supplied.rmdir ?? ((path) => defaultRmdir(path)),
    stat: supplied.stat ?? ((path) => defaultStat(path)),
  };
}

async function assertCanonicalCodexHomeSource(
  plan: CodexAgentRuntimePlan,
  fs: RuntimeFileSystem,
): Promise<void> {
  await assertOrdinaryDirectory(plan.codexHomeSource, "codexHomeSource", fs);
  const sourceParent = dirname(plan.codexHomeSource);
  await assertOrdinaryDirectory(sourceParent, "codexHomeSource 父目录", fs);
  const canonical = await fs.realpath(plan.codexHomeSource);
  if (!sameRuntimePath(plan.codexHomeSource, canonical)) {
    throw new Error("codexHomeSource 必须是 canonical 路径，且不得经过符号链接或 junction。");
  }
  const [sourceMetadata, parentMetadata] = await Promise.all([
    fs.stat(plan.codexHomeSource),
    fs.stat(sourceParent),
  ]);
  if (sourceMetadata.dev !== parentMetadata.dev) {
    throw new Error("codexHomeSource 与其父目录必须位于同一卷。");
  }
}

async function assertOrdinaryDirectory(
  path: string,
  label: string,
  fs: RuntimeFileSystem,
): Promise<void> {
  const linkMetadata = await fs.lstat(path);
  if (linkMetadata.isSymbolicLink() || !linkMetadata.isDirectory()) {
    throw new Error(`${label} 必须是普通目录且不得是符号链接或 junction。`);
  }
  const canonical = await fs.realpath(path);
  if (!sameRuntimePath(path, canonical)) {
    throw new Error(`${label} 的 realpath 发生跳转。`);
  }
}

async function assertPathAbsent(path: string, label: string, fs: RuntimeFileSystem): Promise<void> {
  try {
    await fs.lstat(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return;
    }
    throw error;
  }

  throw new Error(`${label} 必须不存在。`);
}

async function createDirectory(path: string, fs: RuntimeFileSystem): Promise<void> {
  try {
    await fs.mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (!hasErrorCode(error, "EEXIST")) {
      throw error;
    }
  }
  await assertOrdinaryDirectory(path, "Codex Agent Runtime 父目录", fs);
}

function attachCleanupError(error: unknown, cleanupError: unknown): void {
  if ((typeof error === "object" && error !== null) || typeof error === "function") {
    Object.assign(error, { cleanupError });
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
