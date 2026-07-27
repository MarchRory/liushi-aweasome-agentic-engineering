/** Closeout Recovery Process State 的持久化契约版本。 */
export const CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_SCHEMA_VERSION =
  "coding-task-session.closeout-recovery-state.v1" as const;

/** Recovery State 身份字段中必须存在的键。 */
export const CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_IDENTITY_KEYS = [
  "workspaceId",
  "sessionId",
  "codingTaskId",
  "sourceTaskId",
  "repositoryId",
  "attemptNumber",
  "closeoutStateDigest",
  "closeoutVersion",
  "assessmentDigest",
  "preSubmitSnapshotDigest",
  "changeSetDigest",
  "assessmentCheckpointBindingDigest",
  "requestDigest",
  "requestedResolution",
  "actor",
  "commandId",
  "idempotencyKey",
  "correlationId",
  "createdAt",
] as const;

/** Recovery State 中仅在存在时写入的键。 */
export const CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_OPTIONAL_KEYS = ["causationId"] as const;

/** Recovery State 完整结构中必须存在的键。 */
export const CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_KEYS = [
  "schemaVersion",
  ...CODING_TASK_SESSION_CLOSEOUT_RECOVERY_STATE_IDENTITY_KEYS,
  "status",
  "checkpoint",
  "errorCode",
  "recoveryGuidance",
  "version",
  "updatedAt",
] as const;
