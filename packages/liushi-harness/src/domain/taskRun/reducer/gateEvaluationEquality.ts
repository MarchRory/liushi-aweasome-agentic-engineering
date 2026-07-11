import type { GateEvaluation } from "#domain/gate/index.js";

/** 比较持久化 GateEvaluation 与确定性重算结果是否逐字段一致。 */
export function gateEvaluationsEqual(left: GateEvaluation, right: GateEvaluation): boolean {
  return (
    left.result === right.result &&
    left.riskLevel === right.riskLevel &&
    left.artifactId === right.artifactId &&
    left.artifactDigest === right.artifactDigest &&
    left.evaluatedAt === right.evaluatedAt &&
    arraysEqual(left.requiredGates, right.requiredGates) &&
    arraysEqual(left.satisfiedApprovals, right.satisfiedApprovals) &&
    arraysEqual(left.reasons, right.reasons) &&
    arraysEqual(left.evidenceIds, right.evidenceIds)
  );
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
