import { join, resolve } from "node:path";

import { AGENT_EXECUTION_RECORD_NAME } from "../../constants/index.mjs";
import {
  assertCodexAgentAuthSourceStable,
  assertNoExternalAgentSkills,
  CODEX_APP_SERVER_OUTCOMES,
  prepareCodexAgentRuntime,
  removeCodexAgentRuntime,
  runCodexAgentAppServer,
} from "../../host/index.mjs";
import { readControlJson, readStateChain, writeControlJsonIdempotent } from "../../state/index.mjs";
import { requireExistingDirectory } from "../../validation/index.mjs";
import {
  createPilotDependencies,
  createPilotPaths,
  requirePilotString,
  validateHostApprovedPilotState,
  validatePilotActor,
} from "../shared/index.mjs";
import { createAgentFileChangeAuthorizer } from "./authorization/index.mjs";
import {
  createCodexAgentExecutionRecord,
  validateCodexAgentExecutionRecord,
} from "./execution/index.mjs";
import { createAgentFileChangeEvidenceSession } from "./evidence/index.mjs";
import {
  createKnownPrelaunchFailure,
  createUninspectedWorktreeChange,
  inspectWorktreeChangeSafely,
  normalizeProcessError,
  normalizeProcessResult,
  serializeAgentRunError,
  validateRecoveryWorktree,
} from "./processOutcome/index.mjs";
import {
  markAgentCredentialSourceFailed,
  markAgentCredentialSourceVerified,
  createAgentRuntimeAudit,
  markAgentRuntimeCleanupFailed,
  markAgentRuntimePrepared,
  markAgentRuntimePreserved,
  markAgentRuntimeRemoved,
} from "./runtime/index.mjs";
import {
  createAgentExecutionState,
  createAgentLaunchingState,
  createAgentLaunchRecord,
  projectAgentRunResult,
  validateAgentLaunchingState,
  validateAgentRunInputBinding,
  validateFinalExecutionState,
  validateHostApprovalSourceChain,
} from "./state/index.mjs";
import {
  assertExecutionRecordAbsent,
  captureAgentLaunchBaseline,
  inspectCodexAgentWorktreeChange,
  pathExists,
  requireIsoTimestamp,
  validateFreshLaunchPrerequisites,
} from "./validation/index.mjs";

export async function runCodexAgentPilotAgent(input, overrides = {}) {
  const dependencies = createPilotDependencies(overrides);
  const executeProcess = overrides.runCodexAgentAppServer ?? runCodexAgentAppServer;
  const prepareRuntime = overrides.prepareCodexAgentRuntime ?? prepareCodexAgentRuntime;
  const removeRuntime = overrides.removeCodexAgentRuntime ?? removeCodexAgentRuntime;
  const assertCredentialSourceStable =
    overrides.assertCodexAgentAuthSourceStable ?? assertCodexAgentAuthSourceStable;
  const validateExternalAgentSecurity =
    overrides.assertNoExternalAgentSkills ?? assertNoExternalAgentSkills;
  const inspectWorktree =
    overrides.inspectCodexAgentWorktreeChange ?? inspectCodexAgentWorktreeChange;
  const createFileChangeEvidenceSession =
    overrides.createAgentFileChangeEvidenceSession ?? createAgentFileChangeEvidenceSession;
  validatePilotActor(input.actorId);
  requirePilotString(input.stateDigest, "stateDigest");
  requirePilotString(input.packetDigest, "packetDigest");
  const root = await requireExistingDirectory(input.root, "--root");
  const paths = createPilotPaths(root);
  const states = await readStateChain(paths.stateRoot);
  const approvedIndex = states.findIndex((state) => state.stateDigest === input.stateDigest);
  if (approvedIndex < 0) throw new Error("stateDigest 不匹配。");
  const approvedState = states[approvedIndex];
  validateHostApprovedPilotState(approvedState, paths);
  validateAgentRunInputBinding(approvedState, input);
  const source = validateHostApprovalSourceChain(states, approvedIndex, paths);

  if (approvedIndex !== states.length - 1) {
    return recoverOrReplayAgentRun({
      states,
      approvedIndex,
      approvedState,
      paths,
      dependencies,
      inspectWorktree,
    });
  }

  const initial = await validateFreshLaunchPrerequisites({
    approvedState,
    packetState: source.packetState,
    packetDigest: input.packetDigest,
    paths,
    dependencies,
  });
  const executionRecordFile = join(paths.controlRoot, AGENT_EXECUTION_RECORD_NAME);
  await assertExecutionRecordAbsent(executionRecordFile);
  const agentLaunch = createAgentLaunchRecord({
    approvedState,
    packet: initial.packet,
    actorId: input.actorId,
    executionRecordFile,
    requestedAt: requireIsoTimestamp(dependencies.now(), "Agent requestedAt"),
  });
  const appended = await dependencies.appendDerivedState(
    paths.stateRoot,
    createAgentLaunchingState(approvedState, agentLaunch, input.actorId),
    { expectedPreviousStateDigest: approvedState.stateDigest },
  );
  const launchState = appended.state;
  validateAgentLaunchingState(launchState, approvedState, paths);

  return executeLaunchIntent({
    launchState,
    approvedState,
    packetState: source.packetState,
    packetDigest: input.packetDigest,
    paths,
    dependencies,
    executeProcess,
    prepareRuntime,
    removeRuntime,
    assertCredentialSourceStable,
    validateExternalAgentSecurity,
    inspectWorktree,
    createFileChangeEvidenceSession,
    initialArtifacts: initial.artifacts,
    initialPacket: initial.packet,
  });
}

async function executeLaunchIntent(input) {
  const startedAt = requireIsoTimestamp(input.dependencies.now(), "Agent startedAt");
  let execution;
  let launchBaseline = null;
  let artifacts = input.initialArtifacts;
  let runtimeAudit = createAgentRuntimeAudit(input.initialPacket);
  let runtimePrepared = false;
  let preparedRuntime = null;
  let runnerInvoked = false;
  try {
    const fresh = await validateFreshLaunchPrerequisites({
      approvedState: input.approvedState,
      packetState: input.packetState,
      packetDigest: input.packetDigest,
      paths: input.paths,
      dependencies: input.dependencies,
    });
    artifacts = fresh.artifacts;
    await assertExecutionRecordAbsent(input.launchState.agentLaunch.launch.executionRecordFile);
    const latest = (await readStateChain(input.paths.stateRoot)).at(-1);
    if (latest.stateDigest !== input.launchState.stateDigest) {
      throw new Error("Agent 启动前状态链已推进。");
    }
    launchBaseline = await captureAgentLaunchBaseline({
      artifacts: fresh.artifacts,
      dependencies: input.dependencies,
      expectedRevision: input.approvedState.fixedProject.revision,
      capturedAt: input.dependencies.now(),
    });
    preparedRuntime = await input.prepareRuntime(fresh.packet.runtimeIsolation.plan);
    runtimePrepared = true;
    runtimeAudit = markAgentRuntimePrepared(runtimeAudit);
    await input.validateExternalAgentSecurity({
      hostHome: fresh.packet.runtimeIsolation.plan.profileHome,
      worktreeRoot: fresh.artifacts.worktreeRoot,
    });
    const actionEvidence = await input.createFileChangeEvidenceSession({
      packet: fresh.packet,
      approvedState: input.approvedState,
      artifacts: fresh.artifacts,
      paths: input.paths,
    });
    const authorizeFileChange = createAgentFileChangeAuthorizer({
      packet: fresh.packet,
      launchState: input.launchState,
      approvedState: input.approvedState,
      artifacts: fresh.artifacts,
      launchBaseline,
      paths: input.paths,
      dependencies: input.dependencies,
      recordPreAction: actionEvidence.recordPreAction,
    });
    try {
      runnerInvoked = true;
      const result = await input.executeProcess({
        executable: fresh.packet.launch.executable,
        arguments: [...fresh.packet.launch.arguments],
        cwd: fresh.packet.launch.cwd,
        environment: preparedRuntime.env,
        runtimeWorkspaceRoots: [...fresh.packet.launch.protocol.thread.runtimeWorkspaceRoots],
        allowedPaths: [...fresh.packet.actionControl.allowedAbsolutePaths],
        model: fresh.packet.model.id,
        modelProvider: fresh.packet.execution.provider.id,
        prompt: fresh.artifacts.prompt,
        authorizeFileChange,
        timeoutMs: fresh.packet.launch.limits.timeoutMs,
        outputLimitBytes: fresh.packet.launch.limits.outputLimitBytes,
        stderrLimitBytes: fresh.packet.launch.limits.stderrLimitBytes,
        terminationConfirmationTimeoutMs:
          fresh.packet.launch.limits.terminationConfirmationTimeoutMs,
      });
      execution = normalizeProcessResult(result);
      if (result.outcome === CODEX_APP_SERVER_OUTCOMES.Succeeded) {
        try {
          await actionEvidence.recordPostAction({
            runnerResult: result,
            startedAt,
            completedAt: requireIsoTimestamp(input.dependencies.now(), "Agent process completedAt"),
          });
        } catch (error) {
          execution = {
            ...execution,
            outcome: CODEX_APP_SERVER_OUTCOMES.Failed,
            error: {
              ...serializeAgentRunError(error),
              phase: "session_action_evidence",
            },
          };
        }
      }
    } catch (error) {
      execution = normalizeProcessError(error);
    }
  } catch (error) {
    execution = runnerInvoked ? normalizeProcessError(error) : createKnownPrelaunchFailure(error);
    if (error?.cleanupError !== undefined) {
      runtimeAudit = markAgentRuntimeCleanupFailed(runtimeAudit, error.cleanupError);
    }
  }

  if (runtimePrepared) {
    if (execution.process.processMayBeRunning) {
      runtimeAudit = markAgentRuntimePreserved(runtimeAudit);
    } else {
      try {
        await input.assertCredentialSourceStable(
          input.initialPacket.runtimeIsolation.plan,
          preparedRuntime.credentialSourceSnapshot,
        );
        runtimeAudit = markAgentCredentialSourceVerified(runtimeAudit);
      } catch (error) {
        runtimeAudit = markAgentCredentialSourceFailed(runtimeAudit, error);
        execution = {
          ...execution,
          outcome: CODEX_APP_SERVER_OUTCOMES.Failed,
          error: {
            ...serializeAgentRunError(error),
            phase: "runtime_credential_source_validation",
          },
        };
      }
      try {
        const cleanup = await input.removeRuntime(input.initialPacket.runtimeIsolation.plan);
        runtimeAudit = markAgentRuntimeRemoved(runtimeAudit, cleanup.removed);
      } catch (error) {
        runtimeAudit = markAgentRuntimeCleanupFailed(runtimeAudit, error);
        execution = {
          ...execution,
          outcome: CODEX_APP_SERVER_OUTCOMES.Failed,
          error: {
            ...serializeAgentRunError(error),
            phase: "runtime_cleanup",
          },
        };
      }
    }
  }

  const outcomeUnknown = execution.process.processMayBeRunning;
  const worktreeChange = outcomeUnknown
    ? createUninspectedWorktreeChange("process_outcome_unknown")
    : await inspectWorktreeChangeSafely({
        artifacts,
        initialTargetDigest: launchBaseline?.target.digest,
        dependencies: input.dependencies,
        inspectWorktree: input.inspectWorktree,
      });
  const record = createCodexAgentExecutionRecord({
    sourceStateDigest: input.launchState.stateDigest,
    launchDigest: input.launchState.agentLaunch.launchDigest,
    packetDigest: input.packetDigest,
    approvalDigest: input.approvedState.hostApproval.approvalDigest,
    outcomeUnknown,
    launchBaseline,
    startedAt,
    completedAt: requireIsoTimestamp(input.dependencies.now(), "Agent completedAt"),
    execution,
    runtimeIsolation: runtimeAudit,
    worktreeChange,
  });
  validateCodexAgentExecutionRecord(record, createExecutionRecordExpectation(input.launchState));
  const recordFile = input.launchState.agentLaunch.launch.executionRecordFile;
  await writeControlJsonIdempotent(recordFile, record);
  return appendExecutionResult({
    launchState: input.launchState,
    record,
    recordFile,
    paths: input.paths,
    dependencies: input.dependencies,
    replayed: false,
    recovered: false,
  });
}

async function recoverOrReplayAgentRun(input) {
  const laterStates = input.states.slice(input.approvedIndex + 1);
  const launchState = laterStates.find(
    (state) => state.agentLaunch?.sourceStateDigest === input.approvedState.stateDigest,
  );
  if (launchState === undefined) {
    throw new Error("Host Approved 状态已被其他 transition 推进。");
  }
  validateAgentLaunchingState(launchState, input.approvedState, input.paths);
  const finalState = laterStates.find(
    (state) =>
      state.agentExecution?.sourceStateDigest === launchState.stateDigest &&
      state.agentExecution?.launchDigest === launchState.agentLaunch.launchDigest,
  );
  if (finalState !== undefined) {
    const record = await readAndValidateExecutionRecord(
      launchState,
      finalState.agentExecution.file,
    );
    validateFinalExecutionState(finalState, launchState, record, input.paths);
    return projectAgentRunResult(finalState, record, undefined, true, false);
  }

  const current = input.states.at(-1);
  if (current.stateDigest !== launchState.stateDigest) {
    throw new Error("Agent Launch 后状态链存在无法识别的 transition。");
  }
  const recordFile = launchState.agentLaunch.launch.executionRecordFile;
  if (!(await pathExists(recordFile))) {
    throw new Error("Agent Launch outcome unknown：缺少执行记录，禁止自动重启模型。");
  }
  const record = await readAndValidateExecutionRecord(launchState, recordFile);
  await validateRecoveryWorktree({
    launchState,
    record,
    dependencies: input.dependencies,
    inspectWorktree: input.inspectWorktree,
  });
  return appendExecutionResult({
    launchState,
    record,
    recordFile,
    paths: input.paths,
    dependencies: input.dependencies,
    replayed: false,
    recovered: true,
  });
}

async function appendExecutionResult(input) {
  const next = createAgentExecutionState(input.launchState, input.record, input.recordFile);
  const appended = await input.dependencies.appendDerivedState(input.paths.stateRoot, next, {
    expectedPreviousStateDigest: input.launchState.stateDigest,
  });
  validateFinalExecutionState(appended.state, input.launchState, input.record, input.paths);
  return projectAgentRunResult(
    appended.state,
    input.record,
    appended.file,
    input.replayed,
    input.recovered,
  );
}

async function readAndValidateExecutionRecord(launchState, recordFile) {
  if (resolve(recordFile) !== resolve(launchState.agentLaunch.launch.executionRecordFile)) {
    throw new Error("Agent Execution Record 路径无效。");
  }
  const record = await readControlJson(recordFile);
  return validateCodexAgentExecutionRecord(record, createExecutionRecordExpectation(launchState));
}

function createExecutionRecordExpectation(launchState) {
  const runtimeIsolation = launchState.hostPreview.packet.runtimeIsolation;
  return {
    sourceStateDigest: launchState.stateDigest,
    launchDigest: launchState.agentLaunch.launchDigest,
    packetDigest: launchState.agentLaunch.packetDigest,
    approvalDigest: launchState.agentLaunch.approvalDigest,
    targetFile: launchState.activation.targetFile,
    targetDigest: launchState.activation.targetDigest,
    worktreeRoot: launchState.activation.worktreeRoot,
    repositoryRevision: launchState.fixedProject.revision,
    runtimePlanDigest: runtimeIsolation.planDigest,
    runtimeRoot: runtimeIsolation.plan.root,
    environmentPolicyDigest: runtimeIsolation.environmentPolicy.digest,
  };
}
