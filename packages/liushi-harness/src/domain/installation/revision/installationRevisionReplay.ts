import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { INSTALLATION_REVISION_SCHEMA_VERSION } from "../constants/index.js";
import type { InstallationRevisionRecord, InstallationRevisionState } from "../contracts/index.js";
import {
  FileInstallAction,
  InstallationRevisionEventType,
  InstallationRevisionStatus,
} from "../enums/index.js";

/** 严格按阶段顺序重放 Installation Revision 事件。 */
export function replayInstallationRevision(
  record: InstallationRevisionRecord,
): Result<InstallationRevisionState, HarnessError> {
  if (
    record.schemaVersion !== INSTALLATION_REVISION_SCHEMA_VERSION ||
    record.revisionId !== record.intent.revisionId
  )
    return invalidRevision("Installation Revision 记录身份或版本不一致。");

  const writablePaths = new Set(
    record.intent.plan.files
      .filter(
        (file) =>
          file.action === FileInstallAction.Create || file.action === FileInstallAction.Update,
      )
      .map((file) => file.path),
  );
  const appliedPaths: string[] = [];
  const appliedPathSet = new Set<string>();
  let status = InstallationRevisionStatus.IntentPersisted;
  let manifestApplied = false;
  let postconditionsVerified = false;
  let committedAt: string | undefined;

  for (const event of record.events) {
    if (committedAt !== undefined)
      return invalidRevision("Installation Revision 终态后禁止追加事件。");
    switch (event.type) {
      case InstallationRevisionEventType.FileApplied:
        if (manifestApplied || !writablePaths.has(event.path) || appliedPathSet.has(event.path))
          return invalidRevision("FileApplied 事件不对应唯一且尚未应用的可写计划项。");
        appliedPathSet.add(event.path);
        appliedPaths.push(event.path);
        status = InstallationRevisionStatus.FilesApplying;
        break;
      case InstallationRevisionEventType.ManifestApplied:
        if (manifestApplied || appliedPathSet.size !== writablePaths.size)
          return invalidRevision("ManifestApplied 前必须完成全部可写文件检查点。");
        manifestApplied = true;
        status = InstallationRevisionStatus.ManifestApplied;
        break;
      case InstallationRevisionEventType.PostconditionsVerified:
        if (!manifestApplied || postconditionsVerified)
          return invalidRevision("PostconditionsVerified 必须紧随 ManifestApplied 阶段。");
        postconditionsVerified = true;
        status = InstallationRevisionStatus.PostconditionsVerified;
        break;
      case InstallationRevisionEventType.Committed:
        if (!postconditionsVerified) return invalidRevision("Committed 前必须完成后置条件验证。");
        committedAt = event.recordedAt;
        status = InstallationRevisionStatus.Committed;
        break;
      default:
        return invalidRevision("Installation Revision 包含未知事件。");
    }
  }

  return success({
    record,
    status,
    appliedPaths,
    manifestApplied,
    postconditionsVerified,
    ...(committedAt === undefined ? {} : { committedAt }),
  });
}

function invalidRevision(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidStateTransition, message));
}
