import type { InstallationRevisionStore } from "#application/ports/index.js";
import type { HarnessError, Result } from "#common/index.js";
import type {
  InstallationRevisionEvent,
  InstallationRevisionState,
} from "#domain/installation/index.js";

/** 以当前 Record Digest 为 CAS 前置条件追加单个 Revision checkpoint。 */
export function appendInstallationRevisionEvent(
  store: InstallationRevisionStore,
  state: InstallationRevisionState,
  event: InstallationRevisionEvent,
): Promise<Result<InstallationRevisionState, HarnessError>> {
  const plan = state.record.intent.plan;
  return store.appendEvent({
    workspaceId: plan.workspaceId,
    repositoryId: plan.repositoryId,
    revisionId: state.record.revisionId,
    expectedRecordDigest: state.record.recordDigest,
    event,
  });
}
