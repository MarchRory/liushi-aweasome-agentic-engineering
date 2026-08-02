import { basename } from "node:path";

import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import type {
  CliApplication,
  RequirementAnalyzeCliCommand,
  RequirementConfirmCliCommand,
  RunCliDependencies,
} from "../../contracts/index.js";
import {
  CLI_EXIT_CODE_SUCCESS,
  mapErrorExitCode,
  writeFailure,
  writeSuccess,
} from "../../output/index.js";

/** 读取 PRD 并执行一次无状态、只读 Requirement 分析。 */
export async function executeRequirementAnalyze(
  command: RequirementAnalyzeCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  if (dependencies.textDocumentReader === undefined) {
    const error = new HarnessError(
      HarnessErrorCode.OperationForbidden,
      "CLI host does not provide a text document reader.",
    );
    writeFailure(dependencies, command.outputFormat, command.command, error);
    return mapErrorExitCode(error.code);
  }

  const document = await dependencies.textDocumentReader.read(command.prdFilePath);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const result = await application.analyzeRequirement.execute({
    workspaceId: command.workspaceId,
    repositoryId: command.repositoryId,
    repositoryRoot: command.repositoryRoot,
    prdSource: basename(command.prdFilePath),
    prdContent: document.value,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }

  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

/** 读取 Human Review，并在内部完成 Requirement Artifact 与 G1 Approval 绑定。 */
export async function executeRequirementConfirm(
  command: RequirementConfirmCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const document = await dependencies.jsonDocumentReader.read(command.filePath);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const review = extractRequirementReview(document.value);
  if (review.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, review.error);
    return mapErrorExitCode(review.error.code);
  }

  const result = await application.confirmRequirement.execute({
    workspaceId: command.workspaceId,
    taskId: command.taskId,
    repositoryId: command.repositoryId,
    analysisProposal: review.value.analysisProposal,
    review: review.value.review,
    actor: { kind: ActorKind.Human, actorId: command.actorId },
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }

  writeSuccess(dependencies, command.outputFormat, command.command, {
    confirmationStatus: result.value.confirmationStatus,
    nextStep: result.value.nextStep,
    workspaceId: command.workspaceId,
    repositoryId: command.repositoryId,
    taskId: result.value.task.taskId,
    artifactId: result.value.artifact.artifactId,
  });
  return CLI_EXIT_CODE_SUCCESS;
}

function extractRequirementReview(
  input: unknown,
): Result<{ readonly analysisProposal: unknown; readonly review: unknown }, HarnessError> {
  if (!isRecord(input)) return failure(invalidReviewDocument());
  const container = isRecord(input["data"]) ? input["data"] : input;
  if (!("proposal" in container) || !("reviewDraft" in container)) {
    return failure(invalidReviewDocument());
  }
  return success({
    analysisProposal: container["proposal"],
    review: container["reviewDraft"],
  });
}

function invalidReviewDocument(): HarnessError {
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    "Requirement Review 文件必须来自 requirement analyze --json。",
    { field: "file" },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
