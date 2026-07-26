/** 旧版 Action Coverage Manifest 的持久化 Schema 版本。 */
export const CODING_TASK_SESSION_ACTION_COVERAGE_V1_SCHEMA_VERSION =
  "coding-task-session.action-coverage.v1" as const;

/** 旧版 Coverage Manifest Action 的严格字段集合。 */
export const CODING_TASK_SESSION_ACTION_COVERAGE_V1_ACTION_KEYS = [
  "actionId",
  "journalDigest",
  "traceObservationDigests",
] as const;

/** 旧版 Coverage Manifest 的严格字段集合。 */
export const CODING_TASK_SESSION_ACTION_COVERAGE_V1_MANIFEST_KEYS = [
  "schemaVersion",
  "workspaceId",
  "sessionId",
  "codingTaskId",
  "sourceTaskId",
  "repositoryId",
  "attemptNumber",
  "activationBindingDigest",
  "sessionBindingDigest",
  "worktreeId",
  "worktreeRootDigest",
  "executorSessionIdDigest",
  "actions",
  "manifestDigest",
] as const;
