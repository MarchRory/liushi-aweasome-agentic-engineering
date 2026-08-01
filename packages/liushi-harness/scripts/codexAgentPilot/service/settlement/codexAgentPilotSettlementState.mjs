import { join } from "node:path";

import { ActorKind } from "../../../../dist/index.js";
import { PILOT_METRICS_SETTLEMENT_NAME, STATE_STATUS } from "../../constants/index.mjs";
import {
  validateCodexAgentPilotMetricsSettlementDraft,
  validateCodexAgentPilotMetricsSettlementResult,
} from "../../metrics/index.mjs";
import { validateWaitingSettlementPilotState } from "../completion/index.mjs";

/** 创建 Metrics 已结算的 Pilot 完成状态。 */
export function createCompletedPilotState(input) {
  return {
    ...input.sourceState,
    status: STATE_STATUS.Completed,
    settlement: {
      factsFile: input.factsFile,
      inputFile: input.inputFile,
      input: globalThis.structuredClone(input.settlementInput),
      result: globalThis.structuredClone(input.result),
      operator: { kind: ActorKind.Human, actorId: input.humanActorId },
    },
    transition: {
      kind: "metrics_settlement",
      sourceStateDigest: input.sourceState.stateDigest,
      settlementDigest: input.result.record.recordDigest,
      actorId: input.humanActorId,
    },
    effects: {
      ...input.sourceState.effects,
      metricsSettlements: 1,
    },
  };
}

/** 复验最终状态与 Human Facts、Completion 和生产 Settlement 的绑定。 */
export function validateCompletedPilotState(state, sourceState, completionSource, context) {
  validateWaitingSettlementPilotState(
    sourceState,
    completionSource,
    context.closeoutSource,
    context,
  );
  const settlementInput = validateCodexAgentPilotMetricsSettlementDraft(state.settlement?.input, {
    sourceState,
    facts: context.facts,
    actorId: sourceState.actor?.humanActorId,
  });
  const settlementResult = validateCodexAgentPilotMetricsSettlementResult(
    state.settlement?.result,
    settlementInput,
  );
  if (
    state.status !== STATE_STATUS.Completed ||
    state.previousStateDigest !== sourceState.stateDigest ||
    state.settlement?.factsFile !== context.factsFile ||
    state.settlement?.inputFile !==
      join(context.paths.controlRoot, PILOT_METRICS_SETTLEMENT_NAME) ||
    settlementResult.record.recordDigest !== state.transition?.settlementDigest ||
    settlementResult.record.settledAt !== settlementInput.settledAt ||
    state.settlement?.operator?.kind !== ActorKind.Human ||
    state.settlement?.operator?.actorId !== sourceState.actor?.humanActorId ||
    state.transition?.kind !== "metrics_settlement" ||
    state.transition?.sourceStateDigest !== sourceState.stateDigest ||
    state.transition?.actorId !== sourceState.actor?.humanActorId ||
    state.effects?.metricsSettlements !== 1
  ) {
    throw new Error("completed 状态未绑定生产 Metrics Settlement。");
  }
}

/** 输出已结算且保留 PR-ready Artifact 的最终 Pilot 状态。 */
export function projectCodexAgentPilotSettlement(state, stateFile, replayed) {
  return {
    status: state.status,
    revision: state.revision,
    stateFile,
    stateDigest: state.stateDigest,
    prReadyArtifact: state.completion.result.prReadyArtifact,
    settlement: state.settlement,
    replayed,
  };
}
