import type { ContentDigest } from "#common/index.js";
import type { RepositoryId } from "#domain/workspace/index.js";

import type { ProjectTextFileReadStatus } from "./projectFileSystem.enums.js";

/** Repository 文件枚举 Port 的输入。 */
export interface InspectProjectRepositoryInput {
  /** Repository 稳定 ID。 */
  repositoryId: RepositoryId;
  /** Runtime-only 本机 Root。 */
  localRoot: string;
}

/** 当前平台语义下仅大小写不同的两个相对路径。 */
export interface ProjectPathCaseCollision {
  /** 第一个被枚举的相对路径。 */
  firstPath: string;
  /** 与第一个路径大小写折叠后相同的相对路径。 */
  secondPath: string;
}

/** 不含本机绝对路径的 Repository 文件树快照。 */
export interface ProjectRepositoryFileInventory {
  /** Repository 稳定 ID。 */
  repositoryId: RepositoryId;
  /** 仅供本次 Use Case 检测重复 Root 的不透明身份。 */
  rootIdentity: string;
  /** 按相对路径排序的普通文件。 */
  files: readonly string[];
  /** 按相对路径排序的目录。 */
  directories: readonly string[];
  /** 按安全策略跳过的 Link 相对路径。 */
  skippedLinks: readonly string[];
  /** 因默认 Ignore Policy 跳过的目录数。 */
  ignoredDirectoryCount: number;
  /** 因权限或并发变化无法读取的相对路径。 */
  unreadablePaths: readonly string[];
  /** 大小写折叠后发生碰撞的相对路径对。 */
  caseCollisions: readonly ProjectPathCaseCollision[];
}

/** 批量读取配置文本的 Port 输入。 */
export interface ReadProjectTextFilesInput {
  /** Repository 稳定 ID。 */
  repositoryId: RepositoryId;
  /** Runtime-only 本机 Root。 */
  localRoot: string;
  /** 只允许来自 File Inventory 的规范相对路径。 */
  relativePaths: readonly string[];
}

/** 单个配置文本的读取结果。 */
export interface ProjectTextFileReadResult {
  /** 文件在 Repository 内的相对路径。 */
  relativePath: string;
  /** 读取结果的封闭状态。 */
  status: ProjectTextFileReadStatus;
  /** 文件 Stat 报告的字节数。 */
  byteLength: number;
  /** Read 状态下对原始字节计算的 Digest。 */
  contentDigest?: ContentDigest;
  /** Read 状态下的严格 UTF-8 文本；不会进入最终报告。 */
  content?: string;
}
