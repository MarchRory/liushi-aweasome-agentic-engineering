export function resolveCompletedApprovalReplay(states, input) {
  const source = states.find((state) => state.stateDigest === input.stateDigest);
  if (source === undefined) return undefined;
  if (source.actor?.humanActorId !== input.actorId) {
    throw new Error("Human actor 不匹配。");
  }

  const successor = states.find((state) => state.previousStateDigest === source.stateDigest);
  if (successor === undefined) return undefined;

  const request = requireRecord(source.pendingDecisionRequest, "原始 DecisionRequest");
  const transition = requireRecord(successor.transition, "审批重放 Transition");
  const approval = successor.approvals?.at(-1);
  const idempotencyKey = `codex-agent-pilot:${source.revision}:${request.decisionRequestId}`;
  if (
    successor.revision !== source.revision + 1 ||
    transition.kind !== "approval" ||
    transition.sourceStateDigest !== source.stateDigest ||
    transition.gate !== source.gate ||
    transition.actorId !== input.actorId ||
    transition.decisionRequestId !== request.decisionRequestId ||
    transition.decisionRequestDigest !== request.digest ||
    transition.idempotencyKey !== idempotencyKey ||
    approval?.decisionRequestId !== request.decisionRequestId ||
    approval?.decisionRequestDigest !== request.digest ||
    approval?.gate !== source.gate ||
    approval?.actor?.actorId !== input.actorId ||
    approval?.idempotencyKey !== idempotencyKey
  ) {
    throw new Error("已完成审批的重放证据与原始状态不一致。");
  }
  return successor;
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}
