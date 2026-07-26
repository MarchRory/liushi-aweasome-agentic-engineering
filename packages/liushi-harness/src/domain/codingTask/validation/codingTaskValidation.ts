import { HarnessError, HarnessErrorCode, normalizeRepositoryRelativePath } from "#common/index.js";
import { GateEvaluationResult, GateId } from "#domain/policy/index.js";

import type {
  CodingTaskExecutionAuthorization,
  CodingTaskGateBinding,
  WorktreeBinding,
} from "../contracts/index.js";

/** 规范化并校验非空的相对 POSIX 写入路径集合。 */
export function normalizeWriteSet(writeSet: readonly string[]): readonly string[] {
  if (writeSet.length === 0) throw invalid("writeSet 必须非空。", "writeSet");
  const normalized = writeSet.map((path) => normalizePath(path));
  const unique = [...new Set(normalized)].sort();
  if (unique.length !== normalized.length) throw invalid("writeSet 不允许重复路径。", "writeSet");
  return unique;
}

/** 断言事件中的写入集合已经是确定性的规范形式。 */
export function assertCanonicalWriteSet(writeSet: readonly string[]): void {
  const canonical = normalizeWriteSet(writeSet);
  if (
    canonical.length !== writeSet.length ||
    canonical.some((path, index) => path !== writeSet[index])
  ) {
    throw corrupt("Event 的 writeSet 不是确定性的规范形式。", "writeSet");
  }
}

/** 校验事件时间是可稳定解析的 ISO 时间。 */
export function assertEventTime(value: string): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw corrupt("Event 时间无效。", "occurredAt");
}

/** 校验 CodingTask 创建时锁定的 Base Revision 和 Worktree 绑定。 */
export function assertCodingTaskCreationBinding(
  baseRevision: string,
  worktreeBinding: WorktreeBinding,
): void {
  if (!isNonBlank(baseRevision)) throw invalid("baseRevision 必须非空。", "baseRevision");
  if (!isNonBlank(worktreeBinding.worktreeId)) {
    throw invalid("worktreeId 必须非空。", "worktreeBinding.worktreeId");
  }
  if (!isNonBlank(worktreeBinding.branchName)) {
    throw invalid("branchName 必须非空。", "worktreeBinding.branchName");
  }
  if (typeof worktreeBinding.managed !== "boolean") {
    throw invalid("managed 必须是布尔值。", "worktreeBinding.managed");
  }
  const normalizedPath = normalizePath(worktreeBinding.relativePath);
  if (normalizedPath !== worktreeBinding.relativePath) {
    throw invalid("relativePath 必须是规范相对 POSIX 路径。", "worktreeBinding.relativePath");
  }
}

/** 校验 CodingTask 创建时的 PlanRisk、业务逻辑和 Human Gate 绑定。 */
export function assertCodingTaskExecutionAuthorization(
  authorization: CodingTaskExecutionAuthorization,
): void {
  assertGateBinding(authorization.planRisk, "executionAuthorization.planRisk");
  if (authorization.historicalLogicChange && authorization.businessLogic === undefined) {
    throw invalid(
      "历史业务逻辑变更必须绑定已通过 G2 的 Business Logic 授权。",
      "executionAuthorization.businessLogic",
    );
  }
  if (!authorization.historicalLogicChange && authorization.businessLogic !== undefined) {
    throw invalid(
      "非历史逻辑变更不能携带额外的 Business Logic 授权。",
      "executionAuthorization.businessLogic",
    );
  }
  if (authorization.businessLogic !== undefined) {
    assertGateBinding(authorization.businessLogic, "executionAuthorization.businessLogic");
    if (!authorization.businessLogic.requiredGates.includes(GateId.G2BusinessLogic)) {
      throw invalid(
        "历史业务逻辑授权必须明确包含 G2BusinessLogic。",
        "executionAuthorization.businessLogic.requiredGates",
      );
    }
  }
}

function normalizePath(value: string): string {
  const normalized = normalizeRepositoryRelativePath(value);
  if (normalized === undefined) {
    throw invalid("writeSet 只能包含规范相对路径。", "writeSet");
  }
  return normalized;
}

function isNonBlank(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function assertGateBinding(binding: CodingTaskGateBinding, field: string): void {
  if (binding.result !== GateEvaluationResult.Allow) {
    throw invalid("CodingTask 只能绑定已通过 Gate 的授权。", `${field}.result`);
  }
  const requiredGates = new Set(binding.requiredGates);
  const satisfiedApprovalIds = new Set(binding.satisfiedApprovalIds);
  if (
    requiredGates.size !== binding.requiredGates.length ||
    satisfiedApprovalIds.size !== binding.satisfiedApprovalIds.length ||
    binding.satisfiedApprovalIds.length !== binding.requiredGates.length
  ) {
    throw invalid("Gate 授权的 Gate 和 Approval 集合必须确定且一一对应。", field);
  }
  if (typeof binding.artifactId !== "string" || typeof binding.artifactDigest !== "string") {
    throw invalid("Gate 授权必须绑定 Artifact 标识和 Digest。", field);
  }
}

function invalid(message: string, field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, message, { field });
}
function corrupt(message: string, field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message, { field });
}
