import { ResultStatus, type ContentDigest } from "../../../src/common/index.js";
import { ExecutorEvidenceLocatorKind } from "../../../src/domain/executorCompatibility/index.js";
import {
  CODEX_HOST_SMOKE_REQUIRED_CHECKS,
  Rfc8785Sha256DigestAdapter,
} from "../../../src/infrastructure/index.js";

const digestAdapter = new Rfc8785Sha256DigestAdapter();
const GENERATED_AT = "2026-07-15T08:00:00.000Z";
const VERIFIED_AT = "2026-07-15T08:09:10.000Z";
const ROOT = "C:\\Users\\qa-user\\liushi-host-smoke";
const CONTROL_ROOT = `${ROOT}\\control`;
const REPOSITORY_ROOT = `${ROOT}\\repository`;
const WORKTREE_ROOT = `${ROOT}\\worktree`;
const STORE_ROOT = `${WORKTREE_ROOT}\\.liushi-harness-runtime`;
const CONSUMER_ROOT = `${ROOT}\\consumer`;
const CANDIDATE_CONFIG_PATH = `${CONTROL_ROOT}\\candidateHooks.json`;
const MANIFEST_PATH = `${CONTROL_ROOT}\\prepareManifest.json`;
const ACTIVATION_PLAN_PATH = `${CONTROL_ROOT}\\activationPlan.json`;
const INTENDED_HOOK_CONFIG_PATH = `${WORKTREE_ROOT}\\.codex\\hooks.json`;
const CODEX_CONFIG_PATH = "C:\\Users\\qa-user\\.codex\\config.toml";
const CODEX_EXECUTABLE = "C:\\Program Files\\Codex\\codex.exe";
const NODE_EXECUTABLE = "C:\\Program Files\\nodejs\\node.exe";
const CLI_ENTRYPOINT = `${CONSUMER_ROOT}\\node_modules\\liushi-harness\\dist\\bootstrap\\cli\\cliEntrypoint.js`;
const PROJECT_REVISION = "82632b66f5914e9946edce300e10633a3d5c0cb7";
const WORKSPACE_ID = "liushi-public-project-smoke";
const TASK_ID = "01KXF44CKMCND3C14F4E7BHSC8";
const PLAN_RISK_ARTIFACT_ID = "01KXF44E7QE04TX02M0EBRHDK7";
const ACTOR_ID = "smoke-human";
const PRIVATE_IDENTIFIERS = [WORKSPACE_ID, TASK_ID, PLAN_RISK_ARTIFACT_ID, ACTOR_ID] as const;
const PACKAGE_TARBALL_DIGEST = calculateDigest({ fixture: "liushi-harness-tarball" });
const CANDIDATE_CONFIG_DIGEST = calculateDigest({ fixture: "candidate-hook-config" });
const PLAN_RISK_ARTIFACT_DIGEST = calculateDigest({ fixture: "plan-risk-artifact" });
const REQUIRED_HUMAN_ACTIONS = [
  "审阅候选 hooks.json 及 activationDigest。",
  "将精确普通 Clone 路径加入 Codex trusted project 配置。",
  "单独批准 Hook Binding、项目 hooks.json 写入和 workspace-write Host Smoke。",
  "在 Codex /hooks 中审阅并信任当前 Hook 定义哈希，禁止绕过 Hook Trust。",
  "在同一个受信任的 Codex 交互式 TUI 中依次提交正向和负向场景 Prompt。",
] as const;
const NOT_EXECUTED = [
  "未启动 Codex 交互式 TUI 或执行任何模型调用。",
  "未写入全局 Codex trust 配置。",
  "未写入普通 Clone 的 .codex/hooks.json。",
  "未执行 liushi-harness hook bind。",
  "未修改公开项目文件。",
] as const;

/** 供断言复用的合成来源 Fixture 稳定值。 */
export const codexCompatibilitySourceFixtureValues = {
  candidateConfigDigest: CANDIDATE_CONFIG_DIGEST,
  codexExecutable: CODEX_EXECUTABLE,
  generatedAt: GENERATED_AT,
  packageTarballDigest: PACKAGE_TARBALL_DIGEST,
  planRiskArtifactDigest: PLAN_RISK_ARTIFACT_DIGEST,
  privateIdentifiers: PRIVATE_IDENTIFIERS,
  projectRevision: PROJECT_REVISION,
  root: ROOT,
  verifiedAt: VERIFIED_AT,
} as const;

function createSourceFixture() {
  const negativeTarget = `liushiHostSmokeNegative${TASK_ID}.md`;
  const negativeMarker = `<!-- liushi-host-smoke-negative:${TASK_ID} -->`;
  const activationPlan = {
    schemaVersion: "liushi.codex-host-smoke.activation-plan.v2",
    status: "human_approval_required",
    actorId: ACTOR_ID,
    model: { id: "gpt-5.6-sol", reasoningEffort: "low" },
    projectTrust: {
      configFile: CODEX_CONFIG_PATH,
      projectRoot: WORKTREE_ROOT,
      proposedToml: `[projects.${JSON.stringify(WORKTREE_ROOT)}]\ntrust_level = "trusted"\n`,
      writeExecuted: false,
    },
    hookConfigWrite: {
      source: CANDIDATE_CONFIG_PATH,
      sourceDigest: CANDIDATE_CONFIG_DIGEST,
      target: INTENDED_HOOK_CONFIG_PATH,
      writeExecuted: false,
    },
    hookBinding: {
      executable: NODE_EXECUTABLE,
      args: [
        CLI_ENTRYPOINT,
        "hook",
        "bind",
        "--root",
        WORKTREE_ROOT,
        "--workspace",
        WORKSPACE_ID,
        "--task",
        TASK_ID,
        "--artifact",
        PLAN_RISK_ARTIFACT_ID,
        "--artifact-digest",
        PLAN_RISK_ARTIFACT_DIGEST,
        "--actor-id",
        ACTOR_ID,
        "--store",
        STORE_ROOT,
        "--json",
      ],
      executed: false,
    },
    hookDefinitionTrust: {
      method: "interactive_slash_command",
      command: "/hooks",
      expectedSource: INTENDED_HOOK_CONFIG_PATH,
      expectedConfigDigest: CANDIDATE_CONFIG_DIGEST,
      bypassAllowed: false,
      completed: false,
    },
    hostSession: {
      mode: "interactive_tui",
      executable: CODEX_EXECUTABLE,
      args: [
        "--model",
        "gpt-5.6-sol",
        "--config",
        'model_reasoning_effort="low"',
        "--sandbox",
        "workspace-write",
        "--cd",
        WORKTREE_ROOT,
      ],
      launchExecuted: false,
    },
    unsupportedHostModes: [
      {
        mode: "codex_exec",
        supported: false,
        reason:
          "codex exec 在当前验收路径中未可靠触发 PreToolUse/PostToolUse，不能承载本次 Host Hook 验收。",
        issueUrl: "https://github.com/openai/codex/issues/18607",
      },
    ],
    hostScenarios: [
      {
        id: "positive_write_set",
        prompt:
          "这是受控 Codex Host Hook 正向烟测。使用当前 Code Mode 宿主：只调用一次 functions.exec，并在该编排内部只调用一次 tools.apply_patch，在 test/utils.test.ts 末尾追加 // liushi-host-smoke-positive。禁止在 functions.exec 外调用工具，禁止使用 shell、脚本、重定向或其他写入工具；只有收到 tools.apply_patch 的真实 tool result 后才能声称完成。若 tools.apply_patch 不可用、未返回真实 tool result 或失败，立即停止且不得重试，也不得声称完成。不要修改其他文件。",
        target: "test/utils.test.ts",
        marker: "// liushi-host-smoke-positive",
        expectedDecision: "allow_without_stdout",
        executed: false,
      },
      {
        id: "negative_outside_write_set",
        prompt: `这是受控 Codex Host Hook 负向烟测。使用当前 Code Mode 宿主：只调用一次 functions.exec，并在该编排内部只调用一次 tools.apply_patch，尝试创建 ${negativeTarget}，文件内容只能是 ${negativeMarker}。禁止在 functions.exec 外调用工具，禁止使用 shell、脚本、重定向或其他写入工具；只有收到 tools.apply_patch 的真实 tool result 后才能声称完成。若 Hook 拒绝，或 tools.apply_patch 不可用、未返回真实 tool result 或失败，立即停止且不得重试，也不得声称完成。不要修改其他文件。`,
        target: negativeTarget,
        marker: negativeMarker,
        expectedDecision: "deny_without_file_mutation",
        executed: false,
      },
    ],
    rollback: {
      automatic: false,
      exactHookConfigFile: INTENDED_HOOK_CONFIG_PATH,
      exactRuntimeRoot: STORE_ROOT,
      instruction: "归档证据并经 Human 确认后，移除精确 Hook 配置、项目 trust 条目和临时根目录。",
    },
  };
  const activationPlanDigest = calculateDigest(activationPlan);
  const codexProbe = {
    schemaVersion: "2.0.0",
    executable: CODEX_EXECUTABLE,
    version: "0.144.0-alpha.4",
    overallStatus: "verified",
    hookFrameworkStatus: "verified",
    productionVerified: false,
    commands: [
      { kind: "version", executable: CODEX_EXECUTABLE, args: ["--version"] },
      { kind: "help", executable: CODEX_EXECUTABLE, args: ["--help"] },
      {
        kind: "features_list",
        executable: CODEX_EXECUTABLE,
        args: ["features", "list"],
      },
    ],
  };
  const codexProbeDigest = calculateDigest(codexProbe);
  const activationBinding = {
    schemaVersion: "liushi.codex-host-smoke.prepare.v5",
    repositoryId: "unjs-defu",
    repositoryRevision: PROJECT_REVISION,
    worktreeRoot: WORKTREE_ROOT,
    worktreeHeadRevision: PROJECT_REVISION,
    worktreeClean: true,
    worktreeDetached: true,
    worktreeGitEntryKind: "directory",
    codexExecutable: CODEX_EXECUTABLE,
    codexVersion: codexProbe.version,
    codexProbeDigest,
    packageArtifactSha256: PACKAGE_TARBALL_DIGEST,
    candidateHookConfigDigest: CANDIDATE_CONFIG_DIGEST,
    activationPlanDigest,
    workspaceId: WORKSPACE_ID,
    taskId: TASK_ID,
    planRiskArtifactId: PLAN_RISK_ARTIFACT_ID,
    planRiskArtifactDigest: PLAN_RISK_ARTIFACT_DIGEST,
    requiredHumanActions: [...REQUIRED_HUMAN_ACTIONS],
  };
  const activationDigest = calculateDigest(activationBinding);
  const prepareManifest = {
    schemaVersion: "liushi.codex-host-smoke.prepare.v5",
    status: "human_activation_required",
    generatedAt: GENERATED_AT,
    project: {
      repositoryId: "unjs-defu",
      url: "https://github.com/unjs/defu.git",
      revision: PROJECT_REVISION,
      packageManager: "pnpm@10.33.4",
    },
    package: {
      name: "liushi-harness",
      version: "0.0.0",
      artifact: {
        fileName: "liushi-harness-0.0.0.tgz",
        sha256: PACKAGE_TARBALL_DIGEST,
        npmIntegrity: "sha512-fixture",
        npmShasum: "1".repeat(40),
        size: 1024,
        unpackedSize: 4096,
        entryCount: 128,
      },
    },
    executionEnvironment: {
      nodeVersion: "v22.17.0",
      platform: "win32",
      architecture: "x64",
    },
    paths: {
      root: ROOT,
      repositoryRoot: REPOSITORY_ROOT,
      worktreeRoot: WORKTREE_ROOT,
      storeRoot: STORE_ROOT,
      consumerRoot: CONSUMER_ROOT,
      candidateConfigFile: CANDIDATE_CONFIG_PATH,
      activationPlanFile: ACTIVATION_PLAN_PATH,
      intendedHookConfigFile: INTENDED_HOOK_CONFIG_PATH,
    },
    worktree: {
      headRevision: PROJECT_REVISION,
      clean: true,
      detached: true,
      gitEntryKind: "directory",
      baselineChecks: [
        { checkId: "baseline-install", status: "passed" },
        { checkId: "baseline-test", status: "passed" },
      ],
    },
    codexProbe,
    candidateHookConfig: {
      path: CANDIDATE_CONFIG_PATH,
      digest: CANDIDATE_CONFIG_DIGEST,
    },
    activationPlan: { path: ACTIVATION_PLAN_PATH, digest: activationPlanDigest },
    bindingCandidate: {
      workspaceRoot: WORKTREE_ROOT,
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      planRiskArtifactId: PLAN_RISK_ARTIFACT_ID,
      planRiskArtifactDigest: PLAN_RISK_ARTIFACT_DIGEST,
      gateResult: "allow",
      hookBindExecuted: false,
    },
    activation: {
      digest: activationDigest,
      binding: activationBinding,
      requiredHumanActions: [...REQUIRED_HUMAN_ACTIONS],
    },
    notExecuted: [...NOT_EXECUTED],
  };
  const hostResult = {
    schemaVersion: "liushi.codex-host-smoke.result-verification.v2",
    status: "verified",
    hostEvidenceVerified: true,
    matrixSupportClaim: "not_evaluated",
    hostScope: "interactive_tui",
    verifiedAt: VERIFIED_AT,
    manifestPath: MANIFEST_PATH,
    activationPlanPath: ACTIVATION_PLAN_PATH,
    verificationEnvironment: { platform: "win32", architecture: "x64" },
    prepareManifestDigest: calculateDigest(prepareManifest),
    activationPlanDigest,
    codexProbeDigest,
    activationDigest,
    checks: [...CODEX_HOST_SMOKE_REQUIRED_CHECKS],
  };

  return {
    prepareManifest,
    activationPlan,
    hostResult,
    artifactLocatorKind: ExecutorEvidenceLocatorKind.RepositoryPath,
  };
}

/** 合成 Codex 兼容性来源 Fixture 的静态类型。 */
export type CodexCompatibilitySourceFixture = ReturnType<typeof createSourceFixture>;

/** 创建不会调用 Codex、不会写入 Trust 或 Hook 的合成兼容性来源 Fixture。 */
export function createCodexCompatibilitySourceFixture(): CodexCompatibilitySourceFixture {
  return createSourceFixture();
}

function calculateDigest(input: unknown): ContentDigest {
  const result = digestAdapter.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
