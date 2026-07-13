/** Task Lock 持久化 Schema Version。 */
export const TASK_LOCK_SCHEMA_VERSION = "1.0.0";

/** Workspace 在 Runtime Store 中的目录名。 */
export const WORKSPACES_DIRECTORY_NAME = "workspaces";

/** Task 在 Workspace Runtime 中的目录名。 */
export const TASKS_DIRECTORY_NAME = "tasks";

/** Task append-only Event Log 文件名。 */
export const TASK_EVENTS_FILE_NAME = "events.jsonl";

/** Task 原子 Snapshot 文件名。 */
export const TASK_SNAPSHOT_FILE_NAME = "snapshot.json";

/** Task 内全部 Action 的 append-only Journal 文件名。 */
export const TASK_ACTIONS_FILE_NAME = "actions.jsonl";

/** Task 内可丢失 Trace Observation 的 JSONL 文件名。 */
export const TASK_TRACES_FILE_NAME = "traces.jsonl";

/** Task 内 Action 执行锁的 Runtime 目录名。 */
export const ACTION_EXECUTION_LOCKS_DIRECTORY_NAME = "actionExecutionLocks";

/** Task 排他 Lock 文件名。 */
export const TASK_LOCK_FILE_NAME = ".task.lock";

/** Task Action Journal 排他 Lock 文件名。 */
export const TASK_ACTIONS_LOCK_FILE_NAME = ".actions.lock";

/** Task Trace Observation 排他 Lock 文件名。 */
export const TASK_TRACES_LOCK_FILE_NAME = ".traces.lock";

/** Workspace 内 Task 创建排他 Lock 文件名。 */
export const WORKSPACE_TASK_CREATION_LOCK_FILE_NAME = ".task-creation.lock";

/** JSONL 记录使用的固定换行符。 */
export const JSON_LINE_SEPARATOR = "\n";

/** Task Event Sequence 的起始值。 */
export const FIRST_TASK_EVENT_SEQUENCE = 1;

/** 当前纵向切片允许的 Task Event 数量。 */
export const SUPPORTED_TASK_EVENT_COUNT = 1;

/** 当前版本允许读取的最大 Event Log 字节数。 */
export const MAX_TASK_EVENT_LOG_BYTES = 1_048_576;

/** 当前版本允许读取的最大 Snapshot 字节数。 */
export const MAX_TASK_SNAPSHOT_BYTES = 1_048_576;
