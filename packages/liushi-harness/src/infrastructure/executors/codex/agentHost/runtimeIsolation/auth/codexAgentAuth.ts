import {
  lstat as defaultLstat,
  realpath as defaultRealpath,
  stat as defaultStat,
} from "node:fs/promises";

import type {
  CodexAgentAuthIntegrityOverrides,
  CodexAgentAuthSourceSnapshot,
  CodexAgentAuthVerificationResult,
  CodexAgentRuntimePlan,
  RuntimeAuthFileSystem,
} from "../contracts/index.js";
import { sameRuntimePath, validateCodexAgentRuntimePlan } from "../plan/index.js";

/** 捕获 auth.json 元数据，不读取凭据内容。 */
export async function captureCodexAgentAuthSourceSnapshot(
  plan: CodexAgentRuntimePlan,
  overrides: CodexAgentAuthIntegrityOverrides = {},
): Promise<CodexAgentAuthSourceSnapshot> {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  return captureOrdinaryFileSnapshot(validatedPlan.authSourceFile, "auth.json 源文件", overrides);
}

/** 验证源 auth.json 与准备阶段快照一致。 */
export async function assertCodexAgentAuthSourceStable(
  plan: CodexAgentRuntimePlan,
  expectedSnapshot: CodexAgentAuthSourceSnapshot,
  overrides: CodexAgentAuthIntegrityOverrides = {},
): Promise<CodexAgentAuthVerificationResult> {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  const current = await captureOrdinaryFileSnapshot(
    validatedPlan.authSourceFile,
    "auth.json 源文件",
    overrides,
  );
  assertSameSnapshot(current, expectedSnapshot, "auth.json 源文件");

  return { verified: true };
}

/** 验证 auth.json 副本身份独立且源文件未漂移。 */
export async function assertCodexAgentAuthCopyIsolated(
  plan: CodexAgentRuntimePlan,
  expectedSourceSnapshot: CodexAgentAuthSourceSnapshot,
  overrides: CodexAgentAuthIntegrityOverrides = {},
): Promise<CodexAgentAuthVerificationResult> {
  const validatedPlan = validateCodexAgentRuntimePlan(plan);
  const source = await captureOrdinaryFileSnapshot(
    validatedPlan.authSourceFile,
    "auth.json 源文件",
    overrides,
  );
  const destination = await captureOrdinaryFileSnapshot(
    validatedPlan.authFile,
    "隔离 auth.json",
    overrides,
  );
  assertSameSnapshot(source, expectedSourceSnapshot, "auth.json 源文件");
  if (source.size !== destination.size) {
    throw new Error("隔离 auth.json 副本与源文件大小不一致。");
  }
  if (source.device === destination.device && source.inode === destination.inode) {
    throw new Error("隔离 auth.json 不得与宿主凭据共享文件身份。");
  }

  return { verified: true };
}

function createFileSystem(overrides: CodexAgentAuthIntegrityOverrides): RuntimeAuthFileSystem {
  const supplied = overrides.fs ?? overrides;
  return {
    lstat: supplied.lstat ?? ((path) => defaultLstat(path)),
    realpath: supplied.realpath ?? ((path) => defaultRealpath(path)),
    stat: supplied.stat ?? ((path) => defaultStat(path)),
  };
}

async function captureOrdinaryFileSnapshot(
  path: string,
  label: string,
  overrides: CodexAgentAuthIntegrityOverrides,
): Promise<CodexAgentAuthSourceSnapshot> {
  const fs = createFileSystem(overrides);
  const linkMetadata = await fs.lstat(path);
  if (linkMetadata.isSymbolicLink() || !linkMetadata.isFile()) {
    throw new Error(`${label} 必须是普通文件且不得是符号链接或 junction。`);
  }
  const canonical = await fs.realpath(path);
  if (!sameRuntimePath(path, canonical)) {
    throw new Error(`${label} 的 realpath 发生跳转。`);
  }

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

function assertSameSnapshot(
  actual: CodexAgentAuthSourceSnapshot,
  expected: CodexAgentAuthSourceSnapshot,
  label: string,
): void {
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
