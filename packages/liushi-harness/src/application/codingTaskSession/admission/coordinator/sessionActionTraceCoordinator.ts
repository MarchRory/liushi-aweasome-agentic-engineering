import { createActionTrace, type SessionPostActionHookPayload } from "#application/hooks/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import type {
  SessionActionIntentRecord,
  SessionActionObservationRecord,
  SessionActionTraceEvidence,
} from "#domain/actionJournal/index.js";
import type { CodingTaskSessionAdmissionState } from "#domain/codingTaskSession/index.js";

import type { CodingTaskSessionAdmissionCoordinatorDependencies } from "../contracts/index.js";
import {
  createSessionActionObservation,
  createSessionActionTraceEvidence,
} from "../factory/index.js";
import { persistSessionAdmissionOutcomeUnknown } from "./sessionAdmissionOutcomeUnknown.js";
import { recordSessionActionTraceSafely } from "./sessionActionAdmissionCoordinatorUtils.js";

/** 创建唯一 Trace、记录写入结果并返回与该 Trace 精确绑定的 Journal 证据。 */
export async function recordSessionActionTraceEvidence(
  dependencies: CodingTaskSessionAdmissionCoordinatorDependencies,
  state: CodingTaskSessionAdmissionState,
  payload: SessionPostActionHookPayload,
): Promise<Result<SessionActionTraceEvidence, HarnessError>> {
  const observation = createActionTrace(payload);
  const observationDigest = dependencies.digest.calculate(observation);
  if (observationDigest.status === ResultStatus.Failure) return observationDigest;

  const outcome = await recordSessionActionTraceSafely(dependencies.traceStore, observation);
  const evidence = createSessionActionTraceEvidence(
    outcome,
    observationDigest.value,
    dependencies.digest,
  );
  if (evidence.status === ResultStatus.Success) return evidence;
  return persistSessionAdmissionOutcomeUnknown(
    dependencies.stateStore,
    state,
    payload.occurredAt,
    evidence.error,
    "Trace 已尝试写入但其恢复证据无法可靠持久化。",
  );
}

/** Trace 已尝试写入后构造 Observation；失败时停止 Session 自动推进。 */
export async function createSessionActionObservationAfterTrace(
  dependencies: CodingTaskSessionAdmissionCoordinatorDependencies,
  state: CodingTaskSessionAdmissionState,
  payload: SessionPostActionHookPayload,
  intent: SessionActionIntentRecord,
  sequence: number,
  trace: SessionActionTraceEvidence,
): Promise<Result<SessionActionObservationRecord, HarnessError>> {
  const observation = createSessionActionObservation(payload, intent, sequence, trace);
  if (observation.status === ResultStatus.Success) return observation;
  return persistSessionAdmissionOutcomeUnknown(
    dependencies.stateStore,
    state,
    payload.occurredAt,
    observation.error,
    "Trace 已尝试写入但 Action Observation 无法可靠构造。",
  );
}
