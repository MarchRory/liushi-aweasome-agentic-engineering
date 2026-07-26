/** 旧版 Closeout State 的持久化 Schema 版本。 */
export const CODING_TASK_SESSION_CLOSEOUT_V1_STATE_SCHEMA_VERSION =
  "coding-task-session.closeout-state.v1" as const;

/** 旧版 Action Evidence 摘要输入的 Schema 版本。 */
export const CODING_TASK_SESSION_CLOSEOUT_V1_ACTION_EVIDENCE_SCHEMA_VERSION =
  "coding-task-session.closeout-action-evidence.v1" as const;

/** 旧版 Closeout State 的不可变身份字段。 */
export const CODING_TASK_SESSION_CLOSEOUT_V1_IDENTITY_KEYS = [
  "workspaceId",
  "sessionId",
  "codingTaskId",
  "sourceTaskId",
  "repositoryId",
  "attemptNumber",
  "activationBindingDigest",
  "sessionBindingDigest",
  "requestDigest",
  "idempotencyKey",
  "commandId",
  "correlationId",
  "actor",
  "createdAt",
] as const;

/** 旧版 Closeout State 的完整字段白名单。 */
export const CODING_TASK_SESSION_CLOSEOUT_V1_STATE_KEYS = [
  "schemaVersion",
  ...CODING_TASK_SESSION_CLOSEOUT_V1_IDENTITY_KEYS,
  "status",
  "snapshot",
  "coveredActionIds",
  "actionEvidenceDigest",
  "checkpoint",
  "stoppedStage",
  "errorCode",
  "recoveryGuidance",
  "version",
  "updatedAt",
] as const;
