import type {
  ActionJournalRepository,
  CodingTaskRepository,
  ContentDigestPort,
  RepositoryRootResolverPort,
  WorktreeProvisionRecoveryInspectorPort,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ActionJournalStatus,
  type ActionIntentRecord,
  type ActionJournalState,
} from "#domain/actionJournal/index.js";
import type { CodingTaskAggregate } from "#domain/codingTask/index.js";

import {
  calculateWorktreeProvisionRuntimeDigest,
  WorktreeProvisionIntentMatch,
  type WorktreeProvisionIntentMatcher,
} from "#application/worktreeProvisioning/index.js";
import {
  WORKTREE_PROVISION_RECOVERY_EVIDENCE_PREFIX,
  WORKTREE_PROVISION_RECOVERY_SCHEMA_VERSION,
} from "../../constants/index.js";
import type { WorktreeProvisionRecoveryAssessment } from "../../contracts/index.js";
import type { ValidatedWorktreeProvisionRecoveryLocator } from "../../validation/index.js";
import type { WorktreeProvisionRecoveryAssessmentInternal } from "../contracts/index.js";

/** 从权威状态和真实 Git 现场生成确定性恢复评估。 */
export class WorktreeProvisionRecoveryAssessmentService {
  public constructor(
    private readonly codingTaskRepository: CodingTaskRepository,
    private readonly actionJournalRepository: ActionJournalRepository,
    private readonly repositoryRootResolver: RepositoryRootResolverPort,
    private readonly inspector: WorktreeProvisionRecoveryInspectorPort,
    private readonly digest: ContentDigestPort,
    private readonly provisionIntentMatcher: WorktreeProvisionIntentMatcher,
  ) {}

  /** 评估未知 Provision Action，不执行任何 Git 或文件写操作。 */
  public async assess(
    locator: ValidatedWorktreeProvisionRecoveryLocator,
  ): Promise<Result<WorktreeProvisionRecoveryAssessmentInternal, HarnessError>> {
    const loaded = await this.codingTaskRepository.load({
      workspaceId: locator.workspaceId,
      codingTaskId: locator.codingTaskId,
    });
    if (loaded.status === ResultStatus.Failure) return loaded;
    const aggregate = loaded.value.aggregate;
    if (!aggregate.worktreeBinding.managed) {
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "Harness 只能恢复由自身管理的 Worktree。",
        ),
      );
    }
    const trustedRoot = await this.repositoryRootResolver.resolve({
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
    });
    if (trustedRoot.status === ResultStatus.Failure) return trustedRoot;
    const journal = await this.actionJournalRepository.load({
      workspaceId: aggregate.workspaceId,
      taskId: aggregate.sourceTaskId,
      actionId: locator.actionId,
    });
    if (journal.status === ResultStatus.Failure) return journal;
    const recoverable = validateRecoverableJournal(journal.value);
    if (recoverable.status === ResultStatus.Failure) return recoverable;
    const binding = validateProvisionIntent(
      this.digest,
      trustedRoot.value.repositoryRoot,
      aggregate,
      journal.value.intent,
      this.provisionIntentMatcher,
    );
    if (binding.status === ResultStatus.Failure) return binding;
    const inspected = await this.inspector.inspect({
      repositoryId: aggregate.repositoryId,
      repositoryRoot: trustedRoot.value.repositoryRoot,
      worktreeBinding: aggregate.worktreeBinding,
      baseRevision: aggregate.baseRevision,
      writeSet: aggregate.writeSet,
    });
    if (inspected.status === ResultStatus.Failure) return inspected;
    if (
      inspected.value.repositoryId !== aggregate.repositoryId ||
      inspected.value.worktreeId !== aggregate.worktreeBinding.worktreeId
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "Worktree Provision 恢复检查返回了错误的资源身份。",
        ),
      );
    }
    const assessment = createAssessment(this.digest, aggregate, journal.value, inspected.value);
    return assessment.status === ResultStatus.Failure
      ? assessment
      : success({ assessment: assessment.value, aggregate, journal: journal.value });
  }
}

function validateRecoverableJournal(state: ActionJournalState): Result<void, HarnessError> {
  if (
    ![
      ActionJournalStatus.IntentRecorded,
      ActionJournalStatus.AwaitingResolution,
      ActionJournalStatus.WaitingHuman,
    ].includes(state.status)
  ) {
    return failure(
      new HarnessError(
        HarnessErrorCode.PreconditionNotMet,
        "Worktree Provision Action 当前不需要恢复对账。",
        { actionId: state.intent.actionId, status: state.status },
      ),
    );
  }
  if (
    state.status === ActionJournalStatus.AwaitingResolution &&
    state.observations.at(-1) === undefined
  ) {
    return failure(
      new HarnessError(HarnessErrorCode.CorruptStore, "等待处置的 Action 缺少 Observation。", {
        actionId: state.intent.actionId,
      }),
    );
  }
  return success(undefined);
}

function validateProvisionIntent(
  digest: ContentDigestPort,
  repositoryRoot: string,
  aggregate: CodingTaskAggregate,
  intent: ActionIntentRecord,
  matcher: WorktreeProvisionIntentMatcher,
): Result<void, HarnessError> {
  const matched = matcher.match(aggregate, intent);
  if (matched.status === ResultStatus.Failure) return matched;
  if (matched.value === WorktreeProvisionIntentMatch.Unrelated) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "Action 不是当前 CodingTask 的 Worktree Provision Intent。",
        { actionId: intent.actionId },
      ),
    );
  }
  const runtimeDigest = calculateWorktreeProvisionRuntimeDigest(digest, { repositoryRoot });
  if (runtimeDigest.status === ResultStatus.Failure) return runtimeDigest;
  const inputDigest = digest.calculate({
    workspaceId: aggregate.workspaceId,
    actionId: intent.actionId,
    repositoryRootDigest: runtimeDigest.value,
  });
  if (inputDigest.status === ResultStatus.Failure) return inputDigest;
  if (intent.inputDigest !== inputDigest.value) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "Action 不是当前 CodingTask 的 Worktree Provision Intent。",
        { actionId: intent.actionId },
      ),
    );
  }
  return success(undefined);
}

function createAssessment(
  digest: ContentDigestPort,
  aggregate: CodingTaskAggregate,
  journal: ActionJournalState,
  inspection: {
    readonly status: WorktreeProvisionRecoveryAssessment["status"];
    readonly diagnostics: WorktreeProvisionRecoveryAssessment["diagnostics"];
  },
): Result<WorktreeProvisionRecoveryAssessment, HarnessError> {
  const body = {
    schemaVersion: WORKTREE_PROVISION_RECOVERY_SCHEMA_VERSION,
    workspaceId: aggregate.workspaceId,
    codingTaskId: aggregate.codingTaskId,
    actionId: journal.intent.actionId,
    repositoryId: aggregate.repositoryId,
    worktreeId: aggregate.worktreeBinding.worktreeId,
    journalStatus: journal.status,
    journalLastSequence: journal.lastSequence,
    status: inspection.status,
    diagnostics: [...new Set(inspection.diagnostics)].sort(),
  };
  const assessmentDigest = digest.calculate(body);
  if (assessmentDigest.status === ResultStatus.Failure) return assessmentDigest;
  return success({
    ...body,
    evidenceIds: [
      `${WORKTREE_PROVISION_RECOVERY_EVIDENCE_PREFIX}:${journal.intent.actionId}:${assessmentDigest.value}`,
    ],
    digest: assessmentDigest.value,
  });
}
