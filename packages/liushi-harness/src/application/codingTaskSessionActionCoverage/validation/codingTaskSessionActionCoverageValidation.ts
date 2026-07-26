import { z } from "zod";

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
  CODING_TASK_SESSION_ACTION_COVERAGE_MANIFEST_SCHEMA_VERSION,
  CODING_TASK_SESSION_ACTION_COVERAGE_WORKTREE_ID_MAX_LENGTH,
} from "../constants/index.js";
import type {
  CodingTaskSessionActionCoverageInput,
  CodingTaskSessionActionCoverageManifest,
} from "../contracts/index.js";
import { calculateCodingTaskSessionActionCoverageManifestDigest } from "../digest/index.js";
import { isCanonicalCodingTaskSessionActionTargets } from "./targets/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";

const nonBlank = z
  .string()
  .min(1)
  .max(CODING_TASK_SESSION_ACTION_COVERAGE_WORKTREE_ID_MAX_LENGTH)
  .refine((value) => value === value.trim())
  .refine((value) => !value.includes("\0"));

const branded = <T>(parser: (value: string) => Result<T, HarnessError>) =>
  z.string().transform((value, context): T => {
    const parsed = parser(value);
    if (parsed.status === ResultStatus.Failure) {
      context.addIssue({ code: "custom", message: parsed.error.message });
      return z.NEVER;
    }
    return parsed.value;
  });

const digestSchema = branded<ContentDigest>(parseContentDigest);
const actionIdSchema = branded<ActionId>(parseActionId);
const workspaceIdSchema = branded<WorkspaceId>(parseWorkspaceId);
const sessionIdSchema = branded<CodingTaskSessionId>(parseCodingTaskSessionId);
const codingTaskIdSchema = branded<CodingTaskId>(parseCodingTaskId);
const sourceTaskIdSchema = branded<TaskId>(parseTaskId);
const repositoryIdSchema = branded<RepositoryId>(parseRepositoryId);
const targetsSchema = z.array(z.string()).superRefine((targets, context) => {
  if (isCanonicalCodingTaskSessionActionTargets(targets)) return;
  context.addIssue({
    code: "custom",
    message: "Action targets 必须是非空、排序去重的规范仓库相对 POSIX 路径。",
  });
});

const actionSchema = z
  .object({
    actionId: actionIdSchema,
    targets: targetsSchema,
    journalDigest: digestSchema,
    traceObservationDigests: z.array(digestSchema).min(1),
  })
  .strict()
  .superRefine((action, context) => {
    if (!isStrictlySorted(action.traceObservationDigests)) {
      context.addIssue({
        code: "custom",
        message: "Trace Observation 摘要必须按字典序严格排序且不可重复。",
        path: ["traceObservationDigests"],
      });
    }
  });

const manifestSchema = z
  .object({
    schemaVersion: z.literal(CODING_TASK_SESSION_ACTION_COVERAGE_MANIFEST_SCHEMA_VERSION),
    workspaceId: workspaceIdSchema,
    sessionId: sessionIdSchema,
    codingTaskId: codingTaskIdSchema,
    sourceTaskId: sourceTaskIdSchema,
    repositoryId: repositoryIdSchema,
    attemptNumber: z.number().int().positive().safe(),
    activationBindingDigest: digestSchema,
    sessionBindingDigest: digestSchema,
    worktreeId: nonBlank,
    worktreeRootDigest: digestSchema,
    executorSessionIdDigest: digestSchema,
    actions: z.array(actionSchema).min(1),
    manifestDigest: digestSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    const actionIds = manifest.actions.map((action) => action.actionId);
    if (!isStrictlySorted(actionIds)) {
      context.addIssue({
        code: "custom",
        message: "Action 必须按 actionId 严格排序且不可重复。",
        path: ["actions"],
      });
    }
  });

const inputSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    sessionId: sessionIdSchema,
  })
  .strict();

/** 严格校验 Service 定位输入，阻止调用方注入 Action 或证据字段。 */
export function validateCodingTaskSessionActionCoverageInput(
  input: unknown,
): Result<CodingTaskSessionActionCoverageInput, HarnessError> {
  const parsed = inputSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data as CodingTaskSessionActionCoverageInput)
    : failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Coverage Proof 只接受 workspaceId 与 sessionId。",
          { field: "input" },
          parsed.error,
        ),
      );
}

/** 严格重建并验证 canonical Coverage Proof manifest 及其 manifestDigest。 */
export function rebuildCodingTaskSessionActionCoverageManifest(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<CodingTaskSessionActionCoverageManifest, HarnessError> {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) {
    return invalidCoverage("Coverage Proof manifest 结构无效。", parsed.error);
  }
  const manifest = parsed.data as CodingTaskSessionActionCoverageManifest;
  const calculated = calculateCodingTaskSessionActionCoverageManifestDigest(manifest, digestPort);
  if (calculated.status === ResultStatus.Failure) return calculated;
  if (calculated.value !== manifest.manifestDigest) {
    return invalidCoverage("Coverage Proof manifestDigest 漂移。", undefined, {
      field: "manifestDigest",
    });
  }
  return success(freezeManifest(manifest));
}

/** strict rebuild 的语义别名，供只读验证方使用。 */
export function verifyCodingTaskSessionActionCoverageManifest(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<CodingTaskSessionActionCoverageManifest, HarnessError> {
  return rebuildCodingTaskSessionActionCoverageManifest(input, digestPort);
}

/** validate 与 rebuild 使用同一关闭式校验，拒绝未知字段与摘要漂移。 */
export const validateCodingTaskSessionActionCoverageManifest =
  rebuildCodingTaskSessionActionCoverageManifest;

/** 返回 RFC 8785 manifest 所需的严格字典序判断。 */
function isStrictlySorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function freezeManifest(
  manifest: CodingTaskSessionActionCoverageManifest,
): CodingTaskSessionActionCoverageManifest {
  const actions = manifest.actions.map((action) =>
    Object.freeze({
      ...action,
      targets: Object.freeze([...action.targets]),
      traceObservationDigests: Object.freeze([...action.traceObservationDigests]),
    }),
  );
  return Object.freeze({ ...manifest, actions: Object.freeze(actions) });
}

function invalidCoverage(
  message: string,
  cause?: unknown,
  details: Readonly<Record<string, string>> = {},
): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, message, details, cause));
}
