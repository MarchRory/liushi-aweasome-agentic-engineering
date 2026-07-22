/** 外部 CodingTask Session Activation Record 的固定 Schema 版本。 */
export const CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION =
  "coding-task-session.activation.v1" as const;

/** Session ID 使用的独立 uppercase ULID 格式。 */
export const CODING_TASK_SESSION_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
