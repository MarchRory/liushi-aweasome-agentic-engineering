import { lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { FileMutationKind } from "#application/ports/index.js";
import type {
  ApplyFileMutationsInput,
  ContentDigestPort,
  FileMutation,
  FileMutationExecutionResult,
  FileMutationExecutorPort,
  WorktreeInspectorPort,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import { ActionOutcome } from "#domain/actionJournal/index.js";
import { WorktreeInspectionStatus } from "#application/ports/worktree/index.js";
import { isWithinRoot } from "#infrastructure/worktree/path/index.js";

/** 以完整目标文本和内容摘要实现确定性的受控文件写入。 */
export class NodeFileMutationExecutorAdapter implements FileMutationExecutorPort {
  public constructor(
    private readonly inspector: WorktreeInspectorPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 从受管绑定推导唯一 Worktree，写入后回读内容并用 Git 验收实际范围。 */
  public async execute(
    input: ApplyFileMutationsInput,
  ): Promise<Result<FileMutationExecutionResult, HarnessError>> {
    const root = await resolveBoundWorktreeRoot(input);
    if (root === undefined) return success(notApplied("file_mutation_worktree_binding_invalid"));
    const initial = await this.inspector.inspect(inspectInput(input));
    if (initial.status === ResultStatus.Failure) return initial;
    if (initial.value.status !== WorktreeInspectionStatus.Ready) {
      return success(unknown("file_mutation_worktree_not_ready"));
    }
    const prepared = await prepareMutations(root, input.mutations, this.digest);
    if (prepared instanceof HarnessError) return success(notApplied(prepared.message));

    try {
      for (const mutation of prepared) {
        const current = await validateCurrentState(root, mutation, this.digest);
        if (current instanceof HarnessError) return success(unknown(current.message));
        await writeAtomically(mutation, current.mode);
      }
    } catch {
      return success(unknown("file_mutation_write_or_durability_unknown"));
    }

    const actualTargets = await verifyTargetContents(prepared, this.digest);
    if (actualTargets instanceof HarnessError) return success(unknown(actualTargets.message));
    const inspected = await this.inspector.inspect(inspectInput(input));
    if (inspected.status === ResultStatus.Failure) {
      return success(unknown("file_mutation_postcondition_unavailable"));
    }
    const expectedPaths = input.mutations.map((mutation) => mutation.path);
    if (
      inspected.value.status !== WorktreeInspectionStatus.Dirty ||
      !samePaths(inspected.value.changedPaths, expectedPaths)
    ) {
      return success(unknown("file_mutation_postcondition_mismatch"));
    }
    const outputDigest = this.digest.calculate(actualTargets);
    if (outputDigest.status === ResultStatus.Failure) return outputDigest;
    return success({
      outcome: ActionOutcome.Succeeded,
      evidenceIds: expectedPaths.map((path) => `file:${path}`),
      outputDigest: outputDigest.value,
    });
  }
}

/** 已完成无副作用前置检查的本机目标。 */
interface PreparedMutation extends FileMutation {
  readonly absolutePath: string;
  readonly temporaryPath: string;
}

/** 目标文件在提交点的状态。 */
interface CurrentState {
  readonly mode?: number;
}

async function resolveBoundWorktreeRoot(
  input: ApplyFileMutationsInput,
): Promise<string | undefined> {
  try {
    const repositoryRoot = await realpath(input.repositoryRoot);
    const candidate = resolve(repositoryRoot, ...input.worktreeBinding.relativePath.split("/"));
    if (!isWithinRoot(repositoryRoot, candidate)) return undefined;
    const actual = await realpath(candidate);
    return (await lstat(actual)).isDirectory() && isWithinRoot(repositoryRoot, actual)
      ? actual
      : undefined;
  } catch {
    return undefined;
  }
}

async function prepareMutations(
  root: string,
  mutations: readonly FileMutation[],
  digest: ContentDigestPort,
): Promise<readonly PreparedMutation[] | HarnessError> {
  const prepared: PreparedMutation[] = [];
  for (const mutation of mutations) {
    const absolutePath = resolve(root, ...mutation.path.split("/"));
    if (!isWithinRoot(root, absolutePath)) return invalid("file_mutation_path_escape");
    const targetDigest = digest.calculate(mutation.content);
    if (
      targetDigest.status === ResultStatus.Failure ||
      targetDigest.value !== mutation.contentDigest
    ) {
      return invalid("file_mutation_content_digest_mismatch");
    }
    const candidate: PreparedMutation = {
      ...mutation,
      absolutePath,
      temporaryPath: `${absolutePath}.liushi-${mutation.contentDigest.slice(-16)}.tmp`,
    };
    const current = await validateCurrentState(root, candidate, digest);
    if (current instanceof HarnessError) return current;
    prepared.push(candidate);
  }
  return prepared;
}

async function validateCurrentState(
  root: string,
  mutation: PreparedMutation,
  digest: ContentDigestPort,
): Promise<CurrentState | HarnessError> {
  if (!(await hasSafeParent(root, mutation.path))) return invalid("file_mutation_parent_unsafe");
  const current = await inspectCurrentFile(mutation.absolutePath);
  if (current.kind === "unsafe") return invalid("file_mutation_target_unsafe");
  if (mutation.kind === FileMutationKind.Create) {
    return current.kind === "missing" ? {} : invalid("file_mutation_create_target_exists");
  }
  if (current.kind !== "file" || mutation.expectedContentDigest === undefined) {
    return invalid("file_mutation_replace_target_missing");
  }
  const currentDigest = digest.calculate(current.content);
  return currentDigest.status === ResultStatus.Success &&
    currentDigest.value === mutation.expectedContentDigest
    ? { mode: current.mode }
    : invalid("file_mutation_precondition_mismatch");
}

/** 目标文件在提交点允许观察到的封闭状态。 */
type CurrentFile =
  | { readonly kind: "missing" }
  | { readonly kind: "unsafe" }
  | { readonly kind: "file"; readonly content: string; readonly mode: number };

async function inspectCurrentFile(path: string): Promise<CurrentFile> {
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) return { kind: "unsafe" };
    return { kind: "file", content: await readFile(path, "utf8"), mode: stats.mode };
  } catch (error) {
    return isMissing(error) ? { kind: "missing" } : { kind: "unsafe" };
  }
}

async function hasSafeParent(root: string, relativePath: string): Promise<boolean> {
  let current = root;
  for (const segment of relativePath.split("/").slice(0, -1)) {
    current = resolve(current, segment);
    try {
      const stats = await lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
      if (!isWithinRoot(root, await realpath(current))) return false;
    } catch (error) {
      return isMissing(error);
    }
  }
  return true;
}

async function writeAtomically(mutation: PreparedMutation, mode?: number): Promise<void> {
  await mkdir(dirname(mutation.absolutePath), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let temporaryCreated = false;
  try {
    handle = await open(mutation.temporaryPath, "wx");
    temporaryCreated = true;
    await handle.writeFile(mutation.content, "utf8");
    if (mode !== undefined) await handle.chmod(mode);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(mutation.temporaryPath, mutation.absolutePath);
    await syncParentDirectory(mutation.absolutePath);
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    if (temporaryCreated) {
      const cleaned = await rm(mutation.temporaryPath, { force: true })
        .then(() => true)
        .catch(() => false);
      if (!cleaned) throw new Error("临时文件清理结果未知。", { cause: error });
    }
    throw error;
  }
}

async function syncParentDirectory(path: string): Promise<void> {
  try {
    const handle = await open(dirname(path), "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (!isBestEffortDirectorySyncError(error)) throw error;
  }
}

async function verifyTargetContents(
  mutations: readonly PreparedMutation[],
  digest: ContentDigestPort,
): Promise<
  readonly { readonly path: string; readonly contentDigest: ContentDigest }[] | HarnessError
> {
  const actual: { path: string; contentDigest: ContentDigest }[] = [];
  for (const mutation of mutations) {
    const current = await inspectCurrentFile(mutation.absolutePath);
    if (current.kind !== "file") return invalid("file_mutation_result_unavailable");
    const contentDigest = digest.calculate(current.content);
    if (
      contentDigest.status === ResultStatus.Failure ||
      contentDigest.value !== mutation.contentDigest
    ) {
      return invalid("file_mutation_result_digest_mismatch");
    }
    actual.push({ path: mutation.path, contentDigest: contentDigest.value });
  }
  return actual;
}

function inspectInput(input: ApplyFileMutationsInput) {
  return {
    repositoryId: input.repositoryId,
    repositoryRoot: input.repositoryRoot,
    worktreeBinding: input.worktreeBinding,
    baseRevision: input.baseRevision,
    writeSet: input.writeSet,
  };
}

function samePaths(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((path, index) => path === expected[index])
  );
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isBestEffortDirectorySyncError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ["EISDIR", "EPERM", "EINVAL", "ENOTSUP", "EACCES"].includes(String(error.code))
  );
}

function notApplied(errorCode: string): FileMutationExecutionResult {
  return { outcome: ActionOutcome.NotApplied, evidenceIds: [], errorCode };
}

function unknown(errorCode: string): FileMutationExecutionResult {
  return { outcome: ActionOutcome.OutcomeUnknown, evidenceIds: [], errorCode };
}

function invalid(code: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, code);
}
