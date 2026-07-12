import { lstat } from "node:fs/promises";
import { join } from "node:path";

import type {
  InspectProjectRepositoryInput,
  ProjectPathCaseCollision,
  ProjectTextFileReadResult,
  ReadProjectTextFilesInput,
} from "#application/ports/projectFileSystem/index.js";
import { ProjectTextFileReadStatus } from "#application/ports/projectFileSystem/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  type HarnessError as HarnessErrorType,
} from "#common/index.js";

/** 记录大小写不敏感相对路径冲突所需的可变状态。 */
export interface CaseCollisionState {
  /** 以小写相对路径为键记录首次出现的原始路径。 */
  readonly casePathKeys: Map<string, string>;
  /** 扫描期间发现的大小写冲突。 */
  readonly caseCollisions: ProjectPathCaseCollision[];
}

/** 路径组件检查结果的封闭分类。 */
export enum PathInspectionStatus {
  /** 每个组件均可读且不是链接。 */
  Ok = "ok",
  /** 至少一个组件是符号链接或 Junction。 */
  Link = "link",
  /** 至少一个组件无法检查。 */
  Unavailable = "unavailable",
}

/** 请求相对路径的组件检查结果。 */
export interface PathInspection {
  /** 路径组件检查后的分类。 */
  readonly status: PathInspectionStatus;
}

/** 使用小写 key 首次枚举到的路径记录冲突。 */
export function recordCaseInsensitivePath(relativePath: string, state: CaseCollisionState): void {
  const key = relativePath.toLowerCase();
  const firstPath = state.casePathKeys.get(key);
  if (firstPath !== undefined && firstPath !== relativePath) {
    state.caseCollisions.push({ firstPath, secondPath: relativePath });
    return;
  }
  state.casePathKeys.set(key, relativePath);
}

/** 检查路径组件时不跟随符号链接或 junction。 */
export async function inspectPath(root: string, relativePath: string): Promise<PathInspection> {
  let current = root;
  for (const segment of relativePath.split("/")) {
    current = join(current, segment);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        return { status: PathInspectionStatus.Link };
      }
    } catch {
      return { status: PathInspectionStatus.Unavailable };
    }
  }
  return { status: PathInspectionStatus.Ok };
}

/** 创建请求路径不安全时使用的脱敏结果。 */
export function unsafePathResult(relativePath = "<unsafe-path>"): ProjectTextFileReadResult {
  return { relativePath, status: ProjectTextFileReadStatus.UnsafePath, byteLength: 0 };
}

/** 创建请求文件无法读取时使用的结果。 */
export function unavailableResult(relativePath: string, byteLength = 0): ProjectTextFileReadResult {
  return { relativePath, status: ProjectTextFileReadStatus.Unavailable, byteLength };
}

/** 校验 repository inventory 输入，诊断中不包含运行时 root 值。 */
export function validateInspectInput(
  input: InspectProjectRepositoryInput,
): HarnessErrorType | undefined {
  if (!input || typeof input.localRoot !== "string") {
    return invalidInput("localRoot");
  }
  return undefined;
}

/** 校验文本读取限制，诊断中不包含运行时 root 值。 */
export function validateReadInput(input: ReadProjectTextFilesInput): HarnessErrorType | undefined {
  if (!input || typeof input.localRoot !== "string") {
    return invalidInput("localRoot");
  }
  if (!Array.isArray(input.relativePaths)) {
    return invalidInput("relativePaths");
  }
  return undefined;
}

/** 创建仓库 root 无法解析时使用的净化错误。 */
export function rootFailure(operation: string): HarnessErrorType {
  return new HarnessError(HarnessErrorCode.IoFailure, "Project root is unavailable.", {
    operation,
  });
}

/** 将意外 scanner 失败转换为净化后的 Harness errors。 */
export function toHarnessError(error: unknown, operation: string): HarnessErrorType {
  return error instanceof HarnessError
    ? error
    : new HarnessError(HarnessErrorCode.IoFailure, "Project FileSystem operation failed.", {
        operation,
      });
}

function invalidInput(field: string): HarnessErrorType {
  return new HarnessError(HarnessErrorCode.InvalidInput, "Project FileSystem input is invalid.", {
    field,
  });
}
