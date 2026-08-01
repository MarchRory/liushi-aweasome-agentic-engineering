import { join } from "node:path";

import { CodingTaskSessionCloseoutStatus } from "../../../../dist/index.js";
import { SESSION_CLOSEOUT_COMMAND_NAME } from "../../constants/index.mjs";
import { createPilotHarnessClient } from "../../harnessClient/index.mjs";
import { verifyPilotPaths } from "../../project/index.mjs";
import { createOrReadControlJson, readStateChain } from "../../state/index.mjs";
import { requireExistingDirectory } from "../../validation/index.mjs";
import {
  createPilotDependencies,
  createPilotPaths,
  requirePilotRecord,
  requirePilotString,
  validatePilotActor,
} from "../shared/index.mjs";
import {
  createCloseoutCommandBinding,
  createWaitingCompletionPilotState,
  projectCodexAgentPilotCloseout,
  validateWaitingCloseoutPilotState,
  validateWaitingCompletionPilotState,
} from "./codexAgentPilotCloseoutState.mjs";
import {
  createSessionCloseoutCommand,
  validateSessionCloseoutCommand,
} from "./sessionCloseoutCommand.mjs";

/** Human 复核 Agent 变更后，调用生产 Session Closeout 形成唯一 Checkpoint。 */
export async function closeoutCodexAgentPilot(input, overrides = {}) {
  const dependencies = createPilotDependencies(overrides);
  validatePilotActor(input.actorId);
  requirePilotString(input.stateDigest, "stateDigest");
  const root = await requireExistingDirectory(input.root, "--root");
  const paths = createPilotPaths(root);
  const states = await readStateChain(paths.stateRoot);
  const sourceIndex = states.findIndex((state) => state.stateDigest === input.stateDigest);
  if (sourceIndex < 0) throw new Error("stateDigest 不匹配。");
  const sourceState = states[sourceIndex];
  if (sourceState.actor?.humanActorId !== input.actorId) {
    throw new Error("Closeout Human actor 不匹配。");
  }
  if (sourceIndex !== states.length - 1) {
    const replay = resolveCompletedCloseoutReplay(states, sourceIndex, input, paths);
    if (replay !== undefined) return replay;
    throw new Error("waiting_closeout 状态已被其他 transition 推进。");
  }
  validateWaitingCloseoutPilotState(sourceState, paths);
  await verifyPilotPaths(paths);
  const commandFile = join(paths.controlRoot, SESSION_CLOSEOUT_COMMAND_NAME);
  const candidate = createSessionCloseoutCommand(
    createCloseoutCommandBinding(sourceState, dependencies.now()),
  );
  const persisted = await createOrReadControlJson(commandFile, candidate);
  const command = validateSessionCloseoutCommand(
    persisted.value,
    createCloseoutCommandBinding(sourceState, persisted.value?.submittedAt),
  );
  const consumer = createPilotHarnessClient({
    consumerRoot: paths.consumerRoot,
    workspaceId: sourceState.task.workspaceId,
    repositoryId: sourceState.fixedProject.repositoryId,
    source: sourceState.task.source,
    runEnvelope: dependencies.runEnvelope,
  });
  const envelope = await consumer.closeoutSession(
    commandFile,
    paths.repositoryRoot,
    sourceState.actor.agentActorId,
    paths.runtimeRoot,
  );
  const result = requirePilotRecord(envelope.data, "Session Closeout Result");
  if (
    envelope.status !== "success" ||
    result.status !== CodingTaskSessionCloseoutStatus.CheckpointBound
  ) {
    throw new Error("Session Closeout 未形成唯一 Checkpoint。");
  }
  const nextState = createWaitingCompletionPilotState({
    sourceState,
    commandFile,
    command,
    result,
    humanActorId: input.actorId,
  });
  try {
    const appended = await dependencies.appendDerivedState(paths.stateRoot, nextState, {
      expectedPreviousStateDigest: sourceState.stateDigest,
    });
    validateWaitingCompletionPilotState(appended.state, sourceState, paths);
    return projectCodexAgentPilotCloseout(appended.state, appended.file, false);
  } catch (error) {
    const replay = resolveCompletedCloseoutReplay(
      await readStateChain(paths.stateRoot),
      sourceIndex,
      input,
      paths,
    );
    if (replay !== undefined) return replay;
    throw error;
  }
}

function resolveCompletedCloseoutReplay(states, sourceIndex, input, paths) {
  const sourceState = states[sourceIndex];
  const successor = states
    .slice(sourceIndex + 1)
    .find(
      (state) =>
        state.transition?.kind === "session_closeout" &&
        state.transition?.sourceStateDigest === input.stateDigest,
    );
  if (successor === undefined) return undefined;
  validateWaitingCompletionPilotState(successor, sourceState, paths);
  if (successor.closeout.operator.actorId !== input.actorId) {
    throw new Error("Closeout replay Human actor 不匹配。");
  }
  return projectCodexAgentPilotCloseout(successor, undefined, true);
}
