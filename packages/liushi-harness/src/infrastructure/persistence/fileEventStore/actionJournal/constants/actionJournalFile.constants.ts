/** Action Journal File Record 的当前 Schema 版本。 */
export const ACTION_JOURNAL_FILE_SCHEMA_VERSION = "1.0.0";

/** Action Journal Hash Chain 的固定起始值。 */
export const ACTION_JOURNAL_GENESIS_HASH = "0".repeat(64);

/** Action Journal File Hash 使用的 lowercase SHA-256 格式。 */
export const ACTION_JOURNAL_FILE_HASH_PATTERN = /^[a-f0-9]{64}$/;
