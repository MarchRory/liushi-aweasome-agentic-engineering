export const CODEX_HOST_SMOKE_PREPARE_SCHEMA_VERSION = "liushi.codex-host-smoke.prepare.v5";
export const CODEX_HOST_SMOKE_STATUS = "human_activation_required";
export const CODEX_HOST_SMOKE_WORKTREE_DIRECTORY = "worktree";
export const CODEX_HOST_SMOKE_CONTROL_DIRECTORY = "control";
export const CODEX_HOST_SMOKE_RUNTIME_DIRECTORY = ".liushi-harness-runtime";
export const CODEX_HOST_SMOKE_CANDIDATE_CONFIG_FILE = "candidateHooks.json";
export const CODEX_HOST_SMOKE_ACTIVATION_PLAN_FILE = "activationPlan.json";
export const CODEX_HOST_SMOKE_MANIFEST_FILE = "prepareManifest.json";

export const CODEX_HOST_SMOKE_REQUIRED_HUMAN_ACTIONS = [
  "审阅候选 hooks.json 及 activationDigest。",
  "将精确普通 Clone 路径加入 Codex trusted project 配置。",
  "单独批准 Hook Binding、项目 hooks.json 写入和 workspace-write Host Smoke。",
  "在 Codex /hooks 中审阅并信任当前 Hook 定义哈希，禁止绕过 Hook Trust。",
  "在同一个受信任的 Codex 交互式 TUI 中依次提交正向和负向场景 Prompt。",
];

export const CODEX_HOST_SMOKE_NOT_EXECUTED = [
  "未启动 Codex 交互式 TUI 或执行任何模型调用。",
  "未写入全局 Codex trust 配置。",
  "未写入普通 Clone 的 .codex/hooks.json。",
  "未执行 liushi-harness hook bind。",
  "未修改公开项目文件。",
];
