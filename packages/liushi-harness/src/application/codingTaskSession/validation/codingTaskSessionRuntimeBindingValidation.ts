import {
  CodingTaskCommandType,
  parseCodingTaskPayload,
  type CreateCodingTaskPayload,
  type StartAttemptPayload,
} from "#application/codingTask/index.js";
import type { ContentDigestPort, ManagedWorktreePathPort } from "#application/ports/index.js";
import {
  calculateWorktreeProvisionRuntimeDigest,
  parseProvisionWorktreePayload,
  validateProvisionWorktreeRuntime,
} from "#application/worktreeProvisioning/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ActorRef,
  type Result,
} from "#common/index.js";
import { parseCodingTaskId } from "#domain/codingTask/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import {
  CODING_TASK_SESSION_AGENT_ACTOR_ID_MAX_LENGTH,
  CODING_TASK_SESSION_FIRST_ATTEMPT_NUMBER,
} from "../constants/index.js";
import type {
  CodingTaskSessionActivationManifest,
  CodingTaskSessionRuntimeBinding,
  PreparedCodingTaskSessionActivation,
} from "../contracts/index.js";
import { CodingTaskSessionActivationStage } from "../enums/index.js";

/** 在任何 Activation 副作用前验证 Payload、摘要和启动期单仓绑定。 */
export function prepareCodingTaskSessionActivation(
  manifest: CodingTaskSessionActivationManifest,
  binding: CodingTaskSessionRuntimeBinding,
  digest: ContentDigestPort,
  runtimePath: ManagedWorktreePathPort,
): Result<PreparedCodingTaskSessionActivation, HarnessError> {
  const codingTaskId = parseCodingTaskId(manifest.createCommand.aggregateId);
  if (codingTaskId.status === ResultStatus.Failure) {
    return failure(withStage(codingTaskId.error, CodingTaskSessionActivationStage.Create));
  }
  const workspaceId = parseWorkspaceId(binding.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) {
    return failure(withStage(workspaceId.error, CodingTaskSessionActivationStage.Create));
  }
  const createPayload = parseCodingTaskPayload(
    CodingTaskCommandType.Create,
    manifest.createCommand.payload,
  );
  if (createPayload.status === ResultStatus.Failure) {
    return failure(withStage(createPayload.error, CodingTaskSessionActivationStage.Create));
  }
  const create = createPayload.value as CreateCodingTaskPayload;
  const createDigest = validatePayloadDigest(
    manifest.createCommand.payload,
    manifest.createCommand.requestDigest,
    CodingTaskSessionActivationStage.Create,
    digest,
  );
  if (createDigest.status === ResultStatus.Failure) return createDigest;

  const provisionPayload = parseProvisionWorktreePayload(manifest.provision.command.payload);
  if (provisionPayload.status === ResultStatus.Failure) {
    return failure(withStage(provisionPayload.error, CodingTaskSessionActivationStage.Provision));
  }
  const provisionDigest = validatePayloadDigest(
    manifest.provision.command.payload,
    manifest.provision.command.requestDigest,
    CodingTaskSessionActivationStage.Provision,
    digest,
  );
  if (provisionDigest.status === ResultStatus.Failure) return provisionDigest;
  const provisionRuntime = validateProvisionWorktreeRuntime(manifest.provision.runtime);
  if (provisionRuntime.status === ResultStatus.Failure) {
    return failure(withStage(provisionRuntime.error, CodingTaskSessionActivationStage.Provision));
  }
  const provisionRuntimeDigest = calculateWorktreeProvisionRuntimeDigest(
    digest,
    provisionRuntime.value,
  );
  if (provisionRuntimeDigest.status === ResultStatus.Failure) {
    return failure(
      withStage(provisionRuntimeDigest.error, CodingTaskSessionActivationStage.Provision),
    );
  }

  const startPayload = parseCodingTaskPayload(
    CodingTaskCommandType.StartAttempt,
    manifest.startAttemptCommand.payload,
  );
  if (startPayload.status === ResultStatus.Failure) {
    return failure(withStage(startPayload.error, CodingTaskSessionActivationStage.StartAttempt));
  }
  const start = startPayload.value as StartAttemptPayload;
  const startDigest = validatePayloadDigest(
    manifest.startAttemptCommand.payload,
    manifest.startAttemptCommand.requestDigest,
    CodingTaskSessionActivationStage.StartAttempt,
    digest,
  );
  if (startDigest.status === ResultStatus.Failure) return startDigest;

  const identity = validateTrustedIdentity({
    create,
    provisionWorkspaceId: provisionPayload.value.workspaceId,
    provisionRuntimeRoot: provisionRuntime.value.repositoryRoot,
    provisionRuntimeDigest: provisionRuntimeDigest.value,
    provisionPayloadRootDigest: provisionPayload.value.repositoryRootDigest,
    start,
    commandActors: [
      manifest.createCommand.actor,
      manifest.provision.command.actor,
      manifest.startAttemptCommand.actor,
    ],
    binding,
  });
  if (identity.status === ResultStatus.Failure) return identity;

  const worktreeRoot = runtimePath.resolveManagedWorktreeRoot({
    repositoryRoot: binding.repositoryRoot,
    worktreeRelativePath: create.worktreeBinding.relativePath,
  });
  if (worktreeRoot.status === ResultStatus.Failure) {
    return failure(withStage(worktreeRoot.error, CodingTaskSessionActivationStage.Create));
  }
  const worktreeRootDigest = digest.calculate({ worktreeRoot: worktreeRoot.value });
  if (worktreeRootDigest.status === ResultStatus.Failure) {
    return failure(
      withStage(worktreeRootDigest.error, CodingTaskSessionActivationStage.AuthoritativeBinding),
    );
  }
  return success({
    manifest,
    createPayload: create,
    codingTaskId: codingTaskId.value,
    workspaceId: workspaceId.value,
    worktreeRoot: worktreeRoot.value,
    worktreeRootDigest: worktreeRootDigest.value,
    attemptNumber: start.attemptNumber,
    agentActorId: binding.agentActorId,
  });
}

/** 一次副作用前身份一致性校验所需的全部启动输入。 */
interface TrustedIdentityInput {
  /** 已验证的 Create Payload。 */
  readonly create: CreateCodingTaskPayload;
  /** Provision Payload 中的工作区。 */
  readonly provisionWorkspaceId: string;
  /** Provision Runtime 中的 Repository Root。 */
  readonly provisionRuntimeRoot: string;
  /** 实际 Runtime Root 的摘要。 */
  readonly provisionRuntimeDigest: string;
  /** Provision Payload 声明的 Runtime Root 摘要。 */
  readonly provisionPayloadRootDigest: string;
  /** 已验证的 StartAttempt Payload。 */
  readonly start: StartAttemptPayload;
  /** 三个命令信封中声明的 Actor。 */
  readonly commandActors: readonly ActorRef[];
  /** 启动期单仓与审计身份绑定。 */
  readonly binding: CodingTaskSessionRuntimeBinding;
}

function validateTrustedIdentity(input: TrustedIdentityInput): Result<void, HarnessError> {
  const agentActorId = input.binding.agentActorId;
  const actorMatches =
    agentActorId.length > 0 &&
    agentActorId.length <= CODING_TASK_SESSION_AGENT_ACTOR_ID_MAX_LENGTH &&
    agentActorId === agentActorId.trim() &&
    !/[\u0000-\u001f\u007f]/u.test(agentActorId) &&
    input.commandActors.every(
      (actor) => actor.kind === ActorKind.Agent && actor.actorId === agentActorId,
    );
  const matches =
    actorMatches &&
    input.create.workspaceId === input.binding.workspaceId &&
    input.create.repositoryId === input.binding.repositoryId &&
    input.create.worktreeBinding.managed &&
    input.provisionWorkspaceId === input.binding.workspaceId &&
    input.provisionRuntimeRoot === input.binding.repositoryRoot &&
    input.provisionRuntimeDigest === input.provisionPayloadRootDigest &&
    input.start.workspaceId === input.binding.workspaceId &&
    input.start.attemptNumber === CODING_TASK_SESSION_FIRST_ATTEMPT_NUMBER;
  return matches
    ? success(undefined)
    : failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "CodingTask Session Activation 与启动期 Runtime Binding 不匹配。",
        ),
      );
}

function validatePayloadDigest(
  payload: unknown,
  expectedDigest: string,
  stage: CodingTaskSessionActivationStage,
  digest: ContentDigestPort,
): Result<void, HarnessError> {
  const calculated = digest.calculate(payload);
  if (calculated.status === ResultStatus.Failure)
    return failure(withStage(calculated.error, stage));
  return calculated.value === expectedDigest
    ? success(undefined)
    : failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "CodingTask Session Command Payload 摘要不一致。",
          { stage },
        ),
      );
}

function withStage(error: HarnessError, stage: CodingTaskSessionActivationStage): HarnessError {
  return new HarnessError(error.code, error.message, { ...error.details, stage }, error.cause);
}
