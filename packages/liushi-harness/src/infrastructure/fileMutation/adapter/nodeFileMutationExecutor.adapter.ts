import { lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  ApplyFileMutationsInput,
  ContentDigestPort,
  FileMutation,
  FileMutationExecutionResult,
  FileMutationExecutorPort,
  WorktreeInspectorPort,
} from "#application/ports/index.js";
import { FileMutationKind } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
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

  /** 校验全部前置条件后逐文件原子替换，并用 Git 状态验收 Write Set。 */
  public async execute(
    input: ApplyFileMutationsInput,
  ): Promise<Result<FileMutationExecutionResult, HarnessError>> {
    const initial = await this.inspector.inspect(inspectInput(input));
    if (initial.status === ResultStatus.Failure) return initial;
    if (initial.value.status !== WorktreeInspectionStatus.Ready) {
      return success(unknown("file_mutation_worktree_not_ready"));
    }

    const prepared = await prepareMutations(input.worktreeRoot, input.mutations, this.digest);
    if (prepared instanceof HarnessError) return success(notApplied(prepared.code));
    let applied = 0;
    try {
      for (const mutation of prepared) {
        await writeAtomically(mutation.absolutePath, mutation.content, mutation.temporaryPath);
        applied += 1;
      }
    } catch {
      return success({
        outcome: applied === 0 ? ActionOutcome.NotApplied : ActionOutcome.OutcomeUnknown,
        evidenceIds: [],
        errorCode: applied === 0 ? "file_mutation_write_failed" : "file_mutation_partial_write",
      });
    }

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
    const outputDigest = this.digest.calculate(
      input.mutations.map(({ path, contentDigest }) => ({ path, contentDigest })),
    );
    if (outputDigest.status === ResultStatus.Failure) return outputDigest;
    return success({
      outcome: ActionOutcome.Succeeded,
      evidenceIds: expectedPaths.map((path) => `file:${path}`),
      outputDigest: outputDigest.value,
    });
  }
}

/** 已完成全部无副作用前置检查的本机文件目标。 */
interface PreparedMutation extends FileMutation {
  readonly absolutePath: string;
  readonly temporaryPath: string;
}

async function prepareMutations(
  rootInput: string,
  mutations: readonly FileMutation[],
  digest: ContentDigestPort,
): Promise<readonly PreparedMutation[] | HarnessError> {
  let root: string;
  try {
    root = await realpath(rootInput);
    if (!(await lstat(root)).isDirectory()) return invalidPrecondition("worktree_root_invalid");
  } catch {
    return invalidPrecondition("worktree_root_unavailable");
  }
  const prepared: PreparedMutation[] = [];
  for (const mutation of mutations) {
    const absolutePath = resolve(root, ...mutation.path.split("/"));
    if (!isWithinRoot(root, absolutePath)) return invalidPrecondition("file_mutation_path_escape");
    if (!(await hasSafeParent(root, mutation.path))) {
      return invalidPrecondition("file_mutation_parent_unsafe");
    }
    const actualDigest = digest.calculate(mutation.content);
    if (
      actualDigest.status === ResultStatus.Failure ||
      actualDigest.value !== mutation.contentDigest
    ) {
      return invalidPrecondition("file_mutation_content_digest_mismatch");
    }
    const current = await inspectCurrentFile(absolutePath);
    if (current.kind === "unsafe") return invalidPrecondition("file_mutation_target_unsafe");
    if (mutation.kind === FileMutationKind.Create && current.kind !== "missing") {
      return invalidPrecondition("file_mutation_create_target_exists");
    }
    if (mutation.kind === FileMutationKind.Replace) {
      if (current.kind !== "file" || mutation.expectedContentDigest === undefined) {
        return invalidPrecondition("file_mutation_replace_target_missing");
      }
      const currentDigest = digest.calculate(current.content);
      if (
        currentDigest.status === ResultStatus.Failure ||
        currentDigest.value !== mutation.expectedContentDigest
      ) {
        return invalidPrecondition("file_mutation_precondition_mismatch");
      }
    }
    prepared.push({
      ...mutation,
      absolutePath,
      temporaryPath: `${absolutePath}.liushi-${mutation.contentDigest.slice(-16)}.tmp`,
    });
  }
  return prepared;
}

/** 目标文件在写入前允许观察到的封闭状态。 */
type CurrentFile =
  | { readonly kind: "missing" }
  | { readonly kind: "unsafe" }
  | { readonly kind: "file"; readonly content: string };

async function inspectCurrentFile(path: string): Promise<CurrentFile> {
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) return { kind: "unsafe" };
    return { kind: "file", content: await readFile(path, "utf8") };
  } catch (error) {
    return isMissing(error) ? { kind: "missing" } : { kind: "unsafe" };
  }
}

async function hasSafeParent(root: string, relativePath: string): Promise<boolean> {
  const segments = relativePath.split("/").slice(0, -1);
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    try {
      const stats = await lstat(current);
      if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
      const actual = await realpath(current);
      if (!isWithinRoot(root, actual)) return false;
    } catch (error) {
      if (isMissing(error)) return true;
      return false;
    }
  }
  return true;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function writeAtomically(
  path: string,
  content: string,
  temporaryPath: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
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

function notApplied(errorCode: string): FileMutationExecutionResult {
  return { outcome: ActionOutcome.NotApplied, evidenceIds: [], errorCode };
}

function unknown(errorCode: string): FileMutationExecutionResult {
  return { outcome: ActionOutcome.OutcomeUnknown, evidenceIds: [], errorCode };
}

function invalidPrecondition(code: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, code);
}
