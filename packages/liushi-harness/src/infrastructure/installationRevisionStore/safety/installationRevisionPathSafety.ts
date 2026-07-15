import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  hasSymbolicLinkBetween,
  pathContains,
  pathsOverlap,
  resolveCanonicalPathIdentity,
} from "#infrastructure/system/platformCompatibility/index.js";

/** 校验 Runtime Store 与派生 Revision 路径的隔离边界。 */
export class InstallationRevisionPathSafety {
  public constructor(private readonly storeRoot: string) {}

  /** 校验仓库根目录隔离后，再校验所有待写入路径。 */
  public async validateWritePaths(
    repositoryRoot: string,
    candidates: readonly string[],
  ): Promise<Result<void, HarnessErrorType>> {
    const isolation = await this.validateRepositoryIsolation(repositoryRoot);
    return isolation.status === ResultStatus.Failure
      ? isolation
      : this.validateDerivedPaths(candidates);
  }

  /** 确认 Runtime Store 与业务 Repository 不重叠。 */
  public async validateRepositoryIsolation(
    repositoryRoot: string,
  ): Promise<Result<void, HarnessErrorType>> {
    try {
      const [canonicalStoreRoot, canonicalRepositoryRoot] = await Promise.all([
        resolveCanonicalPathIdentity(this.storeRoot),
        resolveCanonicalPathIdentity(repositoryRoot),
      ]);
      return pathsOverlap(canonicalStoreRoot, canonicalRepositoryRoot)
        ? failure(
            new HarnessError(
              HarnessErrorCode.OperationForbidden,
              "Runtime Store must be isolated from the Repository root.",
            ),
          )
        : success(undefined);
    } catch (error) {
      return failure(mapPathSafetyError(error, "Unable to validate Runtime Store isolation."));
    }
  }

  /** 确认派生路径位于非符号链接的 Runtime Store 内部。 */
  public async validateDerivedPaths(
    candidates: readonly string[],
  ): Promise<Result<void, HarnessErrorType>> {
    try {
      const canonicalStoreRoot = await resolveCanonicalPathIdentity(this.storeRoot);
      for (const candidate of candidates) {
        const canonicalCandidate = await resolveCanonicalPathIdentity(candidate);
        if (
          (await hasSymbolicLinkBetween(this.storeRoot, candidate)) ||
          !pathContains(canonicalStoreRoot, canonicalCandidate)
        )
          return failure(
            new HarnessError(
              HarnessErrorCode.OperationForbidden,
              "Installation Revision paths must remain inside a non-symbolic Runtime Store.",
            ),
          );
      }
      return success(undefined);
    } catch (error) {
      return failure(mapPathSafetyError(error, "Unable to validate Installation Revision paths."));
    }
  }
}

function mapPathSafetyError(error: unknown, message: string): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(HarnessErrorCode.IoFailure, message, {}, error);
}
