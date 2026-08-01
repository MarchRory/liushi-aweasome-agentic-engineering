import { join } from "node:path";

import { PILOT_METRICS_SETTLEMENT_NAME } from "../../constants/index.mjs";
import { createPilotHarnessClient } from "../../harnessClient/index.mjs";
import {
  createCodexAgentPilotMetricsSettlementDraft,
  validateCodexAgentPilotMetricsSettlementDraft,
  validateCodexAgentPilotMetricsSettlementEnvelope,
} from "../../metrics/index.mjs";
import { verifyPilotPaths } from "../../project/index.mjs";
import { createOrReadControlJson, readControlJson, readStateChain } from "../../state/index.mjs";
import { requireExistingDirectory, requireExistingFile } from "../../validation/index.mjs";
import {
  createCodexAgentPilotCompletionContext,
  validateWaitingSettlementPilotState,
} from "../completion/index.mjs";
import {
  createPilotDependencies,
  createPilotPaths,
  requirePilotString,
  validatePilotActor,
} from "../shared/index.mjs";
import {
  createCompletedPilotState,
  projectCodexAgentPilotSettlement,
  validateCompletedPilotState,
} from "./codexAgentPilotSettlementState.mjs";

/** 将 Human 原始事实提交到生产 Metrics Settlement。 */
export async function settleCodexAgentPilot(input, overrides = {}) {
  const dependencies = createPilotDependencies(overrides);
  validatePilotActor(input.actorId);
  requirePilotString(input.stateDigest, "stateDigest");
  const root = await requireExistingDirectory(input.root, "--root");
  const factsFile = await requireExistingFile(input.factsFile, "--facts");
  const facts = await readControlJson(factsFile);
  const paths = createPilotPaths(root);
  const states = await readStateChain(paths.stateRoot);
  const sourceIndex = states.findIndex((state) => state.stateDigest === input.stateDigest);
  if (sourceIndex < 0) throw new Error("stateDigest 不匹配。");
  const sourceState = states[sourceIndex];
  if (sourceState.actor?.humanActorId !== input.actorId) {
    throw new Error("Settlement Human actor 不匹配。");
  }
  const context = await createSettlementContext(
    states,
    sourceIndex,
    sourceState,
    paths,
    factsFile,
    facts,
  );
  if (sourceIndex !== states.length - 1) {
    const replay = resolveSettlementReplay(states, sourceIndex, input, context);
    if (replay !== undefined) return replay;
    throw new Error("waiting_settlement 状态已被其他 transition 推进。");
  }
  validateWaitingSettlementPilotState(
    sourceState,
    context.completionSource,
    context.closeoutSource,
    context,
  );
  await verifyPilotPaths(paths);
  const inputFile = join(paths.controlRoot, PILOT_METRICS_SETTLEMENT_NAME);
  const candidate = createCodexAgentPilotMetricsSettlementDraft({
    sourceState,
    facts,
    actorId: input.actorId,
    settledAt: dependencies.now(),
  });
  const persisted = await createOrReadControlJson(inputFile, candidate);
  const settlementInput = validateCodexAgentPilotMetricsSettlementDraft(persisted.value, {
    sourceState,
    facts,
    actorId: input.actorId,
  });
  const consumer = createPilotHarnessClient({
    consumerRoot: paths.consumerRoot,
    workspaceId: sourceState.task.workspaceId,
    repositoryId: sourceState.fixedProject.repositoryId,
    source: sourceState.task.source,
    runEnvelope: dependencies.runEnvelope,
  });
  const envelope = await consumer.settleMetrics(
    inputFile,
    sourceState.activation.manifest.sessionId,
    input.actorId,
    paths.runtimeRoot,
  );
  const result = validateCodexAgentPilotMetricsSettlementEnvelope(envelope, settlementInput);
  const nextState = createCompletedPilotState({
    sourceState,
    factsFile,
    inputFile,
    settlementInput,
    result,
    humanActorId: input.actorId,
  });
  try {
    const appended = await dependencies.appendDerivedState(paths.stateRoot, nextState, {
      expectedPreviousStateDigest: sourceState.stateDigest,
    });
    validateCompletedPilotState(appended.state, sourceState, context.completionSource, context);
    return projectCodexAgentPilotSettlement(appended.state, appended.file, false);
  } catch (error) {
    const replay = resolveSettlementReplay(
      await readStateChain(paths.stateRoot),
      sourceIndex,
      input,
      context,
    );
    if (replay !== undefined) return replay;
    throw error;
  }
}

async function createSettlementContext(states, sourceIndex, sourceState, paths, factsFile, facts) {
  const completionIndex = states.findIndex(
    (state) => state.stateDigest === sourceState.previousStateDigest,
  );
  if (completionIndex < 0) throw new Error("Settlement 缺少 Completion 源状态。");
  const completionSource = states[completionIndex];
  const completionContext = await createCodexAgentPilotCompletionContext(
    states,
    completionIndex,
    completionSource,
    paths,
  );
  return {
    ...completionContext,
    completionSource,
    factsFile,
    facts,
    paths,
  };
}

function resolveSettlementReplay(states, sourceIndex, input, context) {
  const sourceState = states[sourceIndex];
  const successor = states
    .slice(sourceIndex + 1)
    .find(
      (state) =>
        state.transition?.kind === "metrics_settlement" &&
        state.transition?.sourceStateDigest === input.stateDigest,
    );
  if (successor === undefined) return undefined;
  validateCompletedPilotState(successor, sourceState, context.completionSource, context);
  if (successor.settlement.operator.actorId !== input.actorId) {
    throw new Error("Settlement replay Human actor 不匹配。");
  }
  return projectCodexAgentPilotSettlement(successor, undefined, true);
}
