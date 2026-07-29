import { join, resolve } from "node:path";

import { HOST_APPROVAL_PACKET_PREFIX } from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import { readControlJson } from "../../state/index.mjs";
import { requireExistingFile } from "../../validation/index.mjs";
import { createCodexHostApprovalPacket } from "../packet/index.mjs";

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;

export async function readValidatedCodexHostApprovalPacket(input) {
  if (!SHA256_DIGEST.test(input.packetDigest)) {
    throw new Error("Host Approval packetDigest 无效。");
  }
  const expectedFile = join(
    input.controlRoot,
    `${HOST_APPROVAL_PACKET_PREFIX}${input.packetDigest.slice("sha256:".length)}.json`,
  );
  if (
    typeof input.state.hostPreview?.packetFile !== "string" ||
    resolve(input.state.hostPreview.packetFile) !== resolve(expectedFile)
  ) {
    throw new Error("Host Approval Packet 路径未绑定 packetDigest。");
  }
  await requireExistingFile(expectedFile, "Host Approval Packet");
  const packet = await readControlJson(expectedFile);
  const { packetDigest, ...packetBody } = requireRecord(packet, "Host Approval Packet");
  if (
    packetDigest !== input.packetDigest ||
    calculateDigest(packetBody) !== packetDigest ||
    calculateDigest(packet) !== calculateDigest(input.state.hostPreview?.packet) ||
    input.state.hostPreview?.packetDigest !== packetDigest ||
    input.state.pendingHostApproval?.packetDigest !== packetDigest
  ) {
    throw new Error("Host Approval Packet 摘要或状态绑定无效。");
  }

  const expectedPacket = createCodexHostApprovalPacket({
    state: input.packetState,
    artifacts: input.artifacts,
    worktreeIdentity: input.worktreeIdentity,
    preflightEvidence: requireRecord(
      packet.preflight?.evidence,
      "Codex App Server Preflight Evidence",
    ),
  });
  if (
    expectedPacket.packetDigest !== packetDigest ||
    calculateDigest(expectedPacket) !== calculateDigest(packet)
  ) {
    throw new Error("Host Approval Packet 无法由当前权威状态重建。");
  }
  return { packet, packetFile: expectedFile };
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}
