/** 旧 v2 Closeout State 使用的持久化 Schema 版本。 */
export const CODING_TASK_SESSION_CLOSEOUT_V2_STATE_SCHEMA_VERSION =
  "coding-task-session.closeout-state.v2" as const;

/** 旧 v2 Closeout State 的完整字段白名单。 */
export const CODING_TASK_SESSION_CLOSEOUT_V2_STATE_KEYS = [
  "schemaVersion",
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
  "status",
  "snapshot",
  "coverageManifest",
  "coverageBindingDigest",
  "checkpoint",
  "stoppedStage",
  "errorCode",
  "recoveryGuidance",
  "version",
  "updatedAt",
] as const;
