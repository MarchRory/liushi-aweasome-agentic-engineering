import { resolve } from "node:path";

import {
  CODEX_FILE_CHANGE_DECISION,
  CODEX_FILE_CHANGE_KIND,
  FILE_CHANGE_AUTHORIZATION_SCHEMA_VERSION,
} from "../../../constants/index.mjs";
import { calculateDigest } from "../../../digest/index.mjs";
import { assertHostTargetSnapshotStable } from "../../../host/index.mjs";
import { readStateChain } from "../../../state/index.mjs";
import { capturePilotWorktreeIdentity } from "../../shared/index.mjs";

export function createAgentFileChangeAuthorizer(input) {
  let decisionCount = 0;
  return async (proposal) => {
    decisionCount += 1;
    if (decisionCount !== 1) {
      throw new Error("每次 Pilot 只允许一个 FileChange 审批请求。");
    }
    validateProposal(proposal, input);
    const latest = (await readStateChain(input.paths.stateRoot)).at(-1);
    if (latest.stateDigest !== input.launchState.stateDigest) {
      throw new Error("FileChange 审批前状态链已推进。");
    }
    await assertHostTargetSnapshotStable(input.artifacts);
    const worktreeIdentity = capturePilotWorktreeIdentity(
      input.artifacts.worktreeRoot,
      input.dependencies.runGit,
      input.approvedState.fixedProject.revision,
    );
    if (
      calculateDigest(worktreeIdentity) !== calculateDigest(input.launchBaseline.worktreeIdentity)
    ) {
      throw new Error("FileChange 审批前 Worktree baseline 发生漂移。");
    }
    await input.recordPreAction(proposal);

    const body = {
      schemaVersion: FILE_CHANGE_AUTHORIZATION_SCHEMA_VERSION,
      decision: CODEX_FILE_CHANGE_DECISION.Accept,
      sourceStateDigest: input.launchState.stateDigest,
      launchDigest: input.launchState.agentLaunch.launchDigest,
      packetDigest: input.packet.packetDigest,
      approvalDigest: input.approvedState.hostApproval.approvalDigest,
      humanActorId: input.approvedState.actor.humanActorId,
      proposalDigest: calculateDigest(proposal),
      writeSetDigest: calculateDigest(input.packet.actionControl.allowedAbsolutePaths),
      targetDigest: input.launchBaseline.target.digest,
      authorizedAt: requireIsoTimestamp(input.dependencies.now()),
    };
    return {
      approved: true,
      evidence: {
        ...body,
        authorizationDigest: calculateDigest(body),
      },
    };
  };
}

function validateProposal(proposal, input) {
  const changes = Array.isArray(proposal?.changes) ? proposal.changes : [];
  const allowedPaths = input.packet.actionControl?.allowedAbsolutePaths;
  if (
    input.approvedState.fixedProject.historicalLogicChange !== false ||
    input.packet.project?.historicalLogicChange !== false ||
    proposal?.grantRoot !== null ||
    typeof proposal?.threadId !== "string" ||
    typeof proposal?.turnId !== "string" ||
    typeof proposal?.itemId !== "string" ||
    changes.length !== 1 ||
    !Array.isArray(allowedPaths) ||
    allowedPaths.length !== 1 ||
    resolve(changes[0]?.path ?? "") !== resolve(allowedPaths[0]) ||
    changes[0]?.kind !== CODEX_FILE_CHANGE_KIND.Update
  ) {
    throw new Error("FileChange proposal 未精确绑定 Human 批准的写集。");
  }
}

function requireIsoTimestamp(value) {
  if (
    typeof value !== "string" ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error("FileChange authorizedAt 无效。");
  }
  return value;
}
