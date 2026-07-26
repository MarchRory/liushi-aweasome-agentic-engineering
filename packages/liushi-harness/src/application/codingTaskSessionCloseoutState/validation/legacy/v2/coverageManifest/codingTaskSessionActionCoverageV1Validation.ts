import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import { parseActionId, type ActionId } from "#domain/actionJournal/index.js";
import { parseCodingTaskId, type CodingTaskId } from "#domain/codingTask/index.js";
import {
  parseCodingTaskSessionId,
  type CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import { parseTaskId, type TaskId } from "#domain/task/index.js";
import {
  parseRepositoryId,
  parseWorkspaceId,
  type RepositoryId,
  type WorkspaceId,
} from "#domain/workspace/index.js";

import {
  CODING_TASK_SESSION_ACTION_COVERAGE_V1_ACTION_KEYS,
  CODING_TASK_SESSION_ACTION_COVERAGE_V1_MANIFEST_KEYS,
  CODING_TASK_SESSION_ACTION_COVERAGE_V1_SCHEMA_VERSION,
} from "../constants/index.js";

/** 旧版 Coverage Manifest 中单个 Action 的摘要结构。 */
export interface LegacyCodingTaskSessionActionCoverageManifestAction {
  /** Admission 提供的 Action 标识。 */
  readonly actionId: ActionId;
  /** 完整 Journal State 摘要。 */
  readonly journalDigest: ContentDigest;
  /** 按字典序排序的 Trace Observation 摘要。 */
  readonly traceObservationDigests: readonly ContentDigest[];
}

/** 旧版 Coverage Manifest 的完整严格结构。 */
export interface LegacyCodingTaskSessionActionCoverageManifest {
  /** 旧版 Coverage Manifest Schema。 */
  readonly schemaVersion: typeof CODING_TASK_SESSION_ACTION_COVERAGE_V1_SCHEMA_VERSION;
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** 外部 Agent Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** CodingTask 标识。 */
  readonly codingTaskId: CodingTaskId;
  /** 来源 Task 标识。 */
  readonly sourceTaskId: TaskId;
  /** 目标 Repository 标识。 */
  readonly repositoryId: RepositoryId;
  /** Session Attempt 编号。 */
  readonly attemptNumber: number;
  /** Activation binding 摘要。 */
  readonly activationBindingDigest: ContentDigest;
  /** Session binding 摘要。 */
  readonly sessionBindingDigest: ContentDigest;
  /** 受管 Worktree 标识。 */
  readonly worktreeId: string;
  /** Worktree root 摘要。 */
  readonly worktreeRootDigest: ContentDigest;
  /** Executor Session 摘要。 */
  readonly executorSessionIdDigest: ContentDigest;
  /** 按 Action ID 排序的摘要条目。 */
  readonly actions: readonly LegacyCodingTaskSessionActionCoverageManifestAction[];
  /** 旧版 canonical manifest 摘要。 */
  readonly manifestDigest: ContentDigest;
}

/** 独立重建旧版 Coverage Manifest，不调用当前 v2 validator。 */
export function parseCodingTaskSessionActionCoverageV1(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<LegacyCodingTaskSessionActionCoverageManifest, HarnessError> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, CODING_TASK_SESSION_ACTION_COVERAGE_V1_MANIFEST_KEYS)
  ) {
    return invalid("manifest");
  }
  if (input["schemaVersion"] !== CODING_TASK_SESSION_ACTION_COVERAGE_V1_SCHEMA_VERSION) {
    return invalid("schemaVersion");
  }

  const workspaceId = parseId(input["workspaceId"], parseWorkspaceId, "workspaceId");
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const sessionId = parseId(input["sessionId"], parseCodingTaskSessionId, "sessionId");
  if (sessionId.status === ResultStatus.Failure) return sessionId;
  const codingTaskId = parseId(input["codingTaskId"], parseCodingTaskId, "codingTaskId");
  if (codingTaskId.status === ResultStatus.Failure) return codingTaskId;
  const sourceTaskId = parseId(input["sourceTaskId"], parseTaskId, "sourceTaskId");
  if (sourceTaskId.status === ResultStatus.Failure) return sourceTaskId;
  const repositoryId = parseId(input["repositoryId"], parseRepositoryId, "repositoryId");
  if (repositoryId.status === ResultStatus.Failure) return repositoryId;
  const attemptNumber = parseAttemptNumber(input["attemptNumber"]);
  if (attemptNumber.status === ResultStatus.Failure) return attemptNumber;
  const activationBindingDigest = parseDigest(
    input["activationBindingDigest"],
    "activationBindingDigest",
  );
  if (activationBindingDigest.status === ResultStatus.Failure) return activationBindingDigest;
  const sessionBindingDigest = parseDigest(input["sessionBindingDigest"], "sessionBindingDigest");
  if (sessionBindingDigest.status === ResultStatus.Failure) return sessionBindingDigest;
  const worktreeRootDigest = parseDigest(input["worktreeRootDigest"], "worktreeRootDigest");
  if (worktreeRootDigest.status === ResultStatus.Failure) return worktreeRootDigest;
  const executorSessionIdDigest = parseDigest(
    input["executorSessionIdDigest"],
    "executorSessionIdDigest",
  );
  if (executorSessionIdDigest.status === ResultStatus.Failure) return executorSessionIdDigest;
  const worktreeId = parseWorktreeId(input["worktreeId"]);
  if (worktreeId.status === ResultStatus.Failure) return worktreeId;
  const actions = parseActions(input["actions"]);
  if (actions.status === ResultStatus.Failure) return actions;
  const manifestDigest = parseDigest(input["manifestDigest"], "manifestDigest");
  if (manifestDigest.status === ResultStatus.Failure) return manifestDigest;

  const manifest = {
    schemaVersion: CODING_TASK_SESSION_ACTION_COVERAGE_V1_SCHEMA_VERSION,
    workspaceId: workspaceId.value,
    sessionId: sessionId.value,
    codingTaskId: codingTaskId.value,
    sourceTaskId: sourceTaskId.value,
    repositoryId: repositoryId.value,
    attemptNumber: attemptNumber.value,
    activationBindingDigest: activationBindingDigest.value,
    sessionBindingDigest: sessionBindingDigest.value,
    worktreeId: worktreeId.value,
    worktreeRootDigest: worktreeRootDigest.value,
    executorSessionIdDigest: executorSessionIdDigest.value,
    actions: actions.value,
    manifestDigest: manifestDigest.value,
  } satisfies LegacyCodingTaskSessionActionCoverageManifest;
  const calculated = digestPort.calculate(withoutManifestDigest(manifest));
  if (calculated.status === ResultStatus.Failure) return calculated;
  return calculated.value === manifest.manifestDigest
    ? success(Object.freeze(manifest))
    : invalid("manifestDigest");
}

function parseActions(
  input: unknown,
): Result<readonly LegacyCodingTaskSessionActionCoverageManifestAction[], HarnessError> {
  if (!Array.isArray(input) || input.length === 0) return invalid("actions");
  const actions: LegacyCodingTaskSessionActionCoverageManifestAction[] = [];
  for (const value of input) {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, CODING_TASK_SESSION_ACTION_COVERAGE_V1_ACTION_KEYS)
    ) {
      return invalid("actions");
    }
    const actionId = parseId(value["actionId"], parseActionId, "actionId");
    if (actionId.status === ResultStatus.Failure) return actionId;
    const journalDigest = parseDigest(value["journalDigest"], "journalDigest");
    if (journalDigest.status === ResultStatus.Failure) return journalDigest;
    const traceObservationDigests = parseDigestArray(value["traceObservationDigests"]);
    if (traceObservationDigests.status === ResultStatus.Failure) return traceObservationDigests;
    actions.push({
      actionId: actionId.value,
      journalDigest: journalDigest.value,
      traceObservationDigests: traceObservationDigests.value,
    });
  }
  if (!isStrictlySorted(actions.map((action) => action.actionId))) return invalid("actions");
  return success(Object.freeze(actions.map((action) => Object.freeze(action))));
}

function parseDigestArray(input: unknown): Result<readonly ContentDigest[], HarnessError> {
  if (!Array.isArray(input) || input.length === 0) return invalid("traceObservationDigests");
  const digests: ContentDigest[] = [];
  for (const value of input) {
    const parsed = parseDigest(value, "traceObservationDigests");
    if (parsed.status === ResultStatus.Failure) return parsed;
    digests.push(parsed.value);
  }
  return new Set(digests).size === digests.length && isStrictlySorted(digests)
    ? success(Object.freeze(digests))
    : invalid("traceObservationDigests");
}

function withoutManifestDigest(
  manifest: LegacyCodingTaskSessionActionCoverageManifest,
): Omit<LegacyCodingTaskSessionActionCoverageManifest, "manifestDigest"> {
  const { manifestDigest, ...input } = manifest;
  void manifestDigest;
  return input;
}

function parseWorktreeId(input: unknown): Result<string, HarnessError> {
  return typeof input === "string" &&
    input.length > 0 &&
    input.length <= 256 &&
    input === input.trim() &&
    !input.includes("\0")
    ? success(input)
    : invalid("worktreeId");
}

function parseAttemptNumber(input: unknown): Result<number, HarnessError> {
  return typeof input === "number" && Number.isSafeInteger(input) && input > 0
    ? success(input)
    : invalid("attemptNumber");
}

function parseDigest(input: unknown, field: string): Result<ContentDigest, HarnessError> {
  if (typeof input !== "string") return invalid(field);
  const parsed = parseContentDigest(input);
  return parsed.status === ResultStatus.Failure ? invalid(field) : parsed;
}

function parseId<T>(
  input: unknown,
  parser: (value: string) => Result<T, HarnessError>,
  field: string,
): Result<T, HarnessError> {
  if (typeof input !== "string") return invalid(field);
  const parsed = parser(input);
  return parsed.status === ResultStatus.Failure ? invalid(field) : parsed;
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => required.includes(key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStrictlySorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function invalid(field: string): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.PreconditionNotMet, "旧 Coverage Manifest v1 无效。", {
      field,
    }),
  );
}
