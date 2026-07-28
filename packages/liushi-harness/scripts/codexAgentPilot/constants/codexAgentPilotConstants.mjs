export const PILOT_SCHEMA_VERSION = "liushi.codex-agent-pilot.v1";
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
export const PERMISSION_MODE = "workspace-write";
export const APPROVAL_POLICY = "never";
export const WRITE_SET = Object.freeze(["test/utils.test.ts"]);
export const AGENT_ACTOR_ID = "agent:codex-agent-pilot";
export const GATES = Object.freeze({ G8: "G8", G1: "G1", G4: "G4" });
export const STATE_STATUS = Object.freeze({
  WaitingApproval: "waiting_human_approval",
  WaitingHostApproval: "waiting_host_approval",
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
export const SESSION_MANIFEST_NAME = "sessionActivation.json";
export const SCAN_MANIFEST_NAME = "scanManifest.json";
export const SCAN_REPORT_NAME = "scanReport.json";
export const PROFILE_PROPOSAL_NAME = "projectProfileProposal.json";
export const REQUIREMENT_PROPOSAL_NAME = "requirementContract.json";
export const PLAN_RISK_PROPOSAL_NAME = "planRisk.json";
export const REASONING_EFFORT = "medium";

export const REQUIRED_HUMAN_ACTIONS = Object.freeze([
  "仅在外部明确批准精确 stateDigest 后运行对应 approve",
  "审核 candidateHooks.json、agentPrompt.txt、activationDigest 与写集",
  "在受信 Host 中单独批准精确 SessionFlags Hook 哈希、权限与模型启动",
]);

export const FORBIDDEN_ACTIONS = Object.freeze([
  "不启动 Codex 模型或 Agent",
  "不写 Hook Trust 或用户 Codex Home",
  "不执行 Agent、Closeout 或 Completion",
  "不写 worktree/.codex/hooks.json",
  "不使用 dangerously-bypass-hook-trust",
]);
