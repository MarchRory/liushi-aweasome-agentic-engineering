import { ActorKind, ResultStatus } from "#common/index.js";

import type {
  ApprovalDecideCliCommand,
  ArtifactProposeCliCommand,
  CliApplication,
  RunCliDependencies,
  TaskCreateCliCommand,
  TaskStatusCliCommand,
} from "../../../contracts/index.js";
import {
  CLI_EXIT_CODE_SUCCESS,
  mapErrorExitCode,
  writeFailure,
  writeSuccess,
} from "../../../output/index.js";

/** 创建 Task 并输出持久化结果。 */
export async function executeTaskCreate(
  command: TaskCreateCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.createTask.execute({
    workspaceId: command.workspaceId,
    ...(command.source === undefined ? {} : { source: command.source }),
    actor: { kind: ActorKind.Human, actorId: command.actorId },
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, {
    ...result.value.task,
    persistence: result.value.persistence,
  });
  return CLI_EXIT_CODE_SUCCESS;
}

/** 查询并输出 Task 当前状态。 */
export async function executeTaskStatus(
  command: TaskStatusCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.getTaskStatus.execute({
    workspaceId: command.workspaceId,
    taskId: command.taskId,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

/** 读取 Artifact Proposal 并提交到 Application。 */
export async function executeArtifactPropose(
  command: ArtifactProposeCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const document = await dependencies.jsonDocumentReader.read(command.filePath);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const result = await application.proposeArtifact.execute({
    workspaceId: command.workspaceId,
    taskId: command.taskId,
    proposal: document.value,
    actor: { kind: ActorKind.Human, actorId: command.actorId },
    ...(command.idempotencyKey === undefined ? {} : { idempotencyKey: command.idempotencyKey }),
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

/** 记录 Human Approval 决策。 */
export async function executeApprovalDecide(
  command: ApprovalDecideCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.recordApproval.execute({
    workspaceId: command.workspaceId,
    taskId: command.taskId,
    decisionRequestId: command.decisionRequestId,
    decisionRequestDigest: command.decisionRequestDigest,
    idempotencyKey: command.idempotencyKey,
    actor: { kind: ActorKind.Human, actorId: command.actorId },
    decision: command.decision,
    ...(command.reason === undefined ? {} : { reason: command.reason }),
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}
