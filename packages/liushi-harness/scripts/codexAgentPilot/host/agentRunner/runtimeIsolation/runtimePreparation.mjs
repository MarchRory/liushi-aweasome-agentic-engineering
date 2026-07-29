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
import { constants as fileSystemConstants } from "node:fs";
import process from "node:process";
import { dirname } from "node:path";

import { runProcess as defaultRunProcess } from "../../../../common/process/index.mjs";
import { createCodexAgentEnvironment } from "./runtimeEnvironment.mjs";
import { removeCodexAgentRuntime } from "./runtimeCleanup.mjs";
import { sameRuntimePath, validateCodexAgentRuntimePlan } from "./runtimePlan.mjs";
import { secureCodexAgentRuntimeDirectory } from "./platform/index.mjs";
import {
  assertCodexAgentAuthCopyIsolated,
  captureCodexAgentAuthSourceSnapshot,
} from "./credentialSourceIntegrity.mjs";

export async function prepareCodexAgentRuntime(plan, overrides = {}) {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  const fs = createFileSystem(overrides);
  const platform = overrides.platform ?? process.platform;
  const runProcess = overrides.runProcess ?? overrides.processRunner ?? defaultRunProcess;
  const sourceEnv = overrides.sourceEnv ?? overrides.environment ?? overrides.env ?? process.env;
  let rootCreated = false;

  try {
    await assertCanonicalCodexHomeSource(validatedPlan, fs);
    const credentialSourceSnapshot = await captureCodexAgentAuthSourceSnapshot(validatedPlan, {
      fs,
    });
    await assertPathAbsent(validatedPlan.root, "Codex Agent Runtime root", fs);
    await createDirectory(dirname(dirname(validatedPlan.root)), fs);
    await createDirectory(dirname(validatedPlan.root), fs);
    await assertPathAbsent(validatedPlan.root, "Codex Agent Runtime root", fs);
    await fs.mkdir(validatedPlan.root, { mode: 0o700 });
    rootCreated = true;
    await assertOrdinaryDirectory(validatedPlan.root, "Codex Agent Runtime root", fs);

    for (const directory of [
      validatedPlan.codexHome,
      validatedPlan.sqliteHome,
      validatedPlan.tempHome,
      validatedPlan.profileHome,
    ]) {
      await fs.mkdir(directory, { mode: 0o700 });
      await assertOrdinaryDirectory(directory, "Codex Agent Runtime child directory", fs);
    }

    await secureCodexAgentRuntimeDirectory(validatedPlan.root, {
      chmod: fs.chmod,
      platform,
      runProcess,
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
        error.cleanupError = cleanupError;
      }
    }
    throw error;
  }
}

async function assertCanonicalCodexHomeSource(plan, fs) {
  await assertOrdinaryDirectory(plan.codexHomeSource, "codexHomeSource", fs);
  await assertOrdinaryDirectory(dirname(plan.codexHomeSource), "codexHomeSource parent", fs);
  const canonical = await fs.realpath(plan.codexHomeSource);
  if (!sameRuntimePath(plan.codexHomeSource, canonical)) {
    throw new Error("codexHomeSource 必须是 canonical 且不得经过符号链接或 junction。");
  }
  const [sourceMetadata, parentMetadata] = await Promise.all([
    fs.stat(plan.codexHomeSource),
    fs.stat(dirname(plan.codexHomeSource)),
  ]);
  if (sourceMetadata.dev !== parentMetadata.dev) {
    throw new Error("codexHomeSource 与其父目录必须位于同一卷。");
  }
}

async function assertOrdinaryDirectory(path, label, fs) {
  const linkMetadata = await fs.lstat(path);
  if (linkMetadata.isSymbolicLink() || !linkMetadata.isDirectory()) {
    throw new Error(`${label} 必须是普通目录且不得是符号链接或 junction。`);
  }
  const canonical = await fs.realpath(path);
  if (!sameRuntimePath(path, canonical)) throw new Error(`${label} realpath 发生跳转。`);
}

async function assertPathAbsent(path, label, fs) {
  try {
    await fs.lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} 必须不存在。`);
}

async function createDirectory(path, fs) {
  try {
    await fs.mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  await assertOrdinaryDirectory(path, "Codex Agent Runtime parent", fs);
}

function createFileSystem(overrides) {
  const supplied = overrides.fs ?? overrides;
  return {
    chmod: supplied.chmod ?? defaultChmod,
    copyFile: supplied.copyFile ?? defaultCopyFile,
    lstat: supplied.lstat ?? defaultLstat,
    mkdir: supplied.mkdir ?? defaultMkdir,
    realpath: supplied.realpath ?? defaultRealpath,
    readdir: supplied.readdir ?? defaultReaddir,
    rm: supplied.rm ?? defaultRm,
    rmdir: supplied.rmdir ?? defaultRmdir,
    stat: supplied.stat ?? defaultStat,
  };
}
