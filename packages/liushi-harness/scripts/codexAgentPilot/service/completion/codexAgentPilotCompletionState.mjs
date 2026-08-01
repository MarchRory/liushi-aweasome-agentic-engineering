import { join } from "node:path";

import {
  ActorKind,
  CodingTaskDeliveryCompletionStatus,
  VerificationStatus,
} from "../../../../dist/index.js";
import { SESSION_COMPLETION_INPUT_NAME, STATE_STATUS } from "../../constants/index.mjs";
import { validateWaitingCompletionPilotState } from "../closeout/index.mjs";
import { validateSessionCompletionInput } from "./sessionCompletionInput.mjs";

/** 创建已形成 PR-ready Artifact、等待 Metrics Settlement 的状态。 */
export function createWaitingSettlementPilotState(input) {
  return {
    ...input.sourceState,
    status: STATE_STATUS.WaitingSettlement,
    completion: {
      inputFile: input.inputFile,
      input: globalThis.structuredClone(input.completionInput),
      effectiveCloseout: globalThis.structuredClone(input.effectiveCloseout),
      result: globalThis.structuredClone(input.result),
      operator: { kind: ActorKind.Human, actorId: input.humanActorId },
    },
    transition: {
      kind: "session_completion",
      sourceStateDigest: input.sourceState.stateDigest,
      commandId: input.completionInput.deliveryCommand.commandId,
      actorId: input.humanActorId,
    },
    effects: {
      ...input.sourceState.effects,
      completionExecutions: 1,
    },
  };
}

/** 复验 Pilot Completion 状态与生产 PR-ready 结果的完整绑定。 */
export function validateWaitingSettlementPilotState(state, sourceState, closeoutSource, context) {
  validateWaitingCompletionPilotState(sourceState, closeoutSource, context.paths);
  const completion = validateSessionCompletionInput(state.completion?.input, {
    sourceState,
    profileArtifactId: context.profileArtifactId,
    report: context.report,
    effectiveCloseout: state.completion?.effectiveCloseout,
  });
  const result = state.completion?.result;
  if (
    state.status !== STATE_STATUS.WaitingSettlement ||
    state.previousStateDigest !== sourceState.stateDigest ||
    state.completion?.inputFile !==
      join(context.paths.controlRoot, SESSION_COMPLETION_INPUT_NAME) ||
    result?.status !== CodingTaskDeliveryCompletionStatus.ReviewReady ||
    result?.evidenceBundle?.status !== VerificationStatus.Passed ||
    result?.evidenceBundle?.verificationRunId !== completion.verification.verificationRunId ||
    result?.evidenceBundle?.planId !== completion.verification.planId ||
    typeof result?.prReadyArtifact?.artifactDigest !== "string" ||
    state.completion?.operator?.kind !== ActorKind.Human ||
    state.completion?.operator?.actorId !== sourceState.actor?.humanActorId ||
    state.transition?.kind !== "session_completion" ||
    state.transition?.sourceStateDigest !== sourceState.stateDigest ||
    state.transition?.commandId !== completion.deliveryCommand.commandId ||
    state.transition?.actorId !== sourceState.actor?.humanActorId ||
    state.effects?.completionExecutions !== 1
  ) {
    throw new Error("waiting_settlement 状态未绑定生产 Completion 结果。");
  }
}

/** 输出 Completion 形成的 PR-ready 状态。 */
export function projectCodexAgentPilotCompletion(state, stateFile, replayed) {
  return {
    status: state.status,
    revision: state.revision,
    stateFile,
    stateDigest: state.stateDigest,
    completion: state.completion,
    replayed,
  };
}
