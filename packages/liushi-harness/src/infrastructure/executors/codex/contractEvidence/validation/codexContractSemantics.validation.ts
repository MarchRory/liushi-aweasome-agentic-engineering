import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ExecutorAdapterKind,
  ExecutorDistribution,
  ExecutorEvidenceOutcome,
  ExecutorHostSurface,
  MANAGED_FILE_MUTATION_HOOK_PROFILE_ID,
} from "#domain/executorCompatibility/index.js";

import { CODEX_CONTRACT_SUITE_DEFINITION } from "../constants/index.js";
import type {
  CodexContractCaseDefinition,
  CodexContractEvidenceArtifact,
  CodexContractSuiteDefinition,
  ProjectCodexContractEvidenceInput,
} from "../contracts/index.js";
import { CodexContractCheckOutcome } from "../enums/index.js";
import { codexContractEvidenceProjectInputSchema } from "../schemas/index.js";

/** 校验 Projector 仅接收所需的精确 Host Scope、Host Digest 与 Locator Kind。 */
export function validateCodexContractProjectInput(
  input: ProjectCodexContractEvidenceInput,
): Result<void, HarnessError> {
  if (!codexContractEvidenceProjectInputSchema.safeParse(input).success) {
    return invalid("Codex Contract Evidence 输入 Schema 无效。");
  }
  return validateCodexContractScope(input.scope);
}

/** 校验 Artifact 固定 Profile、Suite 顺序、Case 完整性与机械聚合语义。 */
export function validateCodexContractArtifactSemantics(
  artifact: CodexContractEvidenceArtifact,
): Result<void, HarnessError> {
  const scope = validateCodexContractScope(artifact.scope);
  if (scope.status === ResultStatus.Failure) return scope;
  if (artifact.profileId !== MANAGED_FILE_MUTATION_HOOK_PROFILE_ID) {
    return invalid("Codex Contract Evidence Profile 不匹配。");
  }
  if (!sameSuiteDefinition(artifact.suite, CODEX_CONTRACT_SUITE_DEFINITION)) {
    return invalid("Codex Contract Suite Definition 发生语义漂移。");
  }
  if (artifact.caseResults.length !== CODEX_CONTRACT_SUITE_DEFINITION.cases.length) {
    return invalid("Codex Contract Case Result 数量不完整。");
  }
  for (let index = 0; index < CODEX_CONTRACT_SUITE_DEFINITION.cases.length; index += 1) {
    const definition = CODEX_CONTRACT_SUITE_DEFINITION.cases[index];
    const result = artifact.caseResults[index];
    if (definition === undefined || result === undefined) {
      return invalid("Codex Contract Case Result 缺失。");
    }
    const checkIds = result.checks.map((check) => check.checkId);
    const aggregated = result.checks.every(
      (check) => check.outcome === CodexContractCheckOutcome.Passed,
    )
      ? ExecutorEvidenceOutcome.Passed
      : ExecutorEvidenceOutcome.Failed;
    if (
      result.caseId !== definition.caseId ||
      result.capability !== definition.capability ||
      !sameStrings(checkIds, definition.checkIds) ||
      result.outcome !== aggregated
    ) {
      return invalid("Codex Contract Case Result 与固定定义不一致。");
    }
  }
  return success(undefined);
}

function validateCodexContractScope(
  scope: ProjectCodexContractEvidenceInput["scope"],
): Result<void, HarnessError> {
  if (
    scope.adapterKind !== ExecutorAdapterKind.Codex ||
    scope.distribution !== ExecutorDistribution.CodexCli ||
    scope.surface !== ExecutorHostSurface.InteractiveTui ||
    scope.modelId !== undefined ||
    scope.permissionMode !== undefined ||
    scope.configurationDigest === undefined
  ) {
    return invalid("Codex Contract Evidence Host Scope 不符合固定信任边界。");
  }
  return success(undefined);
}

function sameSuiteDefinition(
  left: CodexContractSuiteDefinition,
  right: CodexContractSuiteDefinition,
): boolean {
  return (
    left.suiteId === right.suiteId &&
    left.version === right.version &&
    left.cases.length === right.cases.length &&
    left.cases.every((item, index) => sameCaseDefinition(item, right.cases[index]))
  );
}

function sameCaseDefinition(
  left: CodexContractCaseDefinition,
  right: CodexContractCaseDefinition | undefined,
): boolean {
  return (
    right !== undefined &&
    left.caseId === right.caseId &&
    left.capability === right.capability &&
    sameStrings(left.checkIds, right.checkIds)
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function invalid(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
