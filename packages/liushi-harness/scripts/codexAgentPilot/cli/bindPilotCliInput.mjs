import { GATES, STATE_STATUS } from "../constants/index.mjs";
import { pilotCliCommands } from "./parsePilotCli.mjs";

/** 将 Human 的语义命令绑定到内部状态版本，摘要不进入人工操作面。 */
export function bindPilotCliInput(input, states) {
  if (input.command === pilotCliCommands.prepare) return input;
  if (!Array.isArray(states) || states.length === 0) {
    throw new Error("Pilot 状态链为空。");
  }
  const source = findCommandSource(input, states);
  const common = { ...input, stateDigest: requireDigest(source.stateDigest, "stateDigest") };
  if (input.command === pilotCliCommands.approveHost) {
    return {
      ...common,
      packetDigest: requireDigest(source.pendingHostApproval?.packetDigest, "packetDigest"),
    };
  }
  if (input.command === pilotCliCommands.runAgent) {
    return {
      ...common,
      packetDigest: requireDigest(source.hostApproval?.packetDigest, "packetDigest"),
    };
  }
  return common;
}

function findCommandSource(input, states) {
  if (input.command === pilotCliCommands.approve) {
    if (!Object.values(GATES).includes(input.gate)) throw new Error("审批 Gate 无效。");
    return requireSource(
      states,
      (state) => state.status === STATE_STATUS.WaitingApproval && state.gate === input.gate,
      `未找到等待 ${input.gate} 审批的状态。`,
    );
  }
  if (input.command === pilotCliCommands.previewHost) {
    return requireSource(
      states,
      (state) =>
        state.status === STATE_STATUS.WaitingHostApproval && state.hostPreview === undefined,
      "未找到等待 Host 预检的状态。",
    );
  }
  if (input.command === pilotCliCommands.approveHost) {
    return requireSource(
      states,
      (state) => state.pendingHostApproval?.approved === false,
      "未找到等待 Human 确认的 Host 审批包。",
    );
  }
  if (input.command === pilotCliCommands.runAgent) {
    return requireSource(
      states,
      (state) => state.status === STATE_STATUS.HostApproved,
      "未找到已经 Human 确认的 Host 状态。",
    );
  }
  if (input.command === pilotCliCommands.closeout) {
    return requireSource(
      states,
      (state) => state.status === STATE_STATUS.WaitingCloseout,
      "未找到等待 Human 复核变更的 Closeout 状态。",
    );
  }
  throw new Error(`无法绑定 Pilot 命令 ${input.command}。`);
}

function requireSource(states, predicate, message) {
  const source = states.findLast(predicate);
  if (source === undefined) throw new Error(message);
  return source;
}

function requireDigest(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`内部 ${label} 缺失。`);
  }
  return value;
}
