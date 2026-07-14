import { join } from "node:path";

import {
  assertCodexHostSmokeVersion,
  getCodexHostSmokeScenarios,
  inspectCodexHostSmokeVersion,
  loadAndVerifyCodexHostSmokePacket,
} from "../verification/index.mjs";
import {
  assertCodexHostSmokeGitEvidence,
  assertCodexHostSmokeResultWorktree,
  inspectCodexHostSmokeGitEvidence,
  inspectCodexHostSmokeResultWorktree,
} from "./git/index.mjs";
import {
  verifyCodexHostSmokeActivationEvidence,
  verifyCodexHostSmokeRuntimeEvidence,
} from "./runtime/index.mjs";

const RESULT_SCHEMA_VERSION = "liushi.codex-host-smoke.result-verification.v1";
const defaultDependencies = {
  inspectWorktree: inspectCodexHostSmokeResultWorktree,
  inspectCodexVersion: inspectCodexHostSmokeVersion,
  inspectGitEvidence: inspectCodexHostSmokeGitEvidence,
};

export async function verifyCodexHostSmokeResult(input, overrides = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  const packet = await loadAndVerifyCodexHostSmokePacket(input);
  const { manifest, activationPlan, candidateConfig } = packet;
  assertCodexHostSmokeVersion(
    manifest,
    dependencies.inspectCodexVersion(manifest.codexProbe.executable),
  );
  assertCodexHostSmokeResultWorktree(
    manifest,
    dependencies.inspectWorktree(manifest.paths.worktreeRoot),
  );
  await verifyCodexHostSmokeActivationEvidence(manifest, activationPlan, candidateConfig);

  const scenarios = getCodexHostSmokeScenarios(activationPlan);
  const gitEvidence = await dependencies.inspectGitEvidence(manifest.paths.worktreeRoot, scenarios);
  assertCodexHostSmokeGitEvidence(gitEvidence, scenarios);
  const taskDirectory = join(
    manifest.paths.storeRoot,
    "workspaces",
    manifest.bindingCandidate.workspaceId,
    "tasks",
    manifest.bindingCandidate.taskId,
  );
  await verifyCodexHostSmokeRuntimeEvidence(manifest, taskDirectory, scenarios);

  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    status: "verified",
    productionVerified: true,
    hostScope: "interactive_tui",
    manifestPath: packet.manifestPath,
    activationPlanPath: packet.activationPlanPath,
    activationDigest: input.activationDigest,
    checks: [
      "packet_digest",
      "codex_version",
      "standard_clone_head_detached",
      "trusted_hook_config",
      "hook_binding",
      "positive_exact_git_diff",
      "positive_action_journal_closed",
      "positive_apply_patch_trace",
      "positive_same_tool_invocation",
      "negative_authorization_denied",
      "negative_exact_target_same_session",
      "negative_no_post",
      "negative_target_unchanged",
    ],
  };
}
