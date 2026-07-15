import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import writeFileAtomic from "write-file-atomic";

import { HarnessError, HarnessErrorCode } from "#common/index.js";
import type { ExecutorCapabilityEvidence } from "#domain/executorCompatibility/index.js";

import {
  parsePersistedExecutorCompatibilityArtifact,
  parsePersistedExecutorCompatibilityEvidence,
} from "../schema/index.js";

/** 原子并带 fsync 写入一个不可变 JSON 内容。 */
export async function writeExecutorCompatibilityJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, `${JSON.stringify(value)}\n`, {
    encoding: "utf8",
    fsync: true,
    mode: 0o600,
  });
}

/** 读取并严格解析规范 Evidence；文件不存在时返回 undefined。 */
export async function readExecutorCompatibilityEvidenceFile(
  filePath: string,
): Promise<ExecutorCapabilityEvidence | undefined> {
  const raw = await readJson(filePath, "Evidence");
  return raw === undefined ? undefined : parsePersistedExecutorCompatibilityEvidence(raw);
}

/** 读取并校验 Artifact JSON 对象；文件不存在时返回 undefined。 */
export async function readExecutorCompatibilityArtifactFile(
  filePath: string,
): Promise<Record<string, unknown> | undefined> {
  const raw = await readJson(filePath, "Artifact");
  return raw === undefined ? undefined : parsePersistedExecutorCompatibilityArtifact(raw);
}

async function readJson(filePath: string, kind: string): Promise<unknown> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    throw new HarnessError(
      HarnessErrorCode.IoFailure,
      `无法读取 Executor Compatibility ${kind} 文件。`,
      { recordFile: filePath },
      error,
    );
  }
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      `Executor Compatibility ${kind} 文件不是有效 JSON。`,
      { recordFile: filePath },
      error,
    );
  }
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
