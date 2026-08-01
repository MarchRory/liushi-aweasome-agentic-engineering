import { join } from "node:path";

import { ActorKind, CodingTaskSessionCloseoutStatus } from "../../../../dist/index.js";
import {
  AGENT_EXECUTION_RECORD_NAME,
  AGENT_EXECUTION_STATUS,
  SESSION_CLOSEOUT_COMMAND_NAME,
  STATE_STATUS,
} from "../../constants/index.mjs";
import { validateCodexAgentPilotMetricsEnrollmentState } from "../../metrics/index.mjs";
import { validatePilotFixedProjectState } from "../shared/index.mjs";
import { validateSessionCloseoutCommand } from "./sessionCloseoutCommand.mjs";

/** 校验 Human 可以显式触发 Closeout 的唯一 Pilot 状态。 */
export function validateWaitingCloseoutPilotState(state, paths) {
  validatePilotFixedProjectState(state);
  validateCodexAgentPilotMetricsEnrollmentState(state);
  if (
    state.status !== STATE_STATUS.WaitingCloseout ||
    state.gate !== null ||
    state.pendingDecisionRequest !== null ||
    state.paths?.root !== paths.root ||
    state.agentExecution?.status !== AGENT_EXECUTION_STATUS.Passed ||
    state.agentExecution?.file !== join(paths.controlRoot, AGENT_EXECUTION_RECORD_NAME) ||
    state.transition?.kind !== "agent_execution_recorded" ||
    state.effects?.modelLaunches !== 1 ||
    state.effects?.checkpointCreations !== 0 ||
    state.closeout !== undefined
  ) {
    throw new Error("当前状态不是可由 Human 确认的 waiting_closeout。");
  }
}

/** 创建已经形成唯一 Checkpoint、等待 Completion 的后继状态。 */
export function createWaitingCompletionPilotState(input) {
  return {
    ...input.sourceState,
    status: STATE_STATUS.WaitingCompletion,
    closeout: {
      commandFile: input.commandFile,
      command: globalThis.structuredClone(input.command),
      result: globalThis.structuredClone(input.result),
      operator: { kind: ActorKind.Human, actorId: input.humanActorId },
    },
    transition: {
      kind: "session_closeout",
      sourceStateDigest: input.sourceState.stateDigest,
      commandId: input.command.commandId,
      actorId: input.humanActorId,
    },
    effects: {
      ...input.sourceState.effects,
      checkpointCreations: 1,
    },
  };
}

/** 校验 Closeout 后继状态与源 Session、Human 和生产结果的绑定。 */
export function validateWaitingCompletionPilotState(state, sourceState, paths) {
  validateWaitingCloseoutPilotState(sourceState, paths);
  const command = validateSessionCloseoutCommand(
    state.closeout?.command,
    createCloseoutCommandBinding(sourceState, state.closeout?.command?.submittedAt),
  );
  if (
    state.status !== STATE_STATUS.WaitingCompletion ||
    state.previousStateDigest !== sourceState.stateDigest ||
    state.closeout?.commandFile !== join(paths.controlRoot, SESSION_CLOSEOUT_COMMAND_NAME) ||
    state.closeout?.result?.status !== CodingTaskSessionCloseoutStatus.CheckpointBound ||
    state.closeout?.operator?.kind !== ActorKind.Human ||
    state.closeout?.operator?.actorId !== sourceState.actor?.humanActorId ||
    state.transition?.kind !== "session_closeout" ||
    state.transition?.sourceStateDigest !== sourceState.stateDigest ||
    state.transition?.commandId !== command.commandId ||
    state.transition?.actorId !== sourceState.actor?.humanActorId ||
    state.effects?.checkpointCreations !== 1
  ) {
    throw new Error("waiting_completion 状态未绑定权威 Closeout 结果。");
  }
}

/** 从 Pilot 状态提取生产 Closeout Command 的固定身份。 */
export function createCloseoutCommandBinding(state, submittedAt) {
  return {
    workspaceId: state.task?.workspaceId,
    sessionId: state.activation?.manifest?.sessionId,
    agentActorId: state.actor?.agentActorId,
    correlationId: state.activation?.manifest?.createCommand?.correlationId,
    submittedAt,
  };
}

/** 输出不包含额外推断的 Closeout 状态投影。 */
export function projectCodexAgentPilotCloseout(state, stateFile, replayed) {
  return {
    status: state.status,
    revision: state.revision,
    stateFile,
    stateDigest: state.stateDigest,
    closeout: state.closeout,
    replayed,
  };
}
