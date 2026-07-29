import {
  lstat as defaultLstat,
  realpath as defaultRealpath,
  stat as defaultStat,
} from "node:fs/promises";

import { sameRuntimePath, validateCodexAgentRuntimePlan } from "./runtimePlan.mjs";

export async function captureCodexAgentAuthSourceSnapshot(plan, overrides = {}) {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  return captureOrdinaryFileSnapshot(validatedPlan.authSourceFile, "auth.json source", overrides);
}

export async function assertCodexAgentAuthSourceStable(plan, expectedSnapshot, overrides = {}) {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  const current = await captureOrdinaryFileSnapshot(
    validatedPlan.authSourceFile,
    "auth.json source",
    overrides,
  );
  assertSameSnapshot(current, expectedSnapshot, "auth.json source");
  return { verified: true };
}

export async function assertCodexAgentAuthCopyIsolated(
  plan,
  expectedSourceSnapshot,
  overrides = {},
) {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  const source = await captureOrdinaryFileSnapshot(
    validatedPlan.authSourceFile,
    "auth.json source",
    overrides,
  );
  const destination = await captureOrdinaryFileSnapshot(
    validatedPlan.authFile,
    "isolated auth.json",
    overrides,
  );
  assertSameSnapshot(source, expectedSourceSnapshot, "auth.json source");
  if (source.size !== destination.size) {
    throw new Error("隔离 auth.json 副本与源文件大小不一致。");
  }
  if (source.device === destination.device && source.inode === destination.inode) {
    throw new Error("隔离 auth.json 不得与宿主凭据共享文件身份。");
  }
  return { verified: true };
}

async function captureOrdinaryFileSnapshot(path, label, overrides) {
  const fs = createFileSystem(overrides);
  const linkMetadata = await fs.lstat(path);
  if (linkMetadata.isSymbolicLink() || !linkMetadata.isFile()) {
    throw new Error(`${label} 必须是普通文件且不得是符号链接或 junction。`);
  }
  const canonical = await fs.realpath(path);
  if (!sameRuntimePath(path, canonical)) throw new Error(`${label} realpath 发生跳转。`);
  const before = await fs.stat(path);
  const after = await fs.stat(path);
  if (
    !before.isFile() ||
    !after.isFile() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.ctimeMs !== after.ctimeMs
  ) {
    throw new Error(`${label} 在快照期间发生漂移。`);
  }
  return Object.freeze({
    path,
    size: after.size,
    device: String(after.dev),
    inode: String(after.ino),
    modifiedAtMs: after.mtimeMs,
    changedAtMs: after.ctimeMs,
  });
}

function assertSameSnapshot(actual, expected, label) {
  if (
    expected === null ||
    typeof expected !== "object" ||
    Array.isArray(expected) ||
    !sameRuntimePath(actual.path, expected.path) ||
    actual.size !== expected.size ||
    actual.device !== expected.device ||
    actual.inode !== expected.inode ||
    actual.modifiedAtMs !== expected.modifiedAtMs ||
    actual.changedAtMs !== expected.changedAtMs
  ) {
    throw new Error(`${label} 与准备阶段快照不一致。`);
  }
}

function createFileSystem(overrides) {
  const supplied = overrides.fs ?? overrides;
  return {
    lstat: supplied.lstat ?? defaultLstat,
    realpath: supplied.realpath ?? defaultRealpath,
    stat: supplied.stat ?? defaultStat,
  };
}
