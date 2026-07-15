import process from "node:process";
import { join } from "node:path";

import { calculateDigest } from "../../publicProjectSmoke/digest/index.mjs";
import {
  assertCodexHostSmokeVersion,
  getCodexHostSmokeScenarios,
  inspectCodexHostSmokeVersion,
  loadAndVerifyCodexHostSmokePacket,
} from "../verification/index.mjs";
import { CODEX_HOST_SMOKE_RESULT_VERIFICATION_CHECKS } from "./constants/index.mjs";
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

const RESULT_SCHEMA_VERSION = "liushi.codex-host-smoke.result-verification.v2";
const defaultDependencies = {
  inspectEnvironment: () => ({
    platform: process.platform,
    architecture: process.arch,
  }),
  inspectWorktree: inspectCodexHostSmokeResultWorktree,
  inspectCodexVersion: inspectCodexHostSmokeVersion,
  inspectGitEvidence: inspectCodexHostSmokeGitEvidence,
  now: () => new Date().toISOString(),
};

export async function verifyCodexHostSmokeResult(input, overrides = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  const packet = await loadAndVerifyCodexHostSmokePacket(input);
  const verificationEnvironment = await dependencies.inspectEnvironment();
  assertCodexHostSmokeVerificationEnvironment(packet.manifest, verificationEnvironment);
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
    hostEvidenceVerified: true,
    matrixSupportClaim: "not_evaluated",
    hostScope: "interactive_tui",
    verificationEnvironment: {
      platform: verificationEnvironment.platform,
      architecture: verificationEnvironment.architecture,
    },
    verifiedAt: dependencies.now(),
    manifestPath: packet.manifestPath,
    activationPlanPath: packet.activationPlanPath,
    prepareManifestDigest: calculateDigest(packet.manifest),
    activationPlanDigest: calculateDigest(packet.activationPlan),
    codexProbeDigest: calculateDigest(packet.manifest.codexProbe),
    activationDigest: input.activationDigest,
    checks: CODEX_HOST_SMOKE_RESULT_VERIFICATION_CHECKS,
  };
}

function assertCodexHostSmokeVerificationEnvironment(manifest, verificationEnvironment) {
  for (const field of ["platform", "architecture"]) {
    const actualValue = verificationEnvironment?.[field];
    if (typeof actualValue !== "string" || actualValue.trim().length === 0) {
      throw new Error(`verificationEnvironment.${field} 必须是非空字符串。`);
    }
    if (actualValue !== manifest.executionEnvironment?.[field]) {
      throw new Error(
        `verificationEnvironment.${field} 与 Prepare Manifest executionEnvironment.${field} 不一致。`,
      );
    }
  }
}
