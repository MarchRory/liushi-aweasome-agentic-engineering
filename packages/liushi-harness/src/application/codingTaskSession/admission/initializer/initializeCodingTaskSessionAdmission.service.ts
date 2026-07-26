import {
  SESSION_HOOK_BINDING_SCHEMA_VERSION,
  createSessionHookBinding,
} from "#application/executorHooks/index.js";
import { CodingTaskSessionAdmissionStateCreateDisposition } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  CodingTaskSessionAdmissionStatus,
  createCodingTaskSessionAdmissionState,
} from "#domain/codingTaskSession/index.js";

import type {
  CodingTaskSessionAdmissionInitializationInput,
  CodingTaskSessionAdmissionInitializationResult,
  CodingTaskSessionAdmissionInitializerDependencies,
  CodingTaskSessionAdmissionInitializerPort,
} from "../contracts/index.js";

/** 从权威 Activation Record 确定性建立 Session Action Admission。 */
export class InitializeCodingTaskSessionAdmissionService implements CodingTaskSessionAdmissionInitializerPort {
  public constructor(
    private readonly dependencies: CodingTaskSessionAdmissionInitializerDependencies,
  ) {}

  /** 创建或精确复用 Binding v2 与初始 Admission State。 */
  public async ensure(
    input: CodingTaskSessionAdmissionInitializationInput,
  ): Promise<Result<CodingTaskSessionAdmissionInitializationResult, HarnessError>> {
    const rootDigest = this.dependencies.digest.calculate({ worktreeRoot: input.worktreeRoot });
    if (rootDigest.status === ResultStatus.Failure) return rootDigest;
    if (rootDigest.value !== input.activation.worktreeRootDigest) {
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Session Admission 初始化时 Worktree Root Digest 与 Activation Record 不一致。",
        ),
      );
    }

    const binding = createSessionHookBinding(
      {
        schemaVersion: SESSION_HOOK_BINDING_SCHEMA_VERSION,
        workspaceRoot: input.worktreeRoot,
        workspaceId: input.activation.workspaceId,
        taskId: input.activation.sourceTaskId,
        planRiskArtifactId: input.activation.planRiskArtifactId,
        planRiskArtifactDigest: input.activation.planRiskArtifactDigest,
        actorId: input.activation.agentActorId,
        boundAt: input.activation.activatedAt,
        sessionId: input.activation.sessionId,
        codingTaskId: input.activation.codingTaskId,
        attemptNumber: input.activation.attemptNumber,
        worktreeId: input.activation.worktreeId,
        worktreeRootDigest: input.activation.worktreeRootDigest,
        activationBindingDigest: input.activation.bindingDigest,
      },
      this.dependencies.digest,
    );
    if (binding.status === ResultStatus.Failure) return binding;

    const bound = await this.dependencies.bindingStore.bind(binding.value);
    if (bound.status === ResultStatus.Failure) return bound;
    if (bound.value.sessionBindingDigest !== binding.value.sessionBindingDigest) {
      return failure(
        new HarnessError(
          HarnessErrorCode.VersionConflict,
          "Session Hook Binding v2 的幂等复用结果与候选摘要不一致。",
        ),
      );
    }

    const initialState = createCodingTaskSessionAdmissionState({
      workspaceId: input.activation.workspaceId,
      sessionId: input.activation.sessionId,
      activationBindingDigest: input.activation.bindingDigest,
      sessionBindingDigest: bound.value.sessionBindingDigest,
      updatedAt: input.activation.activatedAt,
    });
    if (initialState.status === ResultStatus.Failure) return initialState;
    const created = await this.dependencies.stateStore.create(initialState.value);
    if (created.status === ResultStatus.Failure) return created;
    if (!hasExpectedStateIdentity(created.value.state, initialState.value)) {
      return failure(
        new HarnessError(
          HarnessErrorCode.VersionConflict,
          "既有 Admission State 与当前 Activation 或 Session Binding 身份冲突。",
        ),
      );
    }
    if (created.value.state.status !== CodingTaskSessionAdmissionStatus.WaitingAgent) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidStateTransition,
          "既有 Admission State 已离开 waiting_agent，不能重新报告 Session 可用。",
          { status: created.value.state.status },
        ),
      );
    }
    if (
      created.value.disposition === CodingTaskSessionAdmissionStateCreateDisposition.Conflict &&
      created.value.state.version === 0
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.VersionConflict,
          "初始 Admission State 内容发生冲突，拒绝静默覆盖。",
        ),
      );
    }
    return success({ binding: bound.value, state: created.value.state });
  }
}

function hasExpectedStateIdentity(
  actual: CodingTaskSessionAdmissionInitializationResult["state"],
  expected: CodingTaskSessionAdmissionInitializationResult["state"],
): boolean {
  return (
    actual.workspaceId === expected.workspaceId &&
    actual.sessionId === expected.sessionId &&
    actual.activationBindingDigest === expected.activationBindingDigest &&
    actual.sessionBindingDigest === expected.sessionBindingDigest
  );
}
