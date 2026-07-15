import type { ManagedFileMutationPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";
import {
  InstallationRevisionEventType,
  MANAGED_FILES_MANIFEST_PATH,
  type InstallationRevisionState,
} from "#domain/installation/index.js";

import { appendInstallationRevisionEvent } from "../checkpoint/index.js";
import {
  completeInstallationRevision,
  type CommittedInstallationRevisionState,
  type InstallationRevisionCompletionDependencies,
} from "../recovery/index.js";
import { installationManifestActual, writableInstallationFiles } from "../support/index.js";

/** Fresh Revision 写入阶段所需的依赖。 */
export interface InstallationFreshExecutionDependencies extends InstallationRevisionCompletionDependencies {
  /** 对受管文件执行带前置条件的原子替换。 */
  readonly mutation: ManagedFileMutationPort;
}

/** 按计划顺序写入文件、Manifest，并完成 Revision checkpoint。 */
export async function executeFreshInstallationRevision(
  initial: InstallationRevisionState,
  dependencies: InstallationFreshExecutionDependencies,
): Promise<Result<CommittedInstallationRevisionState, HarnessError>> {
  if (initial.record.events.length !== 0)
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidStateTransition,
        "Fresh installation execution requires an event-free Revision.",
        { revisionId: initial.record.revisionId },
      ),
    );
  let state = initial;
  const plan = state.record.intent.plan;
  for (const file of writableInstallationFiles(plan)) {
    const replaced = await dependencies.mutation.replace({
      root: plan.root,
      path: file.path,
      expected: file.actual,
      content: file.desired.content,
      digest: file.desired.digest,
    });
    if (replaced.status === ResultStatus.Failure) return replaced;
    const checkpoint = await appendInstallationRevisionEvent(dependencies.revisionStore, state, {
      type: InstallationRevisionEventType.FileApplied,
      path: file.path,
      recordedAt: dependencies.clock.now().toISOString(),
    });
    if (checkpoint.status === ResultStatus.Failure) return checkpoint;
    state = checkpoint.value;
  }
  const manifest = state.record.intent.manifestAfter;
  const replacedManifest = await dependencies.mutation.replace({
    root: plan.root,
    path: MANAGED_FILES_MANIFEST_PATH,
    expected: installationManifestActual(plan),
    content: manifest.content,
    digest: manifest.digest,
  });
  if (replacedManifest.status === ResultStatus.Failure) return replacedManifest;
  const manifestCheckpoint = await appendInstallationRevisionEvent(
    dependencies.revisionStore,
    state,
    {
      type: InstallationRevisionEventType.ManifestApplied,
      recordedAt: dependencies.clock.now().toISOString(),
    },
  );
  if (manifestCheckpoint.status === ResultStatus.Failure) return manifestCheckpoint;
  state = manifestCheckpoint.value;
  return completeInstallationRevision(state, dependencies);
}
