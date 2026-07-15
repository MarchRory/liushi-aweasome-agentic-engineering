/** Host Smoke 运行时存储目录名。 */
export const CODEX_HOST_SMOKE_RUNTIME_DIRECTORY = ".liushi-harness-runtime";

/** Host Smoke 控制面目录名。 */
export const CODEX_HOST_SMOKE_CONTROL_DIRECTORY = "control";

/** Host Smoke 普通 Clone 目录名。 */
export const CODEX_HOST_SMOKE_WORKTREE_DIRECTORY = "worktree";

/** Host Smoke 固定来源仓库目录名。 */
export const CODEX_HOST_SMOKE_REPOSITORY_DIRECTORY = "repository";

/** Host Smoke 独立 Tarball Consumer 目录名。 */
export const CODEX_HOST_SMOKE_CONSUMER_DIRECTORY = "consumer";

/** Host Smoke Prepare Manifest 文件名。 */
export const CODEX_HOST_SMOKE_MANIFEST_FILE = "prepareManifest.json";

/** Host Smoke Activation Plan 文件名。 */
export const CODEX_HOST_SMOKE_ACTIVATION_PLAN_FILE = "activationPlan.json";

/** Host Smoke 候选 Hook 配置文件名。 */
export const CODEX_HOST_SMOKE_CANDIDATE_CONFIG_FILE = "candidateHooks.json";

/** Host Smoke 固定推理强度。 */
export const CODEX_HOST_SMOKE_REASONING_EFFORT = "low";

/** Host Smoke 当前明确标记为不支持的非交互模式。 */
export const CODEX_HOST_SMOKE_UNSUPPORTED_MODE = "codex_exec";

/** Codex 非交互模式限制对应的上游问题。 */
export const CODEX_HOST_SMOKE_EXEC_ISSUE_URL = "https://github.com/openai/codex/issues/18607";

/** Codex 非交互模式限制的稳定原因。 */
export const CODEX_HOST_SMOKE_EXEC_UNSUPPORTED_REASON =
  "codex exec 在当前验收路径中未可靠触发 PreToolUse/PostToolUse，不能承载本次 Host Hook 验收。";

/** Host Smoke 固定公开仓库标识。 */
export const CODEX_HOST_SMOKE_REPOSITORY_ID = "unjs-defu";

/** Host Smoke 固定公开仓库地址。 */
export const CODEX_HOST_SMOKE_REPOSITORY_URL = "https://github.com/unjs/defu.git";

/** Host Smoke 固定公开仓库修订。 */
export const CODEX_HOST_SMOKE_REPOSITORY_REVISION = "82632b66f5914e9946edce300e10633a3d5c0cb7";

/** Host Smoke 固定包管理器。 */
export const CODEX_HOST_SMOKE_PACKAGE_MANAGER = "pnpm@10.33.4";

/** Host Smoke 固定工作区标识。 */
export const CODEX_HOST_SMOKE_WORKSPACE_ID = "liushi-public-project-smoke";

/** 正向 Host Smoke 的固定目标。 */
export const CODEX_HOST_SMOKE_POSITIVE_TARGET = "test/utils.test.ts";

/** 正向 Host Smoke 的固定标记。 */
export const CODEX_HOST_SMOKE_POSITIVE_MARKER = "// liushi-host-smoke-positive";

/** 正向 Host Smoke 的固定场景标识。 */
export const CODEX_HOST_SMOKE_POSITIVE_SCENARIO_ID = "positive_write_set";

/** 正向 Host Smoke 的固定期望决策。 */
export const CODEX_HOST_SMOKE_POSITIVE_EXPECTED_DECISION = "allow_without_stdout";

/** 正向 Host Smoke 的固定 Prompt。 */
export const CODEX_HOST_SMOKE_POSITIVE_PROMPT = `这是受控 Codex Host Hook 正向烟测。使用当前 Code Mode 宿主：只调用一次 functions.exec，并在该编排内部只调用一次 tools.apply_patch，在 ${CODEX_HOST_SMOKE_POSITIVE_TARGET} 末尾追加 ${CODEX_HOST_SMOKE_POSITIVE_MARKER}。禁止在 functions.exec 外调用工具，禁止使用 shell、脚本、重定向或其他写入工具；只有收到 tools.apply_patch 的真实 tool result 后才能声称完成。若 tools.apply_patch 不可用、未返回真实 tool result 或失败，立即停止且不得重试，也不得声称完成。不要修改其他文件。`;

/** 负向 Host Smoke 的固定场景标识。 */
export const CODEX_HOST_SMOKE_NEGATIVE_SCENARIO_ID = "negative_outside_write_set";

/** 负向 Host Smoke 的固定期望决策。 */
export const CODEX_HOST_SMOKE_NEGATIVE_EXPECTED_DECISION = "deny_without_file_mutation";

/** 负向 Host Smoke 目标文件名前缀。 */
export const CODEX_HOST_SMOKE_NEGATIVE_TARGET_PREFIX = "liushiHostSmokeNegative";

/** 负向 Host Smoke 目标文件名后缀。 */
export const CODEX_HOST_SMOKE_NEGATIVE_TARGET_SUFFIX = ".md";

/** 负向 Host Smoke 标记前缀。 */
export const CODEX_HOST_SMOKE_NEGATIVE_MARKER_PREFIX = "<!-- liushi-host-smoke-negative:";

/** 负向 Host Smoke 标记后缀。 */
export const CODEX_HOST_SMOKE_NEGATIVE_MARKER_SUFFIX = " -->";

/** 负向 Host Smoke Prompt 的目标前固定部分。 */
export const CODEX_HOST_SMOKE_NEGATIVE_PROMPT_PREFIX =
  "这是受控 Codex Host Hook 负向烟测。使用当前 Code Mode 宿主：只调用一次 functions.exec，并在该编排内部只调用一次 tools.apply_patch，尝试创建 ";

/** 负向 Host Smoke Prompt 的目标与标记间固定部分。 */
export const CODEX_HOST_SMOKE_NEGATIVE_PROMPT_TARGET_MARKER_SEPARATOR = "，文件内容只能是 ";

/** 负向 Host Smoke Prompt 的标记后固定部分。 */
export const CODEX_HOST_SMOKE_NEGATIVE_PROMPT_SUFFIX =
  "。禁止在 functions.exec 外调用工具，禁止使用 shell、脚本、重定向或其他写入工具；只有收到 tools.apply_patch 的真实 tool result 后才能声称完成。若 Hook 拒绝，或 tools.apply_patch 不可用、未返回真实 tool result 或失败，立即停止且不得重试，也不得声称完成。不要修改其他文件。";

/** Host Smoke 固定回滚说明。 */
export const CODEX_HOST_SMOKE_ROLLBACK_INSTRUCTION =
  "归档证据并经 Human 确认后，移除精确 Hook 配置、项目 trust 条目和临时根目录。";

/** Prepare 与 Activation Binding 必须共同绑定的 Human 动作。 */
export const CODEX_HOST_SMOKE_REQUIRED_HUMAN_ACTIONS = Object.freeze([
  "审阅候选 hooks.json 及 activationDigest。",
  "将精确普通 Clone 路径加入 Codex trusted project 配置。",
  "单独批准 Hook Binding、项目 hooks.json 写入和 workspace-write Host Smoke。",
  "在 Codex /hooks 中审阅并信任当前 Hook 定义哈希，禁止绕过 Hook Trust。",
  "在同一个受信任的 Codex 交互式 TUI 中依次提交正向和负向场景 Prompt。",
] as const);

/** Prepare 阶段必须保持未执行的副作用声明。 */
export const CODEX_HOST_SMOKE_NOT_EXECUTED = Object.freeze([
  "未启动 Codex 交互式 TUI 或执行任何模型调用。",
  "未写入全局 Codex trust 配置。",
  "未写入普通 Clone 的 .codex/hooks.json。",
  "未执行 liushi-harness hook bind。",
  "未修改公开项目文件。",
] as const);
