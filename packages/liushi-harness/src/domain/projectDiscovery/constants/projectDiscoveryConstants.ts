/** 当前确定性 Project Scanner 实现版本。 */
export const PROJECT_SCANNER_VERSION = "1.0.0";

/** 单次 Scan 允许的默认 Repository 数量。 */
export const DEFAULT_SCAN_MAX_REPOSITORIES = 10;

/** 单次 Scan 允许的 Repository 硬上限。 */
export const HARD_SCAN_MAX_REPOSITORIES = 20;

/** 每个 Repository 默认枚举的最大文件数。 */
export const DEFAULT_SCAN_MAX_FILES = 20_000;

/** 每个 Repository 可配置的最大文件数硬上限。 */
export const HARD_SCAN_MAX_FILES = 50_000;

/** Repository 默认递归深度。 */
export const DEFAULT_SCAN_MAX_DEPTH = 32;

/** Repository 可配置递归深度硬上限。 */
export const HARD_SCAN_MAX_DEPTH = 64;

/** 每个 Repository 默认读取的最大配置文件数。 */
export const DEFAULT_SCAN_MAX_CONFIG_FILES = 200;

/** 每个 Repository 可读取配置文件数硬上限。 */
export const HARD_SCAN_MAX_CONFIG_FILES = 500;

/** 单个配置文件默认最大字节数。 */
export const DEFAULT_SCAN_MAX_CONFIG_FILE_BYTES = 1_048_576;

/** 单个配置文件可配置字节数硬上限。 */
export const HARD_SCAN_MAX_CONFIG_FILE_BYTES = 2_097_152;

/** 每个 Repository 默认配置内容总字节预算。 */
export const DEFAULT_SCAN_MAX_TOTAL_CONFIG_BYTES = 5_242_880;

/** 每个 Repository 配置内容总字节硬上限。 */
export const HARD_SCAN_MAX_TOTAL_CONFIG_BYTES = 20_971_520;

/** 每个 Repository 默认诊断条目预算。 */
export const DEFAULT_SCAN_MAX_DIAGNOSTICS = 200;

/** 每个 Repository 诊断条目硬上限。 */
export const HARD_SCAN_MAX_DIAGNOSTICS = 500;

/** Runtime-only Repository Root 输入的最大字符数。 */
export const MAX_SCAN_ROOT_LENGTH = 1_024;

/** Project Scanner 输出普通文本字段的最大字符数。 */
export const MAX_DISCOVERY_TEXT_LENGTH = 1_000;

/** Project Scanner 输出相对路径的最大字符数。 */
export const MAX_DISCOVERY_PATH_LENGTH = 500;

/** Scanner Actor 的稳定 ID。 */
export const PROJECT_SCANNER_ACTOR_ID = "project-scanner";
