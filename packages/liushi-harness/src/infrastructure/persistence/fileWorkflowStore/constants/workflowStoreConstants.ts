/** Workflow 文件 Store 的固定布局与限制。 */
export const WORKFLOW_DIRECTORY_NAME = "workflows";

/** Workflow 事件日志文件名。 */
export const WORKFLOW_EVENTS_FILE_NAME = "events.jsonl";

/** Workflow 进程间互斥锁文件名。 */
export const WORKFLOW_LOCK_FILE_NAME = ".workflow.lock";

/** Workflow Event Log 使用的 JSONL 换行符。 */
export const WORKFLOW_JSON_LINE_SEPARATOR = "\n";

/** 单个 Workflow Event Log 的最大字节数。 */
export const MAX_WORKFLOW_EVENT_LOG_BYTES = 1_048_576;

/** WorkflowCreated Event 的固定首序号。 */
export const FIRST_WORKFLOW_EVENT_SEQUENCE = 1;
