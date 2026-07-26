import { HarnessErrorCode } from "#common/index.js";

import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_CORRUPT_STORE,
  CLI_EXIT_CODE_INVALID_INPUT,
  CLI_EXIT_CODE_IO_FAILURE,
  CLI_EXIT_CODE_NOT_FOUND,
  CLI_EXIT_CODE_OUTCOME_UNKNOWN,
  CLI_EXIT_CODE_UNAVAILABLE,
} from "../constants/index.js";

/** 将领域错误映射为 CLI 稳定退出码。 */
export function mapErrorExitCode(code: HarnessErrorCode): number {
  switch (code) {
    case HarnessErrorCode.InvalidInput:
      return CLI_EXIT_CODE_INVALID_INPUT;
    case HarnessErrorCode.TaskNotFound:
    case HarnessErrorCode.WorkflowNotFound:
    case HarnessErrorCode.ActionNotFound:
    case HarnessErrorCode.CodingTaskNotFound:
    case HarnessErrorCode.EvidenceBundleNotFound:
    case HarnessErrorCode.ExecutorCompatibilityEvidenceNotFound:
    case HarnessErrorCode.ExecutorCompatibilityMatrixNotFound:
    case HarnessErrorCode.InstallationRevisionNotFound:
      return CLI_EXIT_CODE_NOT_FOUND;
    case HarnessErrorCode.TaskAlreadyExists:
    case HarnessErrorCode.WorkflowAlreadyExists:
    case HarnessErrorCode.InvalidStateTransition:
    case HarnessErrorCode.WorkspaceBusy:
    case HarnessErrorCode.VersionConflict:
    case HarnessErrorCode.PreconditionNotMet:
    case HarnessErrorCode.OperationForbidden:
    case HarnessErrorCode.DecisionConflict:
    case HarnessErrorCode.ActionConflict:
    case HarnessErrorCode.CodingTaskAlreadyExists:
    case HarnessErrorCode.EvidenceBundleConflict:
    case HarnessErrorCode.InstallationRecoveryRequired:
    case HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed:
    case HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied:
      return CLI_EXIT_CODE_CONFLICT;
    case HarnessErrorCode.LockUnavailable:
    case HarnessErrorCode.ExecutorCompatibilityAttestationSigningFailed:
      return CLI_EXIT_CODE_UNAVAILABLE;
    case HarnessErrorCode.CorruptStore:
      return CLI_EXIT_CODE_CORRUPT_STORE;
    case HarnessErrorCode.IoFailure:
      return CLI_EXIT_CODE_IO_FAILURE;
    case HarnessErrorCode.EventLogCommitOutcomeUnknown:
    case HarnessErrorCode.ActionJournalCommitOutcomeUnknown:
    case HarnessErrorCode.ActionExecutionLockReleaseUnknown:
    case HarnessErrorCode.CommandGatewayCommitOutcomeUnknown:
    case HarnessErrorCode.EvidenceBundleCommitOutcomeUnknown:
    case HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown:
    case HarnessErrorCode.ExecutorCompatibilityPublicationCommitOutcomeUnknown:
    case HarnessErrorCode.ExecutorCompatibilityReleaseArtifactCommitOutcomeUnknown:
    case HarnessErrorCode.InstallationCommitOutcomeUnknown:
    case HarnessErrorCode.HookBindingCommitOutcomeUnknown:
    case HarnessErrorCode.HookBindingLockReleaseUnknown:
    case HarnessErrorCode.CodingTaskSessionActivationCommitOutcomeUnknown:
    case HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown:
    case HarnessErrorCode.CodingTaskSessionAdmissionLockReleaseUnknown:
    case HarnessErrorCode.CodingTaskSessionCloseoutCommitOutcomeUnknown:
    case HarnessErrorCode.CodingTaskSessionCloseoutLockReleaseUnknown:
    case HarnessErrorCode.CodingTaskSessionCloseoutOutcomeUnknown:
    case HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown:
      return CLI_EXIT_CODE_OUTCOME_UNKNOWN;
  }
}
