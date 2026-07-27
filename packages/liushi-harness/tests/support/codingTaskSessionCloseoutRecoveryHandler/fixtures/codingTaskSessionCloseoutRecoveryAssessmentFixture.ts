import {
  ChangeSetCheckpointRecoveryStatus,
  type ChangeSetCheckpointRecoveryAssessment,
} from "../../../../src/application/changeSetCheckpoint/index.js";
import {
  CodingTaskSessionCloseoutRecoveryDiagnostic,
  CodingTaskSessionCloseoutRecoveryDisposition,
  CodingTaskSessionCloseoutRecoveryResolution,
  type CodingTaskSessionCloseoutRecoveryAssessmentInternal,
} from "../../../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import {
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionCloseoutStatus,
} from "../../../../src/application/codingTaskSessionCloseoutState/index.js";
import { HarnessErrorCode, type ContentDigest } from "../../../../src/common/index.js";
import type { CodingTaskSessionChangeSetSnapshot } from "../../../../src/domain/codingTaskSessionChangeSet/index.js";
import {
  codingTask,
  digestOf,
  repository,
  session,
  sourceTask,
  workspace,
} from "../../codingTaskSessionCloseout/index.js";

/** 构造锁内 fresh Recovery Assessment。 */
export function freshRecoveryAssessment(
  currentSnapshot: CodingTaskSessionChangeSetSnapshot,
  recovery: ChangeSetCheckpointRecoveryAssessment,
  assessmentDigest: ContentDigest,
  resolution: CodingTaskSessionCloseoutRecoveryResolution,
): CodingTaskSessionCloseoutRecoveryAssessmentInternal {
  const checkpointBindingDigest =
    recovery.status === ChangeSetCheckpointRecoveryStatus.Present
      ? recovery.checkpoint.bindingDigest
      : null;
  return {
    assessment: {
      schemaVersion: "coding-task-session.closeout-recovery-assessment.v1",
      workspaceId: workspace,
      sessionId: session,
      codingTaskId: codingTask,
      sourceTaskId: sourceTask,
      repositoryId: repository,
      attemptNumber: 1,
      worktreeId: currentSnapshot.worktreeId,
      branchName: currentSnapshot.branchName,
      repositoryRootDigest: digestOf({ root: "repository" }),
      worktreeRootDigest: digestOf({ root: "worktree" }),
      baseRevision: currentSnapshot.baseRevision,
      writeSet: currentSnapshot.writeSet,
      closeoutSchemaVersion: "coding-task-session.closeout-state.v3",
      closeoutVersion: 3,
      closeoutStatus: CodingTaskSessionCloseoutStatus.Blocked,
      closeoutStoppedStage: CodingTaskSessionCloseoutStage.SnapshotPersisted,
      closeoutErrorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied,
      closeoutStateDigest: digestOf({ closeout: "handler" }),
      snapshotDigest: currentSnapshot.snapshotDigest,
      coverageBindingDigest: digestOf({ coverage: "handler" }),
      checkpointStatus: recovery.status,
      checkpointBindingDigest,
      disposition: CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable,
      allowedResolution: resolution,
      diagnostic:
        resolution === CodingTaskSessionCloseoutRecoveryResolution.RetryOnce
          ? CodingTaskSessionCloseoutRecoveryDiagnostic.RetryAvailable
          : CodingTaskSessionCloseoutRecoveryDiagnostic.BindExistingAvailable,
      assessmentDigest,
      evidenceIds: [],
    },
    authority: {
      activation: { workspaceId: workspace, sessionId: session, repositoryId: repository },
    } as never,
    state: { snapshot: currentSnapshot } as never,
    checkpointInput: {} as never,
    checkpointRecovery: recovery,
  };
}
