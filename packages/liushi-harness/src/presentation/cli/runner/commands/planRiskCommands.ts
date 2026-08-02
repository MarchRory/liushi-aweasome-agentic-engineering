import { PlanRiskNextStep } from "#application/index.js";
import { ActorKind, HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";

import type {
  CliApplication,
  PlanRiskAnalyzeCliCommand,
  PlanRiskConfirmCliCommand,
  RunCliDependencies,
} from "../../contracts/index.js";
import {
  CLI_EXIT_CODE_SUCCESS,
  mapErrorExitCode,
  writeFailure,
  writeSuccess,
} from "../../output/index.js";

/** 基于已批准 Requirement 执行一次无 Repository 写入的 Planning 分析。 */
export async function executePlanRiskAnalyze(
  command: PlanRiskAnalyzeCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.analyzePlanRisk.execute({
    workspaceId: command.workspaceId,
    taskId: command.taskId,
    repositoryId: command.repositoryId,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

/** 读取 Human Review，并在内部完成 Business Logic/G2 或 PlanRisk/G4 绑定。 */
export async function executePlanRiskConfirm(
  command: PlanRiskConfirmCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const document = await dependencies.jsonDocumentReader.read(command.filePath);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const analysisDocument = extractAnalysisDocument(document.value);
  if (analysisDocument instanceof HarnessError) {
    writeFailure(dependencies, command.outputFormat, command.command, analysisDocument);
    return mapErrorExitCode(analysisDocument.code);
  }

  const result = await application.confirmPlanRisk.execute({
    workspaceId: command.workspaceId,
    taskId: command.taskId,
    repositoryId: command.repositoryId,
    analysisDocument,
    actor: { kind: ActorKind.Human, actorId: command.actorId },
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, {
    confirmationStatus: result.value.confirmationStatus,
    artifactType: result.value.artifactType,
    nextStep: result.value.nextStep,
    workspaceId: command.workspaceId,
    taskId: result.value.task.taskId,
    repositoryId: command.repositoryId,
    artifactId: result.value.artifact.artifactId,
    ...(result.value.nextStep === PlanRiskNextStep.CodingTask
      ? { riskLevel: result.value.artifact.payload.riskLevel }
      : {}),
  });
  return CLI_EXIT_CODE_SUCCESS;
}

function extractAnalysisDocument(input: unknown): Record<string, unknown> | HarnessError {
  if (!isRecord(input)) return invalidDocument();
  const container = isRecord(input["data"]) ? input["data"] : input;
  return "analysisStatus" in container && "reviewDraft" in container
    ? container
    : invalidDocument();
}

function invalidDocument(): HarnessError {
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    "Planning Review 文件必须来自 plan-risk analyze --json。",
    { field: "file" },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
