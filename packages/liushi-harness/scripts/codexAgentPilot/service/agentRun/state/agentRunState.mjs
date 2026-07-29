import { join, resolve } from "node:path";

import {
  AGENT_EXECUTION_RECORD_NAME,
  AGENT_EXECUTION_STATUS,
  AGENT_LAUNCH_SCHEMA_VERSION,
  CODEX_AGENT_OUTPUT_LIMIT_BYTES,
  CODEX_AGENT_TIMEOUT_MS,
  STATE_STATUS,
} from "../../../constants/index.mjs";
import { calculateDigest } from "../../../digest/index.mjs";
import {
  validatePendingHostApprovalPilotState,
  validateWaitingHostPilotState,
} from "../../shared/index.mjs";

export function createAgentLaunchRecord(input) {
  const body = {
    schemaVersion: AGENT_LAUNCH_SCHEMA_VERSION,
    sourceStateDigest: input.approvedState.stateDigest,
    packetDigest: input.packet.packetDigest,
    approvalDigest: input.approvedState.hostApproval.approvalDigest,
    activationDigest: input.approvedState.activation.activationDigest,
    operator: { kind: "human", actorId: input.actorId },
    agent: { kind: "agent", actorId: input.approvedState.actor.agentActorId },
    promptDigest: input.approvedState.activation.promptDigest,
    launch: {
      executableDigest: input.approvedState.identities.codex.digest,
      argumentsDigest: calculateDigest(input.packet.launch.arguments),
      cwd: input.packet.launch.cwd,
      codexHome: input.approvedState.codex.homeSource,
      timeoutMs: CODEX_AGENT_TIMEOUT_MS,
      outputLimitBytes: CODEX_AGENT_OUTPUT_LIMIT_BYTES,
      executionRecordFile: input.executionRecordFile,
    },
    requestedAt: input.requestedAt,
  };
  return { ...body, launchDigest: calculateDigest(body) };
}

export function createAgentLaunchingState(approvedState, agentLaunch, actorId) {
  return {
    ...approvedState,
    status: STATE_STATUS.AgentLaunching,
    agentLaunch,
    transition: {
      kind: "agent_launch_intent",
      sourceStateDigest: approvedState.stateDigest,
      packetDigest: agentLaunch.packetDigest,
      approvalDigest: approvedState.hostApproval.approvalDigest,
      launchDigest: agentLaunch.launchDigest,
      actorId,
    },
    effects: {
      ...approvedState.effects,
      modelLaunches: 0,
    },
  };
}

export function createAgentExecutionState(launchState, record, recordFile) {
  const status = executionStatusToStateStatus(record.status);
  const agentExecution = {
    file: recordFile,
    sourceStateDigest: launchState.stateDigest,
    launchDigest: launchState.agentLaunch.launchDigest,
    recordDigest: record.recordDigest,
    status: record.status,
  };
  return {
    ...launchState,
    status,
    agentExecution,
    transition: {
      kind: "agent_execution_recorded",
      sourceStateDigest: launchState.stateDigest,
      launchDigest: launchState.agentLaunch.launchDigest,
      recordDigest: record.recordDigest,
      status: record.status,
    },
    effects: {
      ...launchState.effects,
      modelLaunches: record.process.processStarted ? 1 : 0,
    },
  };
}

export function validateHostApprovalSourceChain(states, approvedIndex, paths) {
  const approvedState = states[approvedIndex];
  const pendingState = states[approvedIndex - 1];
  const packetState = states[approvedIndex - 2];
  if (
    pendingState?.stateDigest !== approvedState.previousStateDigest ||
    pendingState.stateDigest !== approvedState.hostApproval.sourceStateDigest ||
    packetState?.stateDigest !== pendingState.previousStateDigest ||
    packetState.stateDigest !== pendingState.transition?.sourceStateDigest
  ) {
    throw new Error("Host Approval 来源状态链无效。");
  }
  validatePendingHostApprovalPilotState(pendingState, paths);
  validateWaitingHostPilotState(packetState, paths);
  return { packetState };
}

export function validateAgentRunInputBinding(state, input) {
  if (
    state.actor?.humanActorId !== input.actorId ||
    state.hostApproval?.actor?.actorId !== input.actorId
  ) {
    throw new Error("Agent Runner actor 不匹配。");
  }
  if (
    state.hostApproval.packetDigest !== input.packetDigest ||
    state.pendingHostApproval?.packetDigest !== input.packetDigest
  ) {
    throw new Error("Agent Runner packetDigest 不匹配。");
  }
}

export function validateAgentLaunchingState(state, approvedState, paths) {
  const launch = state.agentLaunch;
  const { launchDigest, ...launchBody } =
    launch !== null && typeof launch === "object" && !Array.isArray(launch) ? launch : {};
  const expectedRecordFile = join(paths.controlRoot, AGENT_EXECUTION_RECORD_NAME);
  if (
    state.status !== STATE_STATUS.AgentLaunching ||
    state.gate !== null ||
    state.pendingDecisionRequest !== null ||
    state.paths?.root !== paths.root ||
    state.previousStateDigest !== approvedState.stateDigest ||
    launchBody.schemaVersion !== AGENT_LAUNCH_SCHEMA_VERSION ||
    launchBody.sourceStateDigest !== approvedState.stateDigest ||
    launchBody.packetDigest !== approvedState.hostApproval.packetDigest ||
    launchBody.approvalDigest !== approvedState.hostApproval.approvalDigest ||
    launchBody.activationDigest !== approvedState.activation.activationDigest ||
    launchBody.operator?.kind !== "human" ||
    launchBody.operator?.actorId !== approvedState.actor.humanActorId ||
    launchBody.agent?.kind !== "agent" ||
    launchBody.agent?.actorId !== approvedState.actor.agentActorId ||
    launchBody.promptDigest !== approvedState.activation.promptDigest ||
    launchBody.launch?.executableDigest !== approvedState.identities.codex.digest ||
    launchBody.launch?.argumentsDigest !==
      calculateDigest(approvedState.hostPreview.packet.launch.arguments) ||
    launchBody.launch?.cwd !== approvedState.activation.worktreeRoot ||
    launchBody.launch?.codexHome !== approvedState.codex.homeSource ||
    launchBody.launch?.timeoutMs !== CODEX_AGENT_TIMEOUT_MS ||
    launchBody.launch?.outputLimitBytes !== CODEX_AGENT_OUTPUT_LIMIT_BYTES ||
    resolve(launchBody.launch?.executionRecordFile ?? "") !== resolve(expectedRecordFile) ||
    !isCanonicalTimestamp(launchBody.requestedAt) ||
    calculateDigest(launchBody) !== launchDigest ||
    state.transition?.kind !== "agent_launch_intent" ||
    state.transition?.sourceStateDigest !== approvedState.stateDigest ||
    state.transition?.packetDigest !== launchBody.packetDigest ||
    state.transition?.approvalDigest !== launchBody.approvalDigest ||
    state.transition?.launchDigest !== launchDigest ||
    state.transition?.actorId !== approvedState.actor.humanActorId ||
    state.effects?.modelLaunches !== 0
  ) {
    throw new Error("Agent Launch Intent 状态无效。");
  }
}

export function validateFinalExecutionState(state, launchState, record, paths) {
  const expectedStatus = executionStatusToStateStatus(record.status);
  const expectedLaunchCount = record.process.processStarted ? 1 : 0;
  if (
    state.status !== expectedStatus ||
    state.gate !== null ||
    state.pendingDecisionRequest !== null ||
    state.paths?.root !== paths.root ||
    state.previousStateDigest !== launchState.stateDigest ||
    state.agentExecution?.file !== launchState.agentLaunch.launch.executionRecordFile ||
    state.agentExecution?.sourceStateDigest !== launchState.stateDigest ||
    state.agentExecution?.launchDigest !== launchState.agentLaunch.launchDigest ||
    state.agentExecution?.recordDigest !== record.recordDigest ||
    state.agentExecution?.status !== record.status ||
    state.transition?.kind !== "agent_execution_recorded" ||
    state.transition?.sourceStateDigest !== launchState.stateDigest ||
    state.transition?.launchDigest !== launchState.agentLaunch.launchDigest ||
    state.transition?.recordDigest !== record.recordDigest ||
    state.transition?.status !== record.status ||
    state.effects?.modelLaunches !== expectedLaunchCount
  ) {
    throw new Error("Agent Execution 最终状态无效。");
  }
}

export function projectAgentRunResult(state, record, stateFile, replayed, recovered) {
  return {
    status: state.status,
    revision: state.revision,
    stateFile,
    stateDigest: state.stateDigest,
    agentExecution: state.agentExecution,
    record,
    replayed,
    recovered,
  };
}

function executionStatusToStateStatus(status) {
  if (status === AGENT_EXECUTION_STATUS.Passed) return STATE_STATUS.WaitingCloseout;
  if (status === AGENT_EXECUTION_STATUS.Failed) return STATE_STATUS.AgentFailed;
  if (status === AGENT_EXECUTION_STATUS.OutcomeUnknown) {
    return STATE_STATUS.AgentOutcomeUnknown;
  }
  throw new Error("Agent Execution status 无效。");
}

function isCanonicalTimestamp(value) {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
