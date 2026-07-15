import type {
  ContentDigestPort,
  InstallationRevisionStore,
  InstallPlanStore,
  ManagedFileMutationPort,
  ManagedFileStateReader,
  RepositoryLockPort,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Clock,
  type IdGenerator,
  type Result,
} from "#common/index.js";

import type { ApplyInstallPlanInput, ApplyInstallPlanOutput } from "./contracts/index.js";
import { InstallationApplyService } from "./service/index.js";
import { validateApplyInstallPlanInput } from "./validation/index.js";

/** 执行 Human G0 批准、持久化 rollback journal 并闭合受管文件 Apply。 */
export class ApplyInstallPlanUseCase {
  private readonly lockedService: InstallationApplyService;

  public constructor(
    private readonly planStore: InstallPlanStore,
    revisionStore: InstallationRevisionStore,
    reader: ManagedFileStateReader,
    mutation: ManagedFileMutationPort,
    private readonly repositoryLock: RepositoryLockPort,
    digest: ContentDigestPort,
    clock: Clock,
    revisionIdGenerator: IdGenerator,
  ) {
    this.lockedService = new InstallationApplyService(
      revisionStore,
      reader,
      mutation,
      digest,
      clock,
      revisionIdGenerator,
    );
  }

  /** 仅对已持久化且摘要精确匹配的计划执行显式批准。 */
  public async execute(
    input: ApplyInstallPlanInput,
  ): Promise<Result<ApplyInstallPlanOutput, HarnessError>> {
    const valid = validateApplyInstallPlanInput(input);
    if (valid.status === ResultStatus.Failure) return valid;
    const plan = await this.planStore.load(valid.value.workspaceId, valid.value.planId);
    if (plan.status === ResultStatus.Failure) return plan;
    if (
      plan.value.planId !== valid.value.planId ||
      plan.value.repositoryId !== valid.value.repositoryId ||
      plan.value.planDigest !== valid.value.planDigest
    )
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "G0 approval does not match the persisted InstallPlan.",
          { planId: valid.value.planId },
        ),
      );
    const lock = await this.repositoryLock.acquire({
      workspaceId: valid.value.workspaceId,
      repositoryId: valid.value.repositoryId,
      holderId: `installation:${valid.value.planId}`,
    });
    if (lock.status === ResultStatus.Failure) return lock;

    let outcome: Result<ApplyInstallPlanOutput, HarnessError>;
    try {
      outcome = await this.lockedService.execute(plan.value, valid.value);
    } catch (error) {
      outcome = failure(
        new HarnessError(
          HarnessErrorCode.InstallationCommitOutcomeUnknown,
          "Installation execution threw after the Repository Lock was acquired.",
          {
            workspaceId: valid.value.workspaceId,
            repositoryId: valid.value.repositoryId,
            phase: "installation_execution",
          },
          error,
        ),
      );
    }
    const released = await releaseRepositoryLock(() => lock.value.release());
    if (released.status === ResultStatus.Failure)
      return failure(
        new HarnessError(
          HarnessErrorCode.InstallationCommitOutcomeUnknown,
          "Repository Lock release outcome is unknown after installation processing.",
          {
            workspaceId: valid.value.workspaceId,
            repositoryId: valid.value.repositoryId,
            phase: "repository_lock_release",
          },
          outcome.status === ResultStatus.Failure
            ? new AggregateError(
                [outcome.error, released.error],
                "Installation execution and Repository Lock release both failed.",
              )
            : released.error,
        ),
      );
    return outcome;
  }
}

/** 将不符合 Port 契约的 release throw 收敛为可审计失败。 */
async function releaseRepositoryLock(
  release: () => Promise<Result<void, HarnessError>>,
): Promise<Result<void, HarnessError>> {
  try {
    return await release();
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.IoFailure,
        "Repository Lock release threw unexpectedly.",
        {},
        error,
      ),
    );
  }
}
