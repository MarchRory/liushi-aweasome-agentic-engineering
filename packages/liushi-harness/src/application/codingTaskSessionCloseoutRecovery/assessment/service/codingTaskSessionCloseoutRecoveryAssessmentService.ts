import type { CodingTaskSessionCloseoutAuthority } from "#application/codingTaskSessionCloseout/index.js";
import { ChangeSetCheckpointRecoveryStatus } from "#application/changeSetCheckpoint/index.js";
import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";

import { CODING_TASK_SESSION_CLOSEOUT_RECOVERY_ASSESSMENT_SCHEMA_VERSION } from "../../constants/index.js";
import type { CodingTaskSessionCloseoutRecoveryAssessmentBody } from "../../contracts/index.js";
import { finalizeCodingTaskSessionCloseoutRecoveryAssessment } from "../digest/index.js";
import type {
  CodingTaskSessionCloseoutRecoveryAssessmentInternal,
  CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies,
} from "../contracts/index.js";
import {
  parseCodingTaskSessionCloseoutRecoveryInput,
  rebuildCodingTaskSessionCloseoutCommand,
} from "../validation/index.js";
import {
  classifyCodingTaskSessionCloseoutRecovery,
  type CodingTaskSessionCloseoutRecoveryDecision,
} from "./codingTaskSessionCloseoutRecoveryClassification.service.js";
import {
  hasStableCloseoutRecoveryIdentity,
  loadCodingTaskSessionCloseoutRecoveryAuthority,
} from "./codingTaskSessionCloseoutRecoveryAuthority.service.js";

/** 对 Closeout v3 State 执行全链只读、Fail-closed 的 Recovery Assessment。 */
export class CodingTaskSessionCloseoutRecoveryAssessmentService {
  public constructor(
    private readonly dependencies: CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies,
  ) {}

  /** 加载权威身份、复验现场，并生成供 Human 使用的公开 Assessment。 */
  public async assess(
    input: unknown,
  ): Promise<Result<CodingTaskSessionCloseoutRecoveryAssessmentInternal, HarnessError>> {
    const locator = parseCodingTaskSessionCloseoutRecoveryInput(input);
    if (locator.status === ResultStatus.Failure) return locator;
    let state: Awaited<ReturnType<typeof this.dependencies.stateStore.load>>;
    try {
      state = await this.dependencies.stateStore.load(locator.value);
    } catch (error) {
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "Closeout State 加载抛出异常。", {}, error),
      );
    }
    if (state.status === ResultStatus.Failure) return state;
    const command = rebuildCodingTaskSessionCloseoutCommand(state.value, this.dependencies.digest);
    if (command.status === ResultStatus.Failure) return command;
    const authority = await loadCodingTaskSessionCloseoutRecoveryAuthority(
      this.dependencies,
      command.value,
      locator.value,
    );
    if (authority.status === ResultStatus.Failure) return authority;
    if (!hasStableCloseoutRecoveryIdentity(state.value, command.value, authority.value)) {
      return failure(
        new HarnessError(
          HarnessErrorCode.VersionConflict,
          "Closeout State 身份与原 Command 不一致。",
        ),
      );
    }
    const stateDigest = calculateDigest(this.dependencies.digest, state.value);
    if (stateDigest.status === ResultStatus.Failure) return stateDigest;
    const decision = await classifyCodingTaskSessionCloseoutRecovery(
      this.dependencies,
      state.value,
      authority.value,
    );
    const body = this.createBody(state.value, authority.value, stateDigest.value, decision);
    if (body.status === ResultStatus.Failure) return body;
    const assessment = finalizeCodingTaskSessionCloseoutRecoveryAssessment(
      body.value,
      this.dependencies.digest,
    );
    if (assessment.status === ResultStatus.Failure) return assessment;
    return success({
      assessment: assessment.value,
      authority: authority.value,
      state: state.value,
      checkpointInput: decision.checkpointInput,
      checkpointRecovery: decision.checkpointRecovery,
    });
  }

  private createBody(
    state: CodingTaskSessionCloseoutState,
    authority: CodingTaskSessionCloseoutAuthority,
    closeoutStateDigest: ContentDigest,
    decision: CodingTaskSessionCloseoutRecoveryDecision,
  ): Result<CodingTaskSessionCloseoutRecoveryAssessmentBody, HarnessError> {
    const aggregate = authority.codingTask.aggregate;
    const repositoryRootDigest = calculateDigest(this.dependencies.digest, {
      repositoryRoot: authority.repositoryRoot,
    });
    if (repositoryRootDigest.status === ResultStatus.Failure) return repositoryRootDigest;
    const worktreeRootDigest = calculateDigest(this.dependencies.digest, {
      worktreeRoot: authority.worktreeRoot,
    });
    if (worktreeRootDigest.status === ResultStatus.Failure) return worktreeRootDigest;
    return success({
      schemaVersion: CODING_TASK_SESSION_CLOSEOUT_RECOVERY_ASSESSMENT_SCHEMA_VERSION,
      workspaceId: aggregate.workspaceId,
      sessionId: authority.activation.sessionId,
      codingTaskId: aggregate.codingTaskId,
      sourceTaskId: aggregate.sourceTaskId,
      repositoryId: aggregate.repositoryId,
      attemptNumber: authority.activation.attemptNumber,
      worktreeId: aggregate.worktreeBinding.worktreeId,
      branchName: aggregate.worktreeBinding.branchName,
      repositoryRootDigest: repositoryRootDigest.value,
      worktreeRootDigest: worktreeRootDigest.value,
      baseRevision: aggregate.baseRevision,
      writeSet: aggregate.writeSet,
      closeoutSchemaVersion: state.schemaVersion,
      closeoutVersion: state.version,
      closeoutStatus: state.status,
      closeoutStoppedStage: state.stoppedStage,
      closeoutErrorCode: state.errorCode,
      closeoutStateDigest,
      snapshotDigest: state.snapshot?.snapshotDigest ?? null,
      coverageBindingDigest: state.coverageBindingDigest,
      checkpointStatus: decision.checkpointRecovery.status,
      checkpointBindingDigest:
        decision.checkpointRecovery.status === ChangeSetCheckpointRecoveryStatus.Present
          ? decision.checkpointRecovery.checkpoint.bindingDigest
          : null,
      disposition: decision.disposition,
      allowedResolution: decision.allowedResolution,
      diagnostic: decision.diagnostic,
    });
  }
}

function calculateDigest(
  digest: CodingTaskSessionCloseoutRecoveryAssessmentServiceDependencies["digest"],
  input: unknown,
): Result<ContentDigest, HarnessError> {
  try {
    return digest.calculate(input);
  } catch (error) {
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Canonical Digest 计算抛出异常。", {}, error),
    );
  }
}
