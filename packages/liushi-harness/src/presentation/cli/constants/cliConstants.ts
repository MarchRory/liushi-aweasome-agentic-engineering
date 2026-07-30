/** CLI JSON 输出协议版本。 */
export const CLI_OUTPUT_SCHEMA_VERSION = "1.0.0";

/** 未显式指定 Actor 时使用的本地 Human ID。 */
export const DEFAULT_CLI_ACTOR_ID = "local-human";

/** CLI 成功退出码。 */
export const CLI_EXIT_CODE_SUCCESS = 0;
/** CLI 未分类内部错误退出码。 */
export const CLI_EXIT_CODE_UNEXPECTED = 1;
/** CLI 输入非法退出码。 */
export const CLI_EXIT_CODE_INVALID_INPUT = 2;
/** CLI 目标不存在退出码。 */
export const CLI_EXIT_CODE_NOT_FOUND = 3;
/** CLI 状态或身份冲突退出码。 */
export const CLI_EXIT_CODE_CONFLICT = 4;
/** CLI 资源暂时不可用退出码。 */
export const CLI_EXIT_CODE_UNAVAILABLE = 5;
/** CLI Store 完整性失败退出码。 */
export const CLI_EXIT_CODE_CORRUPT_STORE = 6;
/** CLI I/O 失败退出码。 */
export const CLI_EXIT_CODE_IO_FAILURE = 7;
/** CLI 持久化结果未知退出码，调用方不得自动重试。 */
export const CLI_EXIT_CODE_OUTCOME_UNKNOWN = 8;

/** CLI 首个纵向切片支持的使用方式。 */
export const CLI_USAGE_LINES: readonly string[] = [
  "liushi-harness init --target codex --root <absolute-path> --workspace <id> --repository <id> --dry-run [--actor-id <id>] [--store <path>] [--json]",
  "liushi-harness init --apply <plan-ulid> --plan-digest <sha256> --workspace <id> --repository <id> --actor-id <id> --idempotency-key <key> [--store <path>] [--json]",
  "liushi-harness doctor [--store <path>] [--json]",
  "liushi-harness task create --workspace <id> [--source <text>] [--actor-id <id>] [--store <path>] [--json]",
  "liushi-harness task status --workspace <id> --task <ulid> [--store <path>] [--json]",
  "liushi-harness artifact propose --workspace <id> --task <ulid> --file <proposal.json> [--idempotency-key <key>] [--actor-id <id>] [--store <path>] [--json]",
  "liushi-harness approval decide --workspace <id> --task <ulid> --request <ulid> --request-digest <sha256> --decision <approved|rejected|waived> --idempotency-key <key> [--reason <text>] [--actor-id <id>] [--store <path>] [--json]",
  "liushi-harness rules resolve --catalog <catalog.json> --context <context.json> [--json]",
  "liushi-harness project scan --file <scan-manifest.json> [--json]",
  "liushi-harness profile compile --workspace <id> --task <ulid> --artifact <ulid> --report <file> [--store <path>] [--json]",
  "liushi-harness cell run --file <manifest.json> --workspace <id> --repository <id> --root <absolute-path> --verification-mode <fail_closed_mock|local_command> [--store <path>] [--json]",
  "liushi-harness coding-task session activate --file <manifest.json> --workspace <id> --repository <id> --root <absolute-path> --actor-id <id> [--store <path>] [--json]",
  "liushi-harness coding-task session closeout --file <command.json> --workspace <id> --repository <id> --root <absolute-path> --actor-id <id> [--store <path>] [--json]",
  "liushi-harness coding-task session complete --file <completion.json> --workspace <id> --session <id> --repository <id> --root <absolute-path> --actor-id <id> --verification-mode <fail_closed_mock|local_command> [--store <path>] [--json]",
  "liushi-harness coding-task session metrics enroll --file <enrollment.json> --workspace <id> --session <id> --actor-id <id> [--store <path>] [--json]",
  "liushi-harness coding-task session metrics settle --file <settlement.json> --workspace <id> --session <id> --actor-id <id> [--store <path>] [--json]",
  "liushi-harness coding-task session metrics report --workspace <id> --session <id> [--store <path>] [--json]",
  "liushi-harness coding-task session closeout assess --workspace <id> --session <id> --repository <id> --root <absolute-path> [--store <path>] [--json]",
  "liushi-harness coding-task session closeout recover --file <human-command.json> --workspace <id> --session <id> --repository <id> --root <absolute-path> --actor-id <id> [--store <path>] [--json]",
  "liushi-harness coding-task session closeout effective --workspace <id> --session <id> [--store <path>] [--json]",
  "liushi-harness hook bind --root <path> --workspace <id> --task <ulid> --artifact <ulid> --artifact-digest <sha256> [--actor-id <id>] [--store <path>] [--json]",
  "liushi-harness hook config --executor codex",
  "liushi-harness hook handle --executor codex [--store <path>]",
  "liushi-harness hook probe --executor codex [--executable <path-or-command>] [--json]",
  "liushi-harness executor compatibility compile --executor codex --prepare <prepare.json> --activation <activation.json> --result <hostResult.json> [--store <path>] [--json]",
  "liushi-harness executor compatibility query --matrix-digest <sha256:64hex> [--store <path>] [--json]",
  "liushi-harness executor compatibility bundle create --matrix-digest <sha256:64hex> --package-name <name> --package-version <version> --package-digest <sha256:64hex> --repository-uri <https-url> --source-revision <full-git-revision> --output <absolute-path> [--store <path>] [--json]",
];
