import type {
  InstallationRevisionStore,
  ManagedFileStateReader,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Clock,
  type Result,
} from "#common/index.js";
import {
  InstallationRevisionEventType,
  InstallationRevisionStatus,
  type InstallationRevisionState,
} from "#domain/installation/index.js";

import { appendInstallationRevisionEvent } from "../checkpoint/index.js";
import { writableInstallationFiles } from "../support/index.js";
import { verifyInstallationPostconditions } from "./installationPostconditionVerifier.js";

/** 已通过状态机证明完成最终提交的 Revision 状态。 */
export type CommittedInstallationRevisionState = InstallationRevisionState & {
  readonly status: InstallationRevisionStatus.Committed;
};

/** Revision 完成 checkpoint 所需的应用层依赖。 */
export interface InstallationRevisionCompletionDependencies {
  /** 持久化 Revision 阶段 checkpoint。 */
  readonly revisionStore: InstallationRevisionStore;
  /** 读取最终文件与 Manifest 现场。 */
  readonly reader: ManagedFileStateReader;
  /** 生成审计 checkpoint 时间。 */
  readonly clock: Clock;
}

/** 验证后补齐缺失 checkpoint，并将 Revision 推进到 Committed。 */
export async function completeInstallationRevision(
  initial: InstallationRevisionState,
  dependencies: InstallationRevisionCompletionDependencies,
): Promise<Result<CommittedInstallationRevisionState, HarnessError>> {
  const postconditions = await verifyInstallationPostconditions(
    initial.record.intent,
    dependencies.reader,
  );
  if (postconditions.status === ResultStatus.Failure) return postconditions;
  let state = initial;
  const appliedPaths = new Set(state.appliedPaths);
  for (const file of writableInstallationFiles(state.record.intent.plan)) {
    if (appliedPaths.has(file.path)) continue;
    const appended = await appendInstallationRevisionEvent(dependencies.revisionStore, state, {
      type: InstallationRevisionEventType.FileApplied,
      path: file.path,
      recordedAt: dependencies.clock.now().toISOString(),
    });
    if (appended.status === ResultStatus.Failure) return appended;
    state = appended.value;
  }
  if (!state.manifestApplied) {
    const appended = await appendInstallationRevisionEvent(dependencies.revisionStore, state, {
      type: InstallationRevisionEventType.ManifestApplied,
      recordedAt: dependencies.clock.now().toISOString(),
    });
    if (appended.status === ResultStatus.Failure) return appended;
    state = appended.value;
  }
  if (!state.postconditionsVerified) {
    const appended = await appendInstallationRevisionEvent(dependencies.revisionStore, state, {
      type: InstallationRevisionEventType.PostconditionsVerified,
      recordedAt: dependencies.clock.now().toISOString(),
    });
    if (appended.status === ResultStatus.Failure) return appended;
    state = appended.value;
  }
  if (state.status !== InstallationRevisionStatus.Committed) {
    const appended = await appendInstallationRevisionEvent(dependencies.revisionStore, state, {
      type: InstallationRevisionEventType.Committed,
      recordedAt: dependencies.clock.now().toISOString(),
    });
    if (appended.status === ResultStatus.Failure) return appended;
    state = appended.value;
  }
  return isCommittedInstallationRevisionState(state)
    ? success(state)
    : failure(
        new HarnessError(
          HarnessErrorCode.InvalidStateTransition,
          "Installation Revision did not reach Committed state.",
          { revisionId: state.record.revisionId },
        ),
      );
}

/** 判断 Revision 是否已达到提交状态。 */
export function isCommittedInstallationRevisionState(
  state: InstallationRevisionState,
): state is CommittedInstallationRevisionState {
  return state.status === InstallationRevisionStatus.Committed;
}
