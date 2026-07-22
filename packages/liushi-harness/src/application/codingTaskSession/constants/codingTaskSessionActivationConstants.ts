/** CodingTask Session Activation Manifest 的固定 Schema 版本。 */
export const CODING_TASK_SESSION_ACTIVATION_MANIFEST_SCHEMA_VERSION =
  "coding-task.session.activate.v1" as const;

/** CodingTask Session Activation Report 的固定 Schema 版本。 */
export const CODING_TASK_SESSION_ACTIVATION_REPORT_SCHEMA_VERSION =
  "coding-task.session.activation-report.v1" as const;

/** Agent Actor ID 的最大字符数。 */
export const CODING_TASK_SESSION_AGENT_ACTOR_ID_MAX_LENGTH = 256;

/** Create 命令必须针对尚不存在的 Aggregate。 */
export const CODING_TASK_SESSION_CREATE_EXPECTED_VERSION = 0;

/** Provision 与首个 Attempt 必须绑定 Create 后的 Aggregate 版本。 */
export const CODING_TASK_SESSION_ACTIVE_EXPECTED_VERSION = 1;

/** Activation 只允许启动新 CodingTask 的首个 Attempt。 */
export const CODING_TASK_SESSION_FIRST_ATTEMPT_NUMBER = 1;
