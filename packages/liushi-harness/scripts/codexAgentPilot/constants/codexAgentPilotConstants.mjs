export const PILOT_SCHEMA_VERSION = "liushi.codex-agent-pilot.v1";
export const PILOT_CASE_SCHEMA_VERSION = "liushi.codex-agent-pilot.case.v1";
export const PILOT_CASE_SOURCE_KIND = Object.freeze({
  FixedPublic: "fixed_public",
  LocalRepository: "local_repository",
});
export const STATE_SCHEMA_VERSION = "liushi.codex-agent-pilot.state.v1";
export const STATE_DIRECTORY = "state";
export const CONTROL_DIRECTORY = "control";
export const RUNTIME_DIRECTORY = "runtime";
export const REPOSITORY_DIRECTORY = "repository";
export const CONSUMER_DIRECTORY = "consumer";
export const STATE_FILE_PREFIX = "state-";
export const STATE_FILE_SUFFIX = ".json";
export const STATE_REVISION_WIDTH = 4;
export const WORKSPACE_ID = "liushi-codex-agent-pilot";
export const REPOSITORY_ID = "unjs-defu";
export const REPOSITORY_URL = "https://github.com/unjs/defu.git";
export const REPOSITORY_REVISION = "82632b66f5914e9946edce300e10633a3d5c0cb7";
export const PACKAGE_MANAGER = "pnpm@10.33.4";
export const SOTA_MODEL_ID = "gpt-5.6-sol";
export const CODEX_AGENT_EXECUTION_MODE = Object.freeze({
  AppServerFileChangeApproval: "codex_app_server_file_change_approval.v1",
});
export const CODEX_PERMISSION_PROFILE = Object.freeze({
  ReadOnly: ":read-only",
});
export const CODEX_APPROVAL_POLICY = Object.freeze({
  OnRequest: "on-request",
});
export const CODEX_FILE_CHANGE_DECISION = Object.freeze({
  Accept: "accept",
  Cancel: "cancel",
});
export const CODEX_ACTION_CONTROL_KIND = Object.freeze({
  AppServerFileChangeApproval: "app_server_file_change_approval",
});
export const CODEX_FILE_CHANGE_DECISION_SCOPE = Object.freeze({
  SingleRequest: "single_request",
});
export const CODEX_FILE_CHANGE_KIND = Object.freeze({
  Update: "update",
});
export const WRITE_SET = Object.freeze(["test/utils.test.ts"]);
export const AGENT_ACTOR_ID = "agent:codex-agent-pilot";
export const GATES = Object.freeze({ G8: "G8", G1: "G1", G4: "G4" });
export const STATE_STATUS = Object.freeze({
  WaitingApproval: "waiting_human_approval",
  WaitingHostApproval: "waiting_host_approval",
  HostApproved: "host_approved",
  AgentLaunching: "agent_launching",
  WaitingCloseout: "waiting_closeout",
  WaitingCompletion: "waiting_completion",
  WaitingSettlement: "waiting_settlement",
  Completed: "completed",
  AgentFailed: "agent_failed",
  AgentOutcomeUnknown: "agent_outcome_unknown",
});
export const HOST_APPROVAL_DECISION = Object.freeze({ Approved: "approved" });
export const AGENT_EXECUTION_STATUS = Object.freeze({
  Passed: "passed",
  Failed: "failed",
  OutcomeUnknown: "outcome_unknown",
});
export const ARTIFACT_TYPES = Object.freeze({
  ProjectProfile: "project_profile_proposal",
  Requirement: "requirement_contract",
  PlanRisk: "plan_risk",
});
export const COMMAND_TYPES = Object.freeze({
  Create: "coding_task.create",
  Provision: "worktree.provision",
  StartAttempt: "coding_task.start_attempt",
});
export const TASK_SOURCE = "fixed-codex-agent-pilot-unjs-defu";
export const WORKTREE_RELATIVE_PATH = "worktrees/codex-agent-pilot";
export const CANDIDATE_CONFIG_NAME = "candidateHooks.json";
export const AGENT_PROMPT_NAME = "agentPrompt.txt";
export const HOST_PACKET_NAME = "hostActivationPacket.json";
export const HOST_APPROVAL_PACKET_PREFIX = "hostApprovalPacket-";
export const SESSION_MANIFEST_NAME = "sessionActivation.json";
export const SESSION_CLOSEOUT_COMMAND_NAME = "sessionCloseout.json";
export const SESSION_COMPLETION_INPUT_NAME = "sessionCompletion.json";
export const PILOT_METRICS_ENROLLMENT_NAME = "pilotMetricsEnrollment.json";
export const PILOT_METRICS_SETTLEMENT_NAME = "pilotMetricsSettlement.json";
export const PILOT_METRICS_FACTS_SCHEMA_VERSION = "liushi.codex-agent-pilot.metrics-facts.v1";
export const SCAN_MANIFEST_NAME = "scanManifest.json";
export const SCAN_REPORT_NAME = "scanReport.json";
export const PROFILE_PROPOSAL_NAME = "projectProfileProposal.json";
export const REQUIREMENT_PROPOSAL_NAME = "requirementContract.json";
export const PLAN_RISK_PROPOSAL_FILE_STEM = "planRisk";
export const PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION = "2.0.0";
export const CODING_TASK_SESSION_ACTIVATION_MANIFEST_SCHEMA_VERSION =
  "coding-task.session.activate.v1";
export const PILOT_VERIFICATION_KIND = "custom";
export const PILOT_VERIFICATION_CHECK_ID = Object.freeze({
  Test: "public-project.test",
  Typecheck: "public-project.typecheck",
});
export const PILOT_PACKAGE_SCRIPT = Object.freeze({
  Test: "test",
  Typecheck: "test:types",
});
export const PILOT_VALIDATOR_ID = Object.freeze({
  NodeProcessExitZero: "node.process.exit-zero",
  PackageScriptTest: "package_script.test",
  TypeScriptTypecheck: "typescript.typecheck",
});
export const HOST_APPROVAL_SCHEMA_VERSION = "liushi.codex-agent-pilot.host-approval.v3";
export const HOST_APPROVAL_RECORD_SCHEMA_VERSION =
  "liushi.codex-agent-pilot.host-approval-record.v1";
export const AGENT_LAUNCH_SCHEMA_VERSION = "liushi.codex-agent-pilot.agent-launch.v1";
export const AGENT_EXECUTION_SCHEMA_VERSION = "liushi.codex-agent-pilot.agent-execution.v2";
export const AGENT_EXECUTION_RECORD_NAME = "agentExecution.json";
export const FILE_CHANGE_AUTHORIZATION_SCHEMA_VERSION =
  "liushi.codex-agent-pilot.file-change-authorization.v1";
export const CODEX_AGENT_TIMEOUT_MS = 15 * 60 * 1000;
export const CODEX_AGENT_OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;
export const CODEX_AGENT_STDERR_LIMIT_BYTES = 256 * 1024;
export const CODEX_AGENT_TERMINATION_CONFIRMATION_TIMEOUT_MS = 5_000;
export {
  CODEX_DISABLED_AGENT_FEATURES,
  CODEX_HOOK_EVENTS,
  CODEX_HOOK_FEATURE_OVERRIDE,
  CODEX_MODEL_PROVIDER,
  CODEX_MODEL_PROVIDER_ID,
  CODEX_RESTRICTED_RUNTIME_OVERRIDES,
  REASONING_EFFORT,
} from "../../../dist/infrastructure/executors/codex/agentHost/sessionFlags/index.js";
export const CODEX_ALLOWED_MUTATION_SURFACES = Object.freeze(["fileChange"]);
export const CODEX_ALLOWED_FILE_CHANGE_KINDS = Object.freeze([CODEX_FILE_CHANGE_KIND.Update]);
export const CODEX_HOOK_TIMEOUT_SECONDS = 30;
export const CODEX_APP_SERVER_TIMEOUT_MS = 30_000;
export const CODEX_APP_SERVER_OUTPUT_LIMIT = 1024 * 1024;
export {
  CODEX_PREFLIGHT_PROCESS_COUNT as HOST_PREFLIGHT_PROCESS_COUNT,
  CODEX_PREFLIGHT_REAL_MODEL_REQUEST_COUNT as HOST_PREFLIGHT_REAL_MODEL_REQUEST_COUNT,
} from "../../../dist/infrastructure/executors/codex/agentHost/preflight/index.js";
export const CODEX_MODEL_LAUNCH_LIMIT = 1;
export const CODEX_APP_SERVER_REQUEST_IDS = Object.freeze({
  Initialize: 1,
  HooksList: 2,
});
export const CODEX_HOOK_PERMISSION_MODE = Object.freeze({
  Default: "default",
});
export const CODEX_HOOK_TOOL = Object.freeze({
  ApplyPatch: "apply_patch",
});
export const AGENT_FILE_CHANGE_PROJECTION_SCHEMA_VERSION =
  "liushi.codex-agent-pilot.app-server-hook-projection.v1";
export const AGENT_SESSION_PROCESS_HOST_SURFACE = Object.freeze({
  Automation: "automation",
});
export const AGENT_SESSION_PROCESS_OUTCOME = Object.freeze({
  Completed: "completed",
});
export const CODEX_AGENT_EXECUTOR_ID = "openai-codex";
export const CODEX_HOOK_EVENT_METADATA = Object.freeze({
  PreToolUse: Object.freeze({
    eventName: "preToolUse",
    keySuffix: "pre_tool_use:0:0",
  }),
  PostToolUse: Object.freeze({
    eventName: "postToolUse",
    keySuffix: "post_tool_use:0:0",
  }),
});
export const CODEX_HOOK_SOURCE = "sessionFlags";
export const CODEX_HOOK_TRUST_STATUS = Object.freeze({
  Untrusted: "untrusted",
  Trusted: "trusted",
});

export const REQUIRED_HUMAN_ACTIONS = Object.freeze([
  "审核当前 Gate 的语义内容后，使用 Gate 名称运行对应 approve",
  "审核 agentPrompt.txt、activationDigest、写集与历史业务逻辑判定",
  "单独审核 Host Packet、隔离运行时、FileChange 单次审批与模型启动",
]);

export const FORBIDDEN_ACTIONS = Object.freeze([
  "不启动 Codex 模型或 Agent",
  "不写 Hook Trust 或用户 Codex Home",
  "不执行 Agent、Closeout 或 Completion",
  "不写 worktree/.codex/hooks.json",
  "不把 headless 原生 Hook 声明为有效执行控制",
  "不使用 acceptForSession 或扩大授权根目录",
  "不使用 dangerously-bypass-hook-trust",
]);
