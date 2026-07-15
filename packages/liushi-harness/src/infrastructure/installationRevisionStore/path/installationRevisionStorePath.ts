import { resolve } from "node:path";

import type { InstallationRevisionId } from "#domain/installation/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import {
  INSTALLATION_REVISION_LOCKS_DIRECTORY,
  INSTALLATION_REVISION_RECORD_FILE_PATTERN,
  INSTALLATION_REVISION_RECORDS_DIRECTORY,
  INSTALLATION_REVISION_STORE_DIRECTORY,
} from "../constants/index.js";
import type {
  InstallationRevisionRecordFileIdentity,
  InstallationRevisionRepositoryPaths,
} from "../contracts/index.js";

/** 派生单个 Workspace/Repository 的 Revision 记录与锁目录。 */
export function resolveInstallationRevisionRepositoryPaths(
  storeRoot: string,
  workspaceId: WorkspaceId,
  repositoryId: RepositoryId,
): InstallationRevisionRepositoryPaths {
  const repositoryDirectory = resolve(
    storeRoot,
    INSTALLATION_REVISION_STORE_DIRECTORY,
    workspaceId,
    repositoryId,
  );
  return {
    repositoryDirectory,
    recordsDirectory: resolve(repositoryDirectory, INSTALLATION_REVISION_RECORDS_DIRECTORY),
    locksDirectory: resolve(repositoryDirectory, INSTALLATION_REVISION_LOCKS_DIRECTORY),
  };
}

/** 以幂等键摘要派生 Reservation 排他锁。 */
export function resolveInstallationRevisionApprovalLockFile(
  paths: InstallationRevisionRepositoryPaths,
  idempotencyDigestToken: string,
): string {
  return resolve(paths.locksDirectory, `approval.${idempotencyDigestToken}.lock`);
}

/** 以 Revision ID 派生 CAS 与唯一性排他锁。 */
export function resolveInstallationRevisionLockFile(
  paths: InstallationRevisionRepositoryPaths,
  revisionId: InstallationRevisionId,
): string {
  return resolve(paths.locksDirectory, `revision.${revisionId}.lock`);
}

/** 派生同时绑定 Revision ID 与幂等键摘要的单一权威记录路径。 */
export function resolveInstallationRevisionRecordFile(
  paths: InstallationRevisionRepositoryPaths,
  revisionId: InstallationRevisionId,
  idempotencyDigestToken: string,
): string {
  return resolve(paths.recordsDirectory, `${revisionId}.${idempotencyDigestToken}.json`);
}

/** 严格解析权威记录文件名，不接受多余前后缀。 */
export function parseInstallationRevisionRecordFileName(
  fileName: string,
): InstallationRevisionRecordFileIdentity | undefined {
  const matched = INSTALLATION_REVISION_RECORD_FILE_PATTERN.exec(fileName);
  if (matched === null) return undefined;
  const revisionId = matched[1];
  const idempotencyDigestToken = matched[2];
  return revisionId === undefined || idempotencyDigestToken === undefined
    ? undefined
    : { revisionId, idempotencyDigestToken };
}
