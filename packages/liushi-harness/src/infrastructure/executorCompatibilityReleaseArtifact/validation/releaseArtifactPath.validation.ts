import type { BigIntStats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { HarnessError, HarnessErrorCode } from "#common/index.js";
import {
  pathApiForPlatform,
  pathContains,
  samePathIdentity,
} from "#infrastructure/system/platformCompatibility/index.js";

/** root 身份快照，用于发布前后 fail-closed 漂移检测。 */
export interface ReleaseArtifactRootIdentity {
  /** 文件系统设备标识，用于发现 root 实体替换。 */
  readonly dev: bigint;
  /** 文件系统 inode 标识，用于发现 root 实体替换。 */
  readonly ino: bigint;
  /** 已解析全部符号链接和目录联接的真实绝对路径。 */
  readonly realPath: string;
}

/** 校验 trusted root 绝对、预存在且整条路径不经过 symlink 或 junction。 */
export async function readReleaseArtifactRootIdentity(
  outputRoot: string,
): Promise<ReleaseArtifactRootIdentity> {
  if (!isAbsolute(outputRoot)) {
    throw new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Release Artifact outputRoot 必须是绝对路径。",
      { outputRoot },
    );
  }
  try {
    const resolvedRoot = resolve(outputRoot);
    const status = await lstat(resolvedRoot, { bigint: true });
    requireOrdinaryDirectory(status, outputRoot);
    const realPath = await realpath(resolvedRoot);
    if (!samePathIdentity(realPath, resolvedRoot)) {
      throw new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        "Release Artifact outputRoot 或其祖先不得包含 symlink 或 junction。",
        { outputRoot },
      );
    }
    return { dev: status.dev, ino: status.ino, realPath };
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        "Release Artifact outputRoot 必须预先存在。",
        { outputRoot },
        error,
      );
    }
    throw new HarnessError(
      HarnessErrorCode.IoFailure,
      "无法验证 Release Artifact outputRoot。",
      { outputRoot },
      error,
    );
  }
}

/** 校验目标是 trusted root 的直接子文件，拒绝嵌套与 root 逃逸。 */
export function requireDirectChildPath(outputRoot: string, outputFilePath: string): string {
  if (!isAbsolute(outputFilePath)) {
    throw new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Release Artifact outputFilePath 必须是绝对路径。",
      { outputFilePath },
    );
  }
  const pathApi = pathApiForPlatform(process.platform);
  const root = pathApi.resolve(outputRoot);
  const target = pathApi.resolve(outputFilePath);
  const relativePath = pathApi.relative(root, target);
  const directChild =
    pathContains(root, target) &&
    relativePath.length > 0 &&
    !relativePath.includes(pathApi.sep) &&
    samePathIdentity(pathApi.dirname(target), root);
  if (!directChild) {
    throw new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Release Artifact outputFilePath 必须是 trusted outputRoot 的直接子文件。",
      { outputRoot, outputFilePath },
    );
  }
  return target;
}

/** 比较 root 的设备、inode 与真实路径，漂移即视为未知结果。 */
export function assertReleaseArtifactRootUnchanged(
  before: ReleaseArtifactRootIdentity,
  after: ReleaseArtifactRootIdentity,
  outputRoot: string,
): void {
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    !samePathIdentity(before.realPath, after.realPath)
  ) {
    throw new HarnessError(
      HarnessErrorCode.ExecutorCompatibilityReleaseArtifactCommitOutcomeUnknown,
      "Release Artifact outputRoot 在发布期间发生漂移。",
      { outputRoot },
    );
  }
}

function requireOrdinaryDirectory(status: BigIntStats, outputRoot: string): void {
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Release Artifact outputRoot 必须是非链接普通目录。",
      { outputRoot },
    );
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
