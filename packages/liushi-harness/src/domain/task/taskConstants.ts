/** Task 和 Event ID 使用的 uppercase ULID 格式。 */
export const TASK_ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** 可选 Task Source 允许的最大字符数。 */
export const MAX_TASK_SOURCE_LENGTH = 2_048;
