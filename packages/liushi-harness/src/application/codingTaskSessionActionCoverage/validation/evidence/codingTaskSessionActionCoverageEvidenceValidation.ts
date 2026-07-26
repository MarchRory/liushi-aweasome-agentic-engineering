import { parseTraceSpanObservation } from "#application/observability/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionJournalStatus,
  SessionActionTraceDisposition,
  appendActionObservation,
  appendActionResolution,
  createActionJournalState,
  parseActionId,
  type ActionId,
  type ActionJournalState,
  type SessionActionProvenance,
} from "#domain/actionJournal/index.js";
import {
  CodingTaskSessionAdmissionStatus,
  type CodingTaskSessionActivationRecord,
  type CodingTaskSessionAdmissionState,
} from "#domain/codingTaskSession/index.js";
import {
  CONTENT_DIGEST_PATTERN,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";

import type {
  CodingTaskSessionActionCoverageInput,
  CodingTaskSessionActionJournalValidationResult,
} from "../../contracts/index.js";
import { isCanonicalCodingTaskSessionActionTargets } from "../index.js";

/** 验证 Activation/Admission 身份并返回规范排序的权威 Action ID。 */
export function validateActivationAndAdmission(
  activation: CodingTaskSessionActivationRecord,
  admission: CodingTaskSessionAdmissionState,
  input: CodingTaskSessionActionCoverageInput,
): Result<readonly ActionId[], HarnessError> {
  if (
    activation.workspaceId !== input.workspaceId ||
    activation.sessionId !== input.sessionId ||
    admission.workspaceId !== input.workspaceId ||
    admission.sessionId !== input.sessionId ||
    admission.activationBindingDigest !== activation.bindingDigest
  ) {
    return coverageFailure("Activation 与 Admission 的作用域或 binding 不精确匹配。", "binding");
  }
  if (
    admission.status !== CodingTaskSessionAdmissionStatus.Closing ||
    admission.pendingAdmission !== null ||
    !isContentDigest(admission.claimedExecutorSessionIdDigest) ||
    admission.admittedActionIds.length === 0
  ) {
    return coverageFailure("Admission 未处于可证明 Coverage 的 Closing 状态。", "admission");
  }
  const actionIds: ActionId[] = [];
  for (const actionIdValue of admission.admittedActionIds) {
    const actionId = parseActionId(actionIdValue);
    if (actionId.status === ResultStatus.Failure) {
      return coverageFailure("Admission 含有无效 Action ID。", "admittedActionIds");
    }
    actionIds.push(actionId.value);
  }
  if (new Set(actionIds).size !== actionIds.length) {
    return coverageFailure("Admission 的 admittedActionIds 不得重复。", "admittedActionIds");
  }
  return success(Object.freeze(actionIds.sort(compareStrings)));
}

/** 验证单个 Action Journal 的 Session provenance、终态与 Trace 证据引用。 */
export function validateCodingTaskSessionActionJournal(
  state: ActionJournalState,
  actionId: ActionId,
  activation: CodingTaskSessionActivationRecord,
  admission: CodingTaskSessionAdmissionState,
  input: CodingTaskSessionActionCoverageInput,
): Result<CodingTaskSessionActionJournalValidationResult, HarnessError> {
  if (
    ![ActionJournalStatus.Committed, ActionJournalStatus.Recovered].includes(state.status) ||
    state.observations.length === 0 ||
    state.resolutions.length === 0 ||
    state.observations.length !== state.resolutions.length ||
    state.intent.schemaVersion !== SESSION_ACTION_JOURNAL_SCHEMA_VERSION ||
    state.intent.recordType !== ActionJournalRecordType.Intent ||
    state.intent.sequence !== 1 ||
    state.intent.actionId !== actionId ||
    state.intent.workspaceId !== input.workspaceId ||
    state.intent.taskId !== activation.sourceTaskId ||
    !isCanonicalCodingTaskSessionActionTargets(state.intent.targets) ||
    state.intent.sessionProvenance === undefined
  ) {
    return coverageFailure("Action Journal 未形成完整的 Session v2 终态闭合。", "journal");
  }
  const expectedProvenance = {
    sessionId: input.sessionId,
    codingTaskId: activation.codingTaskId,
    attemptNumber: activation.attemptNumber,
    worktreeId: activation.worktreeId,
    worktreeRootDigest: activation.worktreeRootDigest,
    activationBindingDigest: activation.bindingDigest,
    sessionBindingDigest: admission.sessionBindingDigest,
    executorSessionIdDigest: admission.claimedExecutorSessionIdDigest!,
  } satisfies SessionActionProvenance;
  if (!sameProvenance(state.intent.sessionProvenance, expectedProvenance)) {
    return coverageFailure(
      "Action Intent provenance 与 Activation/Admission 不匹配。",
      "provenance",
    );
  }

  let replayedState = createActionJournalState(state.intent);
  const observationDigests: ContentDigest[] = [];
  for (let index = 0; index < state.observations.length; index += 1) {
    const observation = state.observations[index];
    const resolution = state.resolutions[index];
    if (
      observation === undefined ||
      resolution === undefined ||
      observation.recordType !== ActionJournalRecordType.Observation ||
      observation.schemaVersion !== SESSION_ACTION_JOURNAL_SCHEMA_VERSION ||
      observation.actionId !== actionId ||
      observation.workspaceId !== input.workspaceId ||
      observation.taskId !== activation.sourceTaskId ||
      observation.sessionProvenance === undefined ||
      !sameProvenance(observation.sessionProvenance, expectedProvenance) ||
      !isCanonicalCodingTaskSessionActionTargets(observation.targets) ||
      !sameStrings(observation.targets, state.intent.targets) ||
      observation.trace === undefined ||
      observation.trace.disposition !== SessionActionTraceDisposition.Persisted ||
      observation.trace.dropReason !== undefined ||
      !Array.isArray(observation.trace.recoveryPathDigests) ||
      !isContentDigest(observation.trace.observationDigest) ||
      resolution.recordType !== ActionJournalRecordType.Resolution ||
      resolution.schemaVersion !== ACTION_JOURNAL_SCHEMA_VERSION ||
      resolution.actionId !== actionId ||
      resolution.workspaceId !== input.workspaceId ||
      resolution.taskId !== activation.sourceTaskId
    ) {
      return coverageFailure("Action Journal Observation/Resolution 未完整闭合。", "journal");
    }
    const appendedObservation = appendActionObservation(replayedState, observation);
    if (appendedObservation.status === ResultStatus.Failure) {
      return coverageFailure("Action Journal Observation 状态迁移无效。", "journal");
    }
    const appendedResolution = appendActionResolution(appendedObservation.value, resolution);
    if (appendedResolution.status === ResultStatus.Failure) {
      return coverageFailure("Action Journal Resolution 状态迁移无效。", "journal");
    }
    replayedState = appendedResolution.value;
    const digest = parseContentDigest(observation.trace.observationDigest);
    if (digest.status === ResultStatus.Failure) {
      return coverageFailure(
        "Session Observation 的 observationDigest 无效。",
        "observationDigest",
      );
    }
    observationDigests.push(digest.value);
  }
  if (
    replayedState.lastSequence !== state.lastSequence ||
    replayedState.status !== state.status ||
    new Set(observationDigests).size !== observationDigests.length
  ) {
    return coverageFailure("Action Journal 的终态、序列或 Observation 摘要不闭合。", "journal");
  }
  return success(
    Object.freeze({
      targets: Object.freeze([...state.intent.targets]),
      observationDigests: Object.freeze([...observationDigests].sort(compareStrings)),
    }),
  );
}

/** 对 Trace 查询结果做跳过记录检查、规范摘要计算和精确集合匹配。 */
export function calculateAndMatchTraceDigests(
  result: CoverageTraceQueryResult,
  expectedDigests: readonly ContentDigest[],
  actionId: ActionId,
  workspaceId: CodingTaskSessionActionCoverageInput["workspaceId"],
  taskId: CodingTaskSessionActivationRecord["sourceTaskId"],
  digestPort: ContentDigestPort,
): Result<readonly ContentDigest[], HarnessError> {
  if (
    !Array.isArray(result.observations) ||
    !Number.isSafeInteger(result.skippedRecordCount) ||
    result.skippedRecordCount !== 0
  ) {
    return coverageFailure("Trace 查询存在 skippedRecord，无法形成确定性 Coverage。", "trace");
  }
  const digests: ContentDigest[] = [];
  for (const input of result.observations) {
    const parsed = parseTraceSpanObservation(input);
    if (parsed.status === ResultStatus.Failure) {
      return coverageFailure("Trace Observation 结构无效。", "trace");
    }
    const observation = parsed.value;
    if (!hasTraceActionIdentity(observation, actionId, workspaceId, taskId)) {
      return coverageFailure("Trace Observation 的 Action/Task 作用域不匹配。", "trace");
    }
    const digest = digestPort.calculate(observation);
    if (digest.status === ResultStatus.Failure) return digest;
    digests.push(digest.value);
  }
  const sorted = [...digests].sort(compareStrings);
  if (
    new Set(sorted).size !== sorted.length ||
    sorted.length !== expectedDigests.length ||
    sorted.some((digest, index) => digest !== expectedDigests[index])
  ) {
    return coverageFailure("Trace Observation 摘要与 Journal 未精确一一相等。", "trace");
  }
  return success(Object.freeze(sorted));
}

function hasTraceActionIdentity(
  observation: unknown,
  actionId: ActionId,
  workspaceId: CodingTaskSessionActionCoverageInput["workspaceId"],
  taskId: CodingTaskSessionActivationRecord["sourceTaskId"],
): boolean {
  if (typeof observation !== "object" || observation === null) return false;
  const record = observation as Record<string, unknown>;
  return (
    record["actionId"] === actionId &&
    record["workspaceId"] === workspaceId &&
    record["taskId"] === taskId
  );
}

function sameProvenance(left: SessionActionProvenance, right: SessionActionProvenance): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.codingTaskId === right.codingTaskId &&
    left.attemptNumber === right.attemptNumber &&
    left.worktreeId === right.worktreeId &&
    left.worktreeRootDigest === right.worktreeRootDigest &&
    left.activationBindingDigest === right.activationBindingDigest &&
    left.sessionBindingDigest === right.sessionBindingDigest &&
    left.executorSessionIdDigest === right.executorSessionIdDigest
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isContentDigest(value: ContentDigest | null | undefined): value is ContentDigest {
  return value !== null && value !== undefined && CONTENT_DIGEST_PATTERN.test(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function coverageFailure(message: string, field: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, message, { field }));
}

/** Trace Store query 结果的最小运行时形状。 */
interface CoverageTraceQueryResult {
  readonly observations: readonly unknown[];
  readonly skippedRecordCount: number;
}
