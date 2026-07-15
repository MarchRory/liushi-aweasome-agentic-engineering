import type { ContentDigestPort } from "#application/ports/index.js";
import { ResultStatus, type HarnessError as HarnessErrorType, type Result } from "#common/index.js";
import {
  INSTALLATION_REVISION_SCHEMA_VERSION,
  calculateInstallationRevisionRecordDigest,
  replayInstallationRevision,
  type InstallationRevisionIntent,
  type InstallationRevisionRecord,
  type InstallationRevisionState,
} from "#domain/installation/index.js";

import { createInstallationRevisionApprovalConflictError } from "../errors/index.js";
import {
  calculateInstallationApprovalSemanticDigest,
  verifyInstallationRevisionRecordIntegrity,
} from "../validation/index.js";

/** 创建并校验 Installation Revision 的初始与后续状态。 */
export class InstallationRevisionStateFactory {
  public constructor(private readonly digest: ContentDigestPort) {}

  /** 为完整 Intent 创建唯一的初始记录状态。 */
  public createInitialState(
    intent: InstallationRevisionIntent,
  ): Result<InstallationRevisionState, HarnessErrorType> {
    const base = {
      schemaVersion: INSTALLATION_REVISION_SCHEMA_VERSION,
      revisionId: intent.revisionId,
      intent,
      events: [],
    } satisfies Omit<InstallationRevisionRecord, "recordDigest">;
    const recordDigest = calculateInstallationRevisionRecordDigest(
      (value) => this.digest.calculate(value),
      base,
    );
    if (recordDigest.status === ResultStatus.Failure) return recordDigest;
    return verifyInstallationRevisionRecordIntegrity(
      { ...base, recordDigest: recordDigest.value },
      this.digest,
      {
        workspaceId: intent.plan.workspaceId,
        repositoryId: intent.plan.repositoryId,
        revisionId: intent.revisionId,
      },
    );
  }

  /** 在追加事件后重算记录摘要并重放 Revision 状态。 */
  public createNextState(
    current: InstallationRevisionRecord,
    event: InstallationRevisionRecord["events"][number],
  ): Result<InstallationRevisionState, HarnessErrorType> {
    const base = {
      schemaVersion: current.schemaVersion,
      revisionId: current.revisionId,
      intent: current.intent,
      events: [...current.events, event],
    } satisfies Omit<InstallationRevisionRecord, "recordDigest">;
    const recordDigest = calculateInstallationRevisionRecordDigest(
      (value) => this.digest.calculate(value),
      base,
    );
    if (recordDigest.status === ResultStatus.Failure) return recordDigest;
    return replayInstallationRevision({ ...base, recordDigest: recordDigest.value });
  }

  /** 比较重试请求是否只改变了允许变化的 Revision 派生字段。 */
  public assertSameReservationSemantics(
    existing: InstallationRevisionIntent,
    requested: InstallationRevisionIntent,
  ): void {
    const [existingDigest, requestedDigest] = [
      calculateInstallationApprovalSemanticDigest(existing, this.digest),
      calculateInstallationApprovalSemanticDigest(requested, this.digest),
    ];
    if (existingDigest.status === ResultStatus.Failure) throw existingDigest.error;
    if (requestedDigest.status === ResultStatus.Failure) throw requestedDigest.error;
    if (existingDigest.value !== requestedDigest.value)
      throw createInstallationRevisionApprovalConflictError();
  }
}
