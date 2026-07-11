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

/** Records a collision using the first enumerated path for the lower-case key. */
export function recordCaseInsensitivePath(relativePath: string, state: CaseCollisionState): void {
  const key = relativePath.toLowerCase();
  const firstPath = state.casePathKeys.get(key);
  if (firstPath !== undefined && firstPath !== relativePath) {
    state.caseCollisions.push({ firstPath, secondPath: relativePath });
    return;
  }
  state.casePathKeys.set(key, relativePath);
}

/** Checks path components without following a symbolic link or junction. */
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

/** Creates the redacted result used when a requested path is unsafe. */
export function unsafePathResult(relativePath = "<unsafe-path>"): ProjectTextFileReadResult {
  return { relativePath, status: ProjectTextFileReadStatus.UnsafePath, byteLength: 0 };
}

/** Creates the result used when a requested file cannot be read. */
export function unavailableResult(relativePath: string, byteLength = 0): ProjectTextFileReadResult {
  return { relativePath, status: ProjectTextFileReadStatus.Unavailable, byteLength };
}

/** Validates repository inventory input without including runtime root values in diagnostics. */
export function validateInspectInput(
  input: InspectProjectRepositoryInput,
): HarnessErrorType | undefined {
  if (!input || typeof input.localRoot !== "string") {
    return invalidInput("localRoot");
  }
  return undefined;
}

/** Validates text read limits without including runtime root values in diagnostics. */
export function validateReadInput(input: ReadProjectTextFilesInput): HarnessErrorType | undefined {
  if (!input || typeof input.localRoot !== "string") {
    return invalidInput("localRoot");
  }
  if (!Array.isArray(input.relativePaths)) {
    return invalidInput("relativePaths");
  }
  return undefined;
}

/** Creates the sanitized error used when the repository root cannot be resolved. */
export function rootFailure(operation: string): HarnessErrorType {
  return new HarnessError(HarnessErrorCode.IoFailure, "Project root is unavailable.", {
    operation,
  });
}

/** Converts unexpected scanner failures into sanitized Harness errors. */
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
