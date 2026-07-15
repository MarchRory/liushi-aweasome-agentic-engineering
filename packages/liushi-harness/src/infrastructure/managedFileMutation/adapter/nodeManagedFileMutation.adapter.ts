import { lstat, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import writeFileAtomic from "write-file-atomic";

import type {
  ContentDigestPort,
  ManagedFileMutationPort,
  ReplaceManagedFileInput,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { ManagedFileActualKind, type ActualManagedFileState } from "#domain/installation/index.js";
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";
import { resolveSafeRepositoryTarget } from "#infrastructure/system/platformCompatibility/index.js";

/** 使用前置条件、原子替换和目录耐久性实现受管文件写入。 */
export class NodeManagedFileMutationAdapter implements ManagedFileMutationPort {
  public constructor(
    private readonly digest: ContentDigestPort,
    private readonly parentDirectoryDurability: ParentDirectoryDurability,
  ) {}

  /** 仅当前置现场精确匹配时写入，并在返回成功前复读验证目标摘要。 */
  public async replace(
    input: ReplaceManagedFileInput,
  ): Promise<Result<ActualManagedFileState, HarnessError>> {
    const expectedDigest = this.digest.calculate(input.content);
    if (
      expectedDigest.status === ResultStatus.Failure ||
      expectedDigest.value !== input.digest ||
      input.expected.path !== input.path
    )
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Managed file replacement input is inconsistent.",
          { path: input.path },
        ),
      );
    const target = await resolveSafeRepositoryTarget(input.root, input.path);
    if (target.status === ResultStatus.Failure) return target;
    const current = await this.readActual(target.value, input.path);
    if (current.status === ResultStatus.Failure) return current;
    if (!sameActualState(current.value, input.expected))
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Managed file changed after InstallPlan creation.",
          { path: input.path },
        ),
      );

    let mutationStarted = false;
    try {
      mutationStarted = true;
      await mkdir(dirname(target.value), { recursive: true });
      const revalidated = await resolveSafeRepositoryTarget(input.root, input.path);
      if (revalidated.status === ResultStatus.Failure) throw revalidated.error;
      if (revalidated.value !== target.value)
        throw new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "Managed file path identity changed before replacement.",
          { path: input.path },
        );
      const afterDirectoryCreation = await this.readActual(target.value, input.path);
      if (
        afterDirectoryCreation.status === ResultStatus.Failure ||
        !sameActualState(afterDirectoryCreation.value, input.expected)
      )
        throw new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Managed file changed before atomic replacement.",
          { path: input.path },
          afterDirectoryCreation.status === ResultStatus.Failure
            ? afterDirectoryCreation.error
            : undefined,
        );
      await writeFileAtomic(target.value, input.content, { encoding: "utf8", fsync: true });
      await this.parentDirectoryDurability.syncParentDirectory(target.value);
      const verified = await this.readActual(target.value, input.path);
      if (
        verified.status === ResultStatus.Failure ||
        verified.value.kind !== ManagedFileActualKind.RegularFile ||
        verified.value.digest !== input.digest
      )
        throw new Error("Managed file postcondition verification failed.");
      return verified;
    } catch (error) {
      return failure(
        mutationStarted
          ? new HarnessError(
              HarnessErrorCode.InstallationCommitOutcomeUnknown,
              "Managed file mutation started but its durable outcome is unknown.",
              { path: input.path },
              error,
            )
          : asIoError(error, input.path),
      );
    }
  }

  private async readActual(
    target: string,
    path: string,
  ): Promise<Result<ActualManagedFileState, HarnessError>> {
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink())
        return success({ path, kind: ManagedFileActualKind.Unsupported });
      const content = await readFile(target, "utf8");
      const digest = this.digest.calculate(content);
      return digest.status === ResultStatus.Failure
        ? digest
        : success({ path, kind: ManagedFileActualKind.RegularFile, digest: digest.value });
    } catch (error) {
      return isNodeError(error) && error.code === "ENOENT"
        ? success({ path, kind: ManagedFileActualKind.Missing })
        : failure(asIoError(error, path));
    }
  }
}

function sameActualState(left: ActualManagedFileState, right: ActualManagedFileState): boolean {
  return (
    left.path === right.path &&
    left.kind === right.kind &&
    (left.kind !== ManagedFileActualKind.RegularFile || left.digest === right.digest)
  );
}

function asIoError(error: unknown, path: string): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(
        HarnessErrorCode.IoFailure,
        "Unable to mutate managed file.",
        { path },
        error,
      );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
