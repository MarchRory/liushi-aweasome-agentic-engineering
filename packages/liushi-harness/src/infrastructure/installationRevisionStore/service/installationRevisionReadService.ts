import type {
  FindInstallationRevisionByApprovalInput,
  InstallationRevisionLocator,
  ContentDigestPort,
  VerifyManagedOwnershipInput,
} from "#application/ports/index.js";
import {
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  InstallationRevisionStatus,
  type InstallationRevisionState,
} from "#domain/installation/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import {
  createInstallationRevisionApprovalConflictError,
  createInstallationRevisionNotFoundError,
  mapInstallationRevisionStoreError,
} from "../errors/index.js";
import { calculateInstallationRevisionIdempotencyDigestToken } from "../lookup/index.js";
import type { InstallationRevisionRecordLookup } from "../lookup/index.js";
import { resolveInstallationRevisionRepositoryPaths } from "../path/index.js";
import type { InstallationRevisionPathSafety } from "../safety/index.js";
import {
  hasInstallationRevisionApprovalScope,
  validateInstallationRevisionApprovalLookup,
  validateInstallationRevisionLocator,
} from "./installationRevisionStoreInput.js";
import { hasSameManagedOwnershipFields, parseManagedOwnershipClaim } from "../validation/index.js";

/** 承担 Revision Store 的查询、加载和 ownership 验证。 */
export class InstallationRevisionReadService {
  public constructor(
    private readonly storeRoot: string,
    private readonly digest: ContentDigestPort,
    private readonly pathSafety: InstallationRevisionPathSafety,
    private readonly lookup: InstallationRevisionRecordLookup,
  ) {}

  /** 按 approval 幂等域查找并校验唯一权威记录。 */
  public async findByApproval(
    input: FindInstallationRevisionByApprovalInput,
  ): Promise<Result<InstallationRevisionState | undefined, HarnessErrorType>> {
    const validated = validateInstallationRevisionApprovalLookup(input);
    if (validated.status === ResultStatus.Failure) return validated;
    const token = calculateInstallationRevisionIdempotencyDigestToken(
      validated.value.idempotencyKey,
      this.digest,
    );
    if (token.status === ResultStatus.Failure) return token;
    const paths = resolveInstallationRevisionRepositoryPaths(
      this.storeRoot,
      validated.value.workspaceId,
      validated.value.repositoryId,
    );
    const safePaths = await this.pathSafety.validateDerivedPaths([paths.recordsDirectory]);
    if (safePaths.status === ResultStatus.Failure) return safePaths;
    try {
      const located = await this.lookup.findUniqueByIdempotencyDigest(paths, token.value);
      if (located === undefined) return success(undefined);
      const state = await this.lookup.loadLocatedRecord(
        paths,
        located,
        validated.value.workspaceId,
        validated.value.repositoryId,
      );
      const isolation = await this.pathSafety.validateRepositoryIsolation(
        state.record.intent.plan.root,
      );
      if (isolation.status === ResultStatus.Failure) return isolation;
      return hasInstallationRevisionApprovalScope(state.record.intent, validated.value)
        ? success(state)
        : failure(createInstallationRevisionApprovalConflictError());
    } catch (error) {
      return failure(
        mapInstallationRevisionStoreError(
          error,
          "Unable to find Installation Revision by approval.",
        ),
      );
    }
  }

  /** 按 Revision ID 查找并完整校验权威记录。 */
  public async load(
    input: InstallationRevisionLocator,
  ): Promise<Result<InstallationRevisionState, HarnessErrorType>> {
    const locator = validateInstallationRevisionLocator(input);
    if (locator.status === ResultStatus.Failure) return locator;
    const paths = resolveInstallationRevisionRepositoryPaths(
      this.storeRoot,
      locator.value.workspaceId,
      locator.value.repositoryId,
    );
    const safePaths = await this.pathSafety.validateDerivedPaths([paths.recordsDirectory]);
    if (safePaths.status === ResultStatus.Failure) return safePaths;
    try {
      const located = await this.lookup.findUniqueByRevision(paths, locator.value.revisionId);
      if (located === undefined)
        return failure(createInstallationRevisionNotFoundError(locator.value.revisionId));
      const state = await this.lookup.loadLocatedRecord(
        paths,
        located,
        locator.value.workspaceId,
        locator.value.repositoryId,
      );
      const isolation = await this.pathSafety.validateRepositoryIsolation(
        state.record.intent.plan.root,
      );
      return isolation.status === ResultStatus.Failure ? isolation : success(state);
    } catch (error) {
      return failure(
        mapInstallationRevisionStoreError(error, "Unable to load Installation Revision."),
      );
    }
  }

  /** 只根据已提交 Revision 的权威 Manifest 验证 ownership claim。 */
  public async verify(
    input: VerifyManagedOwnershipInput,
  ): Promise<Result<boolean, HarnessErrorType>> {
    const workspaceId = parseWorkspaceId(input.workspaceId);
    const claim = parseManagedOwnershipClaim(input.claim);
    if (workspaceId.status === ResultStatus.Failure || claim === undefined) return success(false);
    const loaded = await this.load({
      workspaceId: workspaceId.value,
      repositoryId: claim.repositoryId,
      revisionId: claim.installationRevisionId,
    });
    if (loaded.status === ResultStatus.Failure)
      return loaded.error.code === HarnessErrorCode.InstallationRevisionNotFound
        ? success(false)
        : loaded;
    if (loaded.value.status !== InstallationRevisionStatus.Committed) return success(false);
    const authoritative = loaded.value.record.intent.manifestAfter.entries.find(
      (entry) =>
        entry.path === claim.path && entry.installationRevisionId === claim.installationRevisionId,
    );
    return success(
      authoritative !== undefined && hasSameManagedOwnershipFields(claim, authoritative),
    );
  }
}
