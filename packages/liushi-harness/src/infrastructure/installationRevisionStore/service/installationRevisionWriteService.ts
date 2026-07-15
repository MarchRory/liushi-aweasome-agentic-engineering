import type {
  AppendInstallationRevisionEventInput,
  InstallationRevisionReservation,
  ReserveInstallationRevisionIntentInput,
} from "#application/ports/index.js";
import { InstallationRevisionReservationDisposition } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  type InstallationRevisionRecord,
  type InstallationRevisionState,
} from "#domain/installation/index.js";
import type { ExclusiveFileLockHandle } from "#infrastructure/persistence/fileEventStore/index.js";

import {
  combineInstallationRevisionErrors,
  createInstallationRevisionCommitOutcomeUnknownError,
  createInstallationRevisionNotFoundError,
  mapInstallationRevisionStoreError,
} from "../errors/index.js";
import { releaseInstallationRevisionLocks } from "../locking/index.js";
import { calculateInstallationRevisionIdempotencyDigestToken } from "../lookup/index.js";
import type { InstallationRevisionRecordLookup } from "../lookup/index.js";
import type { FileInstallationRevisionStoreDependencies } from "../contracts/index.js";
import { writeInstallationRevisionRecordFile } from "../io/index.js";
import {
  resolveInstallationRevisionApprovalLockFile,
  resolveInstallationRevisionLockFile,
  resolveInstallationRevisionRecordFile,
  resolveInstallationRevisionRepositoryPaths,
} from "../path/index.js";
import type { InstallationRevisionPathSafety } from "../safety/index.js";
import type { InstallationRevisionStateFactory } from "../state/index.js";
import { validateInstallationRevisionLocator } from "./installationRevisionStoreInput.js";
import {
  validateInstallationRevisionEvent,
  verifyInstallationRevisionIntentIntegrity,
} from "../validation/index.js";

/** 承担 Revision reservation、CAS 事件追加与耐久化清理。 */
export class InstallationRevisionWriteService {
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: FileInstallationRevisionStoreDependencies,
    private readonly pathSafety: InstallationRevisionPathSafety,
    private readonly lookup: InstallationRevisionRecordLookup,
    private readonly stateFactory: InstallationRevisionStateFactory,
  ) {}

  /** 以 approval 锁优先、Revision 锁随后获取的顺序持久化 Intent。 */
  public async reserveIntent(
    input: ReserveInstallationRevisionIntentInput,
  ): Promise<Result<InstallationRevisionReservation, HarnessErrorType>> {
    const verified = verifyInstallationRevisionIntentIntegrity(
      input.intent,
      this.dependencies.digest,
    );
    if (verified.status === ResultStatus.Failure) return verified;
    const intent = verified.value;
    const token = calculateInstallationRevisionIdempotencyDigestToken(
      intent.approval.idempotencyKey,
      this.dependencies.digest,
    );
    if (token.status === ResultStatus.Failure) return token;
    const paths = resolveInstallationRevisionRepositoryPaths(
      this.storeRoot,
      intent.plan.workspaceId,
      intent.plan.repositoryId,
    );
    const approvalLockFile = resolveInstallationRevisionApprovalLockFile(paths, token.value);
    const revisionLockFile = resolveInstallationRevisionLockFile(paths, intent.revisionId);
    const safePaths = await this.pathSafety.validateWritePaths(intent.plan.root, [
      paths.recordsDirectory,
      paths.locksDirectory,
      approvalLockFile,
      revisionLockFile,
    ]);
    if (safePaths.status === ResultStatus.Failure) return safePaths;

    const locks: ExclusiveFileLockHandle[] = [];
    let writeStarted = false;
    let durabilityRecoveryStarted = false;
    let value: InstallationRevisionReservation | undefined;
    let operationError: unknown;
    try {
      locks.push(
        await this.dependencies.lockManager.acquire(approvalLockFile, {
          workspaceId: intent.plan.workspaceId,
          taskId: intent.approval.planId,
        }),
      );
      const existing = await this.lookup.findUniqueByIdempotencyDigest(paths, token.value);
      if (existing !== undefined) {
        const state = await this.lookup.loadLocatedRecord(
          paths,
          existing,
          intent.plan.workspaceId,
          intent.plan.repositoryId,
        );
        this.stateFactory.assertSameReservationSemantics(state.record.intent, intent);
        durabilityRecoveryStarted = true;
        await this.dependencies.parentDirectoryDurability.syncParentDirectory(existing.filePath);
        durabilityRecoveryStarted = false;
        value = {
          disposition: InstallationRevisionReservationDisposition.Existing,
          state,
        };
      } else {
        locks.push(
          await this.dependencies.lockManager.acquire(revisionLockFile, {
            workspaceId: intent.plan.workspaceId,
            taskId: intent.revisionId,
          }),
        );
        const retriedExisting = await this.lookup.findUniqueByIdempotencyDigest(paths, token.value);
        if (retriedExisting !== undefined) {
          const state = await this.lookup.loadLocatedRecord(
            paths,
            retriedExisting,
            intent.plan.workspaceId,
            intent.plan.repositoryId,
          );
          this.stateFactory.assertSameReservationSemantics(state.record.intent, intent);
          durabilityRecoveryStarted = true;
          await this.dependencies.parentDirectoryDurability.syncParentDirectory(
            retriedExisting.filePath,
          );
          durabilityRecoveryStarted = false;
          value = {
            disposition: InstallationRevisionReservationDisposition.Existing,
            state,
          };
        } else {
          const sameRevision = await this.lookup.findUniqueByRevision(paths, intent.revisionId);
          if (sameRevision !== undefined) {
            await this.lookup.loadLocatedRecord(
              paths,
              sameRevision,
              intent.plan.workspaceId,
              intent.plan.repositoryId,
            );
            throw new HarnessError(
              HarnessErrorCode.VersionConflict,
              "Installation Revision ID is already bound to another idempotency key.",
            );
          }
          const initial = this.stateFactory.createInitialState(intent);
          if (initial.status === ResultStatus.Failure) throw initial.error;
          const recordFile = resolveInstallationRevisionRecordFile(
            paths,
            intent.revisionId,
            token.value,
          );
          writeStarted = true;
          await this.writeRecord(recordFile, initial.value.record);
          await this.dependencies.parentDirectoryDurability.syncParentDirectory(recordFile);
          value = {
            disposition: InstallationRevisionReservationDisposition.Acquired,
            state: initial.value,
          };
        }
      }
    } catch (error) {
      operationError = error;
    }

    const releaseError = await releaseInstallationRevisionLocks(locks);
    if (operationError !== undefined || releaseError !== undefined) {
      const cause = combineInstallationRevisionErrors(operationError, releaseError);
      return failure(
        writeStarted || durabilityRecoveryStarted
          ? createInstallationRevisionCommitOutcomeUnknownError(
              cause,
              value?.state.record.revisionId,
              [approvalLockFile, revisionLockFile],
            )
          : mapInstallationRevisionStoreError(
              cause,
              "Unable to reserve Installation Revision intent.",
            ),
      );
    }
    if (value === undefined)
      return failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Installation Revision reservation did not produce a result.",
        ),
      );
    return success(value);
  }

  /** 在 Revision 锁保护下执行 recordDigest CAS 事件追加。 */
  public async appendEvent(
    input: AppendInstallationRevisionEventInput,
  ): Promise<Result<InstallationRevisionState, HarnessErrorType>> {
    const locator = validateInstallationRevisionLocator(input);
    if (locator.status === ResultStatus.Failure) return locator;
    const expectedDigest = parseContentDigest(input.expectedRecordDigest);
    if (expectedDigest.status === ResultStatus.Failure) return expectedDigest;
    const event = validateInstallationRevisionEvent(input.event);
    if (event.status === ResultStatus.Failure) return event;
    const paths = resolveInstallationRevisionRepositoryPaths(
      this.storeRoot,
      locator.value.workspaceId,
      locator.value.repositoryId,
    );
    const lockFile = resolveInstallationRevisionLockFile(paths, locator.value.revisionId);
    const safePaths = await this.pathSafety.validateDerivedPaths([
      paths.recordsDirectory,
      paths.locksDirectory,
      lockFile,
    ]);
    if (safePaths.status === ResultStatus.Failure) return safePaths;

    let lock: ExclusiveFileLockHandle | undefined;
    let writeStarted = false;
    let value: InstallationRevisionState | undefined;
    let operationError: unknown;
    try {
      lock = await this.dependencies.lockManager.acquire(lockFile, {
        workspaceId: locator.value.workspaceId,
        taskId: locator.value.revisionId,
      });
      const located = await this.lookup.findUniqueByRevision(paths, locator.value.revisionId);
      if (located === undefined)
        throw createInstallationRevisionNotFoundError(locator.value.revisionId);
      const current = await this.lookup.loadLocatedRecord(
        paths,
        located,
        locator.value.workspaceId,
        locator.value.repositoryId,
      );
      const isolation = await this.pathSafety.validateRepositoryIsolation(
        current.record.intent.plan.root,
      );
      if (isolation.status === ResultStatus.Failure) throw isolation.error;
      if (current.record.recordDigest !== expectedDigest.value)
        throw new HarnessError(
          HarnessErrorCode.VersionConflict,
          "Installation Revision record digest no longer matches the CAS precondition.",
        );

      const next = this.stateFactory.createNextState(current.record, event.value);
      if (next.status === ResultStatus.Failure) throw next.error;
      writeStarted = true;
      await this.writeRecord(located.filePath, next.value.record);
      await this.dependencies.parentDirectoryDurability.syncParentDirectory(located.filePath);
      value = next.value;
    } catch (error) {
      operationError = error;
    }

    const releaseError =
      lock === undefined ? undefined : await releaseInstallationRevisionLocks([lock]);
    if (operationError !== undefined || releaseError !== undefined) {
      const cause = combineInstallationRevisionErrors(operationError, releaseError);
      return failure(
        writeStarted
          ? createInstallationRevisionCommitOutcomeUnknownError(cause, locator.value.revisionId, [
              lockFile,
            ])
          : mapInstallationRevisionStoreError(
              cause,
              "Unable to append Installation Revision event.",
            ),
      );
    }
    return value === undefined
      ? failure(
          new HarnessError(
            HarnessErrorCode.IoFailure,
            "Installation Revision append did not produce a result.",
          ),
        )
      : success(value);
  }

  private writeRecord(filePath: string, record: InstallationRevisionRecord): Promise<void> {
    return (
      this.dependencies.recordWriter?.write(filePath, record) ??
      writeInstallationRevisionRecordFile(filePath, record)
    );
  }
}
