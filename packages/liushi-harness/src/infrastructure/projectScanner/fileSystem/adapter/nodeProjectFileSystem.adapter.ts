import { lstat, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import type {
  InspectProjectRepositoryInput,
  ProjectPathCaseCollision,
  ProjectFileSystemPort,
  ProjectRepositoryFileInventory,
  ProjectTextFileReadResult,
  ReadProjectTextFilesInput,
} from "#application/ports/projectFileSystem/index.js";
import {
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";

import { DEFAULT_IGNORED_DIRECTORY_NAMES } from "../../constants/index.js";
import {
  canonicalizeRootIdentity,
  compareCaseCollisions,
  compareRelativePaths,
  normalizeRequestedRelativePath,
  readProjectTextFile,
  recordCaseInsensitivePath,
  rootFailure,
  toRelativePosixPath,
  toHarnessError,
  unsafePathResult,
  validateInspectInput,
  validateReadInput,
} from "../../io/index.js";

/** 仅在单次 adapter 操作内私有保留的 resolved root 值。 */
interface RootContext {
  readonly realRoot: string;
  readonly rootIdentity: string;
}
/** 单次有界 inventory 操作的可变遍历状态。 */
interface InventoryState {
  readonly files: string[];
  readonly directories: string[];
  readonly skippedLinks: string[];
  readonly unreadablePaths: string[];
  readonly casePathKeys: Map<string, string>;
  readonly caseCollisions: ProjectPathCaseCollision[];
  ignoredDirectoryCount: number;
}

/** 用于链接安全项目扫描的 Node.js FileSystem adapter。 */
export class NodeProjectFileSystemAdapter implements ProjectFileSystemPort {
  /** 检查仓库时不跟随链接，也不返回绝对文件路径。 */
  public async inspectRepository(
    input: InspectProjectRepositoryInput,
  ): Promise<Result<ProjectRepositoryFileInventory, HarnessErrorType>> {
    const validation = validateInspectInput(input);
    if (validation !== undefined) {
      return failure(validation);
    }

    try {
      const root = await this.resolveRoot(input.localRoot);
      const state: InventoryState = {
        files: [],
        directories: [],
        skippedLinks: [],
        unreadablePaths: [],
        casePathKeys: new Map(),
        caseCollisions: [],
        ignoredDirectoryCount: 0,
      };

      await this.visitDirectory(root.realRoot, "", state, root.realRoot);
      const unreadablePaths = [...new Set(state.unreadablePaths)].sort(compareRelativePaths);
      const caseCollisions = [...state.caseCollisions].sort(compareCaseCollisions);
      return success({
        repositoryId: input.repositoryId,
        rootIdentity: root.rootIdentity,
        files: state.files.sort(compareRelativePaths),
        directories: state.directories.sort(compareRelativePaths),
        skippedLinks: [...new Set(state.skippedLinks)].sort(compareRelativePaths),
        ignoredDirectoryCount: state.ignoredDirectoryCount,
        unreadablePaths,
        caseCollisions,
      });
    } catch (error) {
      return failure(toHarnessError(error, "inspect_repository"));
    }
  }

  /** 校验路径、根目录包含关系和链接后读取选中文件。 */
  public async readTextFiles(
    input: ReadProjectTextFilesInput,
  ): Promise<Result<readonly ProjectTextFileReadResult[], HarnessErrorType>> {
    const validation = validateReadInput(input);
    if (validation !== undefined) {
      return failure(validation);
    }

    try {
      const root = await this.resolveRoot(input.localRoot);
      const results: ProjectTextFileReadResult[] = [];

      for (const requestedPath of input.relativePaths) {
        const relativePath = normalizeRequestedRelativePath(requestedPath);
        if (relativePath === undefined) {
          results.push(unsafePathResult());
          continue;
        }

        const result = await readProjectTextFile(root.realRoot, relativePath);
        results.push(result);
      }

      return success(results);
    } catch (error) {
      return failure(toHarnessError(error, "read_text_files"));
    }
  }

  private async resolveRoot(localRoot: string): Promise<RootContext> {
    try {
      await lstat(localRoot);
    } catch {
      throw rootFailure("root_lstat");
    }

    let realRoot: string;
    try {
      realRoot = await realpath(localRoot);
      const rootStats = await lstat(realRoot);
      if (!rootStats.isDirectory()) {
        throw new Error("root_not_directory");
      }
    } catch {
      throw rootFailure("root_realpath");
    }

    return { realRoot, rootIdentity: canonicalizeRootIdentity(realRoot) };
  }

  private async visitDirectory(
    directory: string,
    relativeDirectory: string,
    state: InventoryState,
    root: string,
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      if (relativeDirectory !== "") {
        state.unreadablePaths.push(relativeDirectory);
      }
      return;
    }

    entries.sort((left, right) => compareRelativePaths(left.name, right.name));
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const relativePath = toRelativePosixPath(root, absolutePath);
      recordCaseInsensitivePath(relativePath, state);
      let stats;
      try {
        stats = await lstat(absolutePath);
      } catch {
        state.unreadablePaths.push(relativePath);
        continue;
      }

      if (stats.isSymbolicLink()) {
        state.skippedLinks.push(relativePath);
        continue;
      }

      if (stats.isDirectory()) {
        if (DEFAULT_IGNORED_DIRECTORY_NAMES.has(entry.name)) {
          state.ignoredDirectoryCount += 1;
          continue;
        }
        state.directories.push(relativePath);
        await this.visitDirectory(absolutePath, relativePath, state, root);
        continue;
      }

      if (!stats.isFile()) {
        state.unreadablePaths.push(relativePath);
        continue;
      }

      state.files.push(relativePath);
    }
  }
}
