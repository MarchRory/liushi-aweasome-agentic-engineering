import { join } from "node:path";

import { CodingTaskDeliveryCompletionStatus } from "../../../../dist/index.js";
import { ARTIFACT_TYPES, GATES, SESSION_COMPLETION_INPUT_NAME } from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";
import { createPilotHarnessClient } from "../../harnessClient/index.mjs";
import { verifyPilotPaths } from "../../project/index.mjs";
import { createOrReadControlJson, readControlJson, readStateChain } from "../../state/index.mjs";
import { requireExistingDirectory } from "../../validation/index.mjs";
import { validateWaitingCompletionPilotState } from "../closeout/index.mjs";
import {
  createPilotDependencies,
  createPilotPaths,
  requirePilotRecord,
  requirePilotString,
  validatePilotActor,
} from "../shared/index.mjs";
import {
  createWaitingSettlementPilotState,
  projectCodexAgentPilotCompletion,
  validateWaitingSettlementPilotState,
} from "./codexAgentPilotCompletionState.mjs";
import {
  createSessionCompletionInput,
  validateSessionCompletionInput,
} from "./sessionCompletionInput.mjs";

/** 调用生产 Completion，生成经过验证的 PR-ready Artifact。 */
export async function completeCodexAgentPilot(input, overrides = {}) {
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
    throw new Error("Completion Human actor 不匹配。");
  }
  const context = await createCodexAgentPilotCompletionContext(
    states,
    sourceIndex,
    sourceState,
    paths,
  );
  if (sourceIndex !== states.length - 1) {
    const replay = resolveCompletionReplay(states, sourceIndex, input, context);
    if (replay !== undefined) return replay;
    throw new Error("waiting_completion 状态已被其他 transition 推进。");
  }
  validateWaitingCompletionPilotState(sourceState, context.closeoutSource, paths);
  await verifyPilotPaths(paths);
  const consumer = createPilotHarnessClient({
    consumerRoot: paths.consumerRoot,
    workspaceId: sourceState.task.workspaceId,
    repositoryId: sourceState.fixedProject.repositoryId,
    source: sourceState.task.source,
    runEnvelope: dependencies.runEnvelope,
  });
  const sessionId = sourceState.activation.manifest.sessionId;
  const effectiveEnvelope = await consumer.resolveEffectiveCloseout(sessionId, paths.runtimeRoot);
  const effectiveCloseout = requirePilotRecord(effectiveEnvelope.data, "Effective Closeout");
  const inputFile = join(paths.controlRoot, SESSION_COMPLETION_INPUT_NAME);
  const candidate = createSessionCompletionInput({
    sourceState,
    profileArtifactId: context.profileArtifactId,
    report: context.report,
    effectiveCloseout,
    submittedAt: dependencies.now(),
  });
  const persisted = await createOrReadControlJson(inputFile, candidate);
  const completionInput = validateSessionCompletionInput(persisted.value, {
    sourceState,
    profileArtifactId: context.profileArtifactId,
    report: context.report,
    effectiveCloseout,
  });
  const envelope = await consumer.completeSession(
    inputFile,
    sessionId,
    paths.repositoryRoot,
    sourceState.actor.agentActorId,
    paths.runtimeRoot,
  );
  const result = requirePilotRecord(envelope.data, "Session Completion Result");
  if (result.status !== CodingTaskDeliveryCompletionStatus.ReviewReady) {
    throw new Error("Session Completion 未形成 PR-ready Artifact。");
  }
  const nextState = createWaitingSettlementPilotState({
    sourceState,
    inputFile,
    completionInput,
    effectiveCloseout,
    result,
    humanActorId: input.actorId,
  });
  try {
    const appended = await dependencies.appendDerivedState(paths.stateRoot, nextState, {
      expectedPreviousStateDigest: sourceState.stateDigest,
    });
    validateWaitingSettlementPilotState(appended.state, sourceState, context.closeoutSource, {
      ...context,
      paths,
    });
    return projectCodexAgentPilotCompletion(appended.state, appended.file, false);
  } catch (error) {
    const replay = resolveCompletionReplay(
      await readStateChain(paths.stateRoot),
      sourceIndex,
      input,
      context,
    );
    if (replay !== undefined) return replay;
    throw error;
  }
}

/** 重建 Completion/Settlement 共同依赖的已批准 Profile 上下文。 */
export async function createCodexAgentPilotCompletionContext(
  states,
  sourceIndex,
  sourceState,
  paths,
) {
  const closeoutSource = states.find(
    (state) => state.stateDigest === sourceState.previousStateDigest,
  );
  if (closeoutSource === undefined) throw new Error("Completion 缺少 Closeout 源状态。");
  const g8State = states
    .slice(0, sourceIndex + 1)
    .find((state) => state.gate === GATES.G8 && state.proposal?.artifact !== undefined);
  if (
    g8State?.proposal?.artifact?.artifactType !== ARTIFACT_TYPES.ProjectProfile ||
    typeof g8State.proposal.artifact.artifactId !== "string"
  ) {
    throw new Error("Completion 缺少已批准 G8 Profile Artifact。");
  }
  const report = await readControlJson(sourceState.scan.reportFile);
  if (calculateDigest(report) !== sourceState.scan.reportDigest) {
    throw new Error("Completion 读取的 Scan Report 已漂移。");
  }
  return {
    closeoutSource,
    profileArtifactId: g8State.proposal.artifact.artifactId,
    report,
    paths,
  };
}

function resolveCompletionReplay(states, sourceIndex, input, context) {
  const sourceState = states[sourceIndex];
  const successor = states
    .slice(sourceIndex + 1)
    .find(
      (state) =>
        state.transition?.kind === "session_completion" &&
        state.transition?.sourceStateDigest === input.stateDigest,
    );
  if (successor === undefined) return undefined;
  validateWaitingSettlementPilotState(successor, sourceState, context.closeoutSource, context);
  if (successor.completion.operator.actorId !== input.actorId) {
    throw new Error("Completion replay Human actor 不匹配。");
  }
  return projectCodexAgentPilotCompletion(successor, undefined, true);
}
