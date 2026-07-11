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
import { ProjectTextFileReadStatus } from "#application/ports/projectFileSystem/index.js";

/** Resolved root values kept private to one adapter operation. */
interface RootContext {
  readonly realRoot: string;
  readonly rootIdentity: string;
}
/** Mutable traversal state for one bounded inventory operation. */
interface InventoryState {
  readonly files: string[];
  readonly directories: string[];
  readonly skippedLinks: string[];
  readonly unreadablePaths: string[];
  readonly depthLimitedPaths: string[];
  readonly casePathKeys: Map<string, string>;
  readonly caseCollisions: ProjectPathCaseCollision[];
  ignoredDirectoryCount: number;
  directoryLimitReached: boolean;
  fileLimitReached: boolean;
}

/** Node.js FileSystem adapter for bounded, link-safe project scanning. */
export class NodeProjectFileSystemAdapter implements ProjectFileSystemPort {
  /** Inspects a repository without following links or returning absolute file paths. */
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
        depthLimitedPaths: [],
        casePathKeys: new Map(),
        caseCollisions: [],
        ignoredDirectoryCount: 0,
        directoryLimitReached: false,
        fileLimitReached: false,
      };

      await this.visitDirectory(root.realRoot, "", 0, input, state, root.realRoot);
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
        depthLimitedPaths: [...new Set(state.depthLimitedPaths)].sort(compareRelativePaths),
        caseCollisions,
        directoryLimitReached: state.directoryLimitReached,
        fileLimitReached: state.fileLimitReached,
      });
    } catch (error) {
      return failure(toHarnessError(error, "inspect_repository"));
    }
  }

  /** Reads selected files after validating paths, root containment, links, and byte budgets. */
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
      let totalBytes = 0;

      for (const requestedPath of input.relativePaths) {
        const relativePath = normalizeRequestedRelativePath(requestedPath);
        if (relativePath === undefined) {
          results.push(unsafePathResult());
          continue;
        }

        const result = await readProjectTextFile(root.realRoot, relativePath, {
          maxFileBytes: input.maxFileBytes,
          maxTotalBytes: input.maxTotalBytes,
          consumedBytes: totalBytes,
        });
        results.push(result);
        if (result.status === ProjectTextFileReadStatus.Read) {
          totalBytes += result.byteLength;
        }
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
    depth: number,
    input: InspectProjectRepositoryInput,
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
      if (state.fileLimitReached || state.directoryLimitReached) {
        return;
      }

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
        if (state.directories.length >= input.maxDirectories) {
          state.directoryLimitReached = true;
          return;
        }
        state.directories.push(relativePath);
        if (depth >= input.maxDepth) {
          state.depthLimitedPaths.push(relativePath);
          continue;
        }
        await this.visitDirectory(absolutePath, relativePath, depth + 1, input, state, root);
        continue;
      }

      if (!stats.isFile()) {
        state.unreadablePaths.push(relativePath);
        continue;
      }

      if (state.files.length >= input.maxFiles) {
        state.fileLimitReached = true;
        return;
      }
      state.files.push(relativePath);
    }
  }
}
