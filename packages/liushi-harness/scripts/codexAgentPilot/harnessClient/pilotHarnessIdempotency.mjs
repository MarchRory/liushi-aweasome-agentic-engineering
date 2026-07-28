/** 为单个 Pilot Task 的 Gate Proposal 生成跨重试稳定的幂等键。 */
export function createPilotProposalIdempotencyKey(taskId, gate) {
  return `codex-agent-pilot:${taskId}:proposal:${gate}`;
}
