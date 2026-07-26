import type {
  SessionActionHookHandlerInput,
  SessionPostActionHookPayload,
  SessionPreActionHookPayload,
} from "#application/hooks/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import type { SessionActionProvenance } from "#domain/actionJournal/index.js";
import {
  parseCodingTaskSessionId,
  type CodingTaskSessionAdmissionState,
} from "#domain/codingTaskSession/index.js";

import type { CodingTaskSessionAdmissionCoordinatorDependencies } from "../contracts/index.js";
import { validateSessionActionAdmissionContext } from "../validation/index.js";

/** 已从权威 Store 加载并完成身份复验的 Session Action 上下文。 */
export interface SessionActionAdmissionContext {
  /** 当前 Session Admission 控制状态。 */
  readonly state: CodingTaskSessionAdmissionState;
  /** 与 Activation、Binding 和 invocation 一致的动作来源。 */
  readonly provenance: SessionActionProvenance;
}

/** 加载 Session 的权威记录，并复验 Hook 负载与 Runtime Binding。 */
export async function loadSessionActionAdmissionContext(
  dependencies: CodingTaskSessionAdmissionCoordinatorDependencies,
  payload: SessionPreActionHookPayload | SessionPostActionHookPayload,
  invocation: SessionActionHookHandlerInput<SessionPreActionHookPayload>["invocationProvenance"],
): Promise<Result<SessionActionAdmissionContext, HarnessError>> {
  const sessionId = parseCodingTaskSessionId(payload.sessionContext.sessionId);
  if (sessionId.status === ResultStatus.Failure) return sessionId;
  const locator = {
    workspaceId: payload.workspaceId,
    sessionId: sessionId.value,
  };
  const binding = await dependencies.bindingStore.findSession(locator);
  if (binding.status === ResultStatus.Failure) return binding;
  const activation = await dependencies.activationRepository.load(locator);
  if (activation.status === ResultStatus.Failure) return activation;
  const state = await dependencies.stateStore.load(locator);
  if (state.status === ResultStatus.Failure) return state;
  const provenance = validateSessionActionAdmissionContext(
    payload,
    binding.value,
    activation.value,
    state.value,
    invocation,
    dependencies.digest,
  );
  return provenance.status === ResultStatus.Failure
    ? provenance
    : success({ state: state.value, provenance: provenance.value });
}
