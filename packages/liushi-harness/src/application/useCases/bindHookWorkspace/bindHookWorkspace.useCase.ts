import type { HookBindingStore } from "#application/ports/index.js";
import type { TaskRepository } from "#application/ports/index.js";
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
  ArtifactStatus,
  ArtifactType,
  parseArtifactDigest,
  parseArtifactId,
  type ArtifactDigest,
  type ArtifactId,
} from "#domain/artifact/index.js";
import { GateEvaluationResult, evaluateArtifactGate } from "#domain/gate/index.js";
import { parseTaskId, type TaskId } from "#domain/task/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";

import {
  HOOK_BINDING_SCHEMA_VERSION,
  MAX_HOOK_BINDING_ACTOR_ID_LENGTH,
  MAX_HOOK_WORKSPACE_ROOT_LENGTH,
  type BindHookWorkspaceInput,
  type HookWorkspaceBinding,
} from "#application/executorHooks/index.js";

/** 将 Human 确认的 Task/PlanRisk 组合写入 Codex Hook Runtime Binding。 */
export class BindHookWorkspaceUseCase {
  public constructor(
    private readonly taskRepository: TaskRepository,
    private readonly bindingStore: HookBindingStore,
    private readonly clock: Clock,
  ) {}

  /** 校验精确 Artifact Digest 后持久化绑定，不修改 Task 业务状态。 */
  public async execute(
    input: BindHookWorkspaceInput,
  ): Promise<Result<HookWorkspaceBinding, HarnessError>> {
    const parsed = parseInput(input);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const loaded = await this.taskRepository.load({
      workspaceId: parsed.value.workspaceId,
      taskId: parsed.value.taskId,
    });
    if (loaded.status === ResultStatus.Failure) return loaded;
    const artifact = loaded.value.aggregate.artifacts.find(
      (candidate) => candidate.artifactId === parsed.value.planRiskArtifactId,
    );
    if (
      artifact === undefined ||
      artifact.artifactType !== ArtifactType.PlanRisk ||
      artifact.status !== ArtifactStatus.Proposed ||
      artifact.digest !== parsed.value.planRiskArtifactDigest
    ) {
      return forbidden("Hook Binding 必须绑定当前 Task 中已批准且 Digest 精确匹配的 PlanRisk。");
    }
    const gateEvaluation = evaluateArtifactGate(
      artifact,
      loaded.value.aggregate.approvals,
      this.clock.now().toISOString(),
    );
    if (gateEvaluation.result !== GateEvaluationResult.Allow) {
      return forbidden("Hook Binding 必须绑定已通过所需 Human Gate 的 PlanRisk。");
    }
    const binding: HookWorkspaceBinding = {
      schemaVersion: HOOK_BINDING_SCHEMA_VERSION,
      workspaceRoot: parsed.value.workspaceRoot,
      workspaceId: parsed.value.workspaceId,
      taskId: parsed.value.taskId,
      planRiskArtifactId: parsed.value.planRiskArtifactId,
      planRiskArtifactDigest: parsed.value.planRiskArtifactDigest,
      actorId: parsed.value.actorId,
      boundAt: this.clock.now().toISOString(),
    };
    return this.bindingStore.bind(binding);
  }
}

function parseInput(input: BindHookWorkspaceInput): Result<
  {
    workspaceRoot: string;
    workspaceId: WorkspaceId;
    taskId: TaskId;
    planRiskArtifactId: ArtifactId;
    planRiskArtifactDigest: ArtifactDigest;
    actorId: string;
  },
  HarnessError
> {
  if (
    typeof input.workspaceRoot !== "string" ||
    input.workspaceRoot.trim().length === 0 ||
    input.workspaceRoot.length > MAX_HOOK_WORKSPACE_ROOT_LENGTH ||
    input.workspaceRoot.includes("\0")
  ) {
    return forbidden("Hook Binding workspaceRoot 必须是非空且不包含控制字符的路径。");
  }
  if (
    typeof input.actorId !== "string" ||
    input.actorId.trim().length === 0 ||
    input.actorId.length > MAX_HOOK_BINDING_ACTOR_ID_LENGTH ||
    input.actorId !== input.actorId.trim()
  ) {
    return forbidden("Hook Binding actorId 必须是非空且无首尾空白的标识。");
  }
  const workspaceId = parseWorkspaceId(input.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const taskId = parseTaskId(input.taskId);
  if (taskId.status === ResultStatus.Failure) return taskId;
  const planRiskArtifactId = parseArtifactId(input.planRiskArtifactId);
  if (planRiskArtifactId.status === ResultStatus.Failure) return planRiskArtifactId;
  const planRiskArtifactDigest = parseArtifactDigest(input.planRiskArtifactDigest);
  if (planRiskArtifactDigest.status === ResultStatus.Failure) return planRiskArtifactDigest;
  return success({
    workspaceRoot: input.workspaceRoot.trim(),
    workspaceId: workspaceId.value,
    taskId: taskId.value,
    planRiskArtifactId: planRiskArtifactId.value,
    planRiskArtifactDigest: planRiskArtifactDigest.value,
    actorId: input.actorId,
  });
}

function forbidden(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
