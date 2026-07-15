import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus, type ContentDigest } from "../../src/common/index.js";
import {
  ExecutorAdapterKind,
  ExecutorArchitecture,
  ExecutorDistribution,
  ExecutorEvidenceKind,
  ExecutorEvidenceLocatorKind,
  ExecutorHostSurface,
  ExecutorOperatingSystem,
  ExecutorSupportLevel,
  compileExecutorCompatibilityMatrix,
  createExecutorCapabilityEvidenceDigestInput,
  createManagedFileMutationHookPolicy,
} from "../../src/domain/executorCompatibility/index.js";
import {
  CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  CODEX_HOST_SMOKE_REQUIRED_CHECKS,
  CODEX_STATIC_PROBE_CHECKS,
  CodexCompatibilityEvidenceProjectorAdapter,
  CodexCompatibilityObservationKind,
  Rfc8785Sha256DigestAdapter,
  type CodexCompatibilityEvidenceProjection,
  type ProjectCodexCompatibilityEvidenceInput,
} from "../../src/infrastructure/index.js";

const digestAdapter = new Rfc8785Sha256DigestAdapter();
const projector = new CodexCompatibilityEvidenceProjectorAdapter(digestAdapter);
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

describe("Codex 兼容性证据投影", () => {
  it("从三份受证来源投影精确作用域且不虚构模型或权限", () => {
    const fixture = createValidFixture();
    const projection = projectSuccessfully(fixture);

    expect(projection.artifact.scope).toEqual({
      adapterKind: ExecutorAdapterKind.Codex,
      distribution: ExecutorDistribution.CodexCli,
      adapterDigest: PACKAGE_TARBALL_DIGEST,
      executorVersion: "0.144.0-alpha.4",
      surface: ExecutorHostSurface.InteractiveTui,
      operatingSystem: ExecutorOperatingSystem.Windows,
      architecture: ExecutorArchitecture.X64,
      configurationDigest: CANDIDATE_CONFIG_DIGEST,
    });
    expect(projection.artifact.scope).not.toHaveProperty("modelId");
    expect(projection.artifact.scope).not.toHaveProperty("permissionMode");
    expect(projection.artifact.sourceDigests).toEqual({
      prepareManifest: calculateDigest(fixture.prepareManifest),
      activationPlan: calculateDigest(fixture.activationPlan),
      staticProbe: calculateDigest(fixture.prepareManifest.codexProbe),
      hostResult: calculateDigest(fixture.hostResult),
      activation: calculateDigest(fixture.prepareManifest.activation.binding),
    });
    expect(projection.artifact.observations).toEqual([
      {
        kind: CodexCompatibilityObservationKind.StaticProbe,
        observedAt: GENERATED_AT,
        outcome: "passed",
        checkIds: CODEX_STATIC_PROBE_CHECKS,
      },
      {
        kind: CodexCompatibilityObservationKind.HostSmoke,
        observedAt: VERIFIED_AT,
        outcome: "passed",
        checkIds: CODEX_HOST_SMOKE_REQUIRED_CHECKS,
      },
    ]);
  });

  it("完整投影不泄漏宿主路径或原始调用标识", () => {
    const projection = projectSuccessfully(createValidFixture());
    const strings = collectStringValues(projection);
    const serialized = JSON.stringify(projection);

    expect(strings.some((value) => /^(?:[A-Za-z]:[\\/]|[\\/]{2}|\/)/u.test(value))).toBe(false);
    for (const forbidden of [
      ...PRIVATE_IDENTIFIERS,
      PLAN_RISK_ARTIFACT_DIGEST,
      "unjs-defu",
      "https://github.com/unjs/defu.git",
      PROJECT_REVISION,
      "gpt-5.6-sol",
    ]) {
      expect(strings).not.toContain(forbidden);
      expect(serialized).not.toContain(forbidden);
    }
    for (const key of [
      "workspaceId",
      "taskId",
      "planRiskArtifactId",
      "planRiskArtifactDigest",
      "actorId",
      "repositoryId",
      "repositoryRevision",
      "modelId",
      "sessionId",
      "turnId",
      "toolCallId",
    ] as const) {
      expect(serialized).not.toContain(key);
    }
  });

  it("只生成一条静态探测、四条冒烟和两条负向证据", () => {
    const projection = projectSuccessfully(createValidFixture());
    const kinds = projection.evidence.map((item) => item.kind);

    expect(projection.evidence).toHaveLength(7);
    expect(kinds.filter((kind) => kind === ExecutorEvidenceKind.StaticProbe)).toHaveLength(1);
    expect(kinds.filter((kind) => kind === ExecutorEvidenceKind.SmokeTest)).toHaveLength(4);
    expect(kinds.filter((kind) => kind === ExecutorEvidenceKind.NegativeTest)).toHaveLength(2);
    expect(kinds).not.toContain(ExecutorEvidenceKind.ContractTest);
    expect(kinds).not.toContain(ExecutorEvidenceKind.ProductionE2e);

    for (const evidence of projection.evidence) {
      const observation = projection.artifact.observations.find(
        (item) => item.observedAt === evidence.source.observedAt,
      );
      expect(observation).toBeDefined();
      expect(evidence.source.artifactDigest).toBe(projection.artifactDigest);
      expect(evidence.source.schemaVersion).toBe(
        CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
      );
      expect(
        evidence.source.checkIds.every((checkId) => observation?.checkIds.includes(checkId)),
      ).toBe(true);
    }
  });

  it("编译投影证据时最高只能得到实验级", () => {
    const projection = projectSuccessfully(createValidFixture());
    const result = compileExecutorCompatibilityMatrix(
      {
        scope: projection.artifact.scope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: projection.evidence,
      },
      digestAdapter,
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) throw result.error;
    expect(result.value.supportLevel).toBe(ExecutorSupportLevel.Experimental);
    expect(result.value.supportLevel).not.toBe(ExecutorSupportLevel.Compatible);
    expect(result.value.supportLevel).not.toBe(ExecutorSupportLevel.Production);
  });

  it("Artifact 与每条 Evidence 摘要均可复算且相同输入输出确定", () => {
    const fixture = createValidFixture();
    const first = projectSuccessfully(fixture);
    const second = projectSuccessfully(structuredClone(fixture));

    expect(first).toEqual(second);
    expect(first.artifactDigest).toBe(calculateDigest(first.artifact));
    for (const evidence of first.evidence) {
      expect(evidence.evidenceDigest).toBe(
        calculateDigest(createExecutorCapabilityEvidenceDigestInput(evidence)),
      );
    }
  });

  it("关闭式拒绝来源摘要漂移", () => {
    const fixture = createValidFixture();
    fixture.hostResult.prepareManifestDigest = calculateDigest("drifted-prepare-manifest");

    expectProjectionFailure(fixture, "Codex compatibility source digest binding drifted.");
  });

  it("关闭式拒绝已重算摘要但身份字段漂移的 activation binding", () => {
    const fixture = createValidFixture();
    fixture.prepareManifest.activation.binding.candidateHookConfigDigest = calculateDigest(
      "different-candidate-hook-config",
    );
    refreshDependentDigests(fixture);

    expectProjectionFailure(fixture, "Codex compatibility source identity binding drifted.");
  });

  it("关闭式拒绝已重算摘要但命令内容漂移的静态探测", () => {
    const fixture = createValidFixture();
    fixture.prepareManifest.codexProbe.commands[2] = {
      kind: "features_list",
      executable: CODEX_EXECUTABLE,
      args: ["features", "show"],
    };
    refreshDependentDigests(fixture);

    expectProjectionFailure(fixture, "Codex static probe command binding drifted.");
  });

  it("重算摘要后仍以语义校验拒绝 Prepare worktreeRoot 漂移", () => {
    const fixture = createValidFixture();
    fixture.prepareManifest.paths.worktreeRoot = `${ROOT}\\drifted-worktree`;
    refreshDependentDigests(fixture);

    expectProjectionFailure(fixture, "Codex host packet manifest semantic binding drifted.");
  });

  it("重算摘要后仍以路径校验拒绝不完整 UNC 根路径", () => {
    const fixture = createValidFixture();
    fixture.prepareManifest.paths.root = "\\\\root";
    refreshDependentDigests(fixture);

    expectProjectionFailure(fixture, "Codex host packet path is invalid.");
  });

  it("Schema 拒绝 Activation reasoningEffort 升高为 high", () => {
    const fixture = createValidFixture();
    fixture.activationPlan.model.reasoningEffort = "high";

    expectProjectionFailure(fixture, "Codex compatibility source schema is invalid.");
  });

  it("Schema 拒绝伪装成 Windows 绝对路径的 Codex 版本", () => {
    const projection = projectSuccessfully(createValidFixture());
    expect(projection.artifact.scope.executorVersion).not.toMatch(/[\\/:]/u);

    const fixture = createValidFixture();
    const pollutedVersion = `${ROOT}\\codex.exe`;
    fixture.prepareManifest.codexProbe.version = pollutedVersion;
    fixture.prepareManifest.activation.binding.codexVersion = pollutedVersion;
    refreshDependentDigests(fixture);

    expectProjectionFailure(fixture, "Codex compatibility source schema is invalid.");
  });

  it("重算摘要后仍以语义校验拒绝 Hook Binding 的 Task 与 PlanRisk 漂移", () => {
    const fixture = createValidFixture();
    fixture.activationPlan.hookBinding.args[8] = "01KXF44CKMCND3C14F4E7BHSC9";
    fixture.activationPlan.hookBinding.args[10] = "01KXF44E7QE04TX02M0EBRHDK8";
    refreshDependentDigests(fixture);

    expectProjectionFailure(fixture, "Codex host packet activation semantic binding drifted.");
  });

  it.each([
    ["正向", 0],
    ["负向", 1],
  ] as const)("重算摘要后仍以语义校验拒绝%s Prompt 漂移", (_label, scenarioIndex) => {
    const fixture = createValidFixture();
    const scenario = fixture.activationPlan.hostScenarios[scenarioIndex];
    if (scenario === undefined) throw new Error("Host 场景夹具缺失。");
    scenario.prompt = "已篡改的 Host Prompt";
    refreshDependentDigests(fixture);

    expectProjectionFailure(fixture, "Codex host packet activation semantic binding drifted.");
  });

  it.each([
    ["repositoryId", "repositoryId", "unjs-defu-drifted"],
    ["URL", "url", "https://example.com/defu.git"],
    ["revision", "revision", "92632b66f5914e9946edce300e10633a3d5c0cb7"],
    ["packageManager", "packageManager", "npm@11.4.2"],
  ] as const)("重算摘要后仍以语义校验拒绝固定 project %s 漂移", (_label, field, value) => {
    const fixture = createValidFixture();
    fixture.prepareManifest.project[field] = value;
    if (field === "repositoryId") {
      fixture.prepareManifest.activation.binding.repositoryId = value;
    }
    if (field === "revision") {
      fixture.prepareManifest.worktree.headRevision = value;
      fixture.prepareManifest.activation.binding.repositoryRevision = value;
      fixture.prepareManifest.activation.binding.worktreeHeadRevision = value;
    }
    refreshDependentDigests(fixture);

    expectProjectionFailure(fixture, "Codex host packet manifest semantic binding drifted.");
  });

  it("同步交叉字段与 Hook 参数并重算摘要后仍拒绝固定 workspaceId 漂移", () => {
    const fixture = createValidFixture();
    const driftedWorkspaceId = "liushi-public-project-smoke-drifted";
    fixture.prepareManifest.bindingCandidate.workspaceId = driftedWorkspaceId;
    fixture.prepareManifest.activation.binding.workspaceId = driftedWorkspaceId;
    fixture.activationPlan.hookBinding.args[6] = driftedWorkspaceId;
    refreshDependentDigests(fixture);

    expectProjectionFailure(fixture, "Codex host packet manifest semantic binding drifted.");
  });

  it("重算摘要后仍以语义校验拒绝 rollback instruction 漂移", () => {
    const fixture = createValidFixture();
    fixture.activationPlan.rollback.instruction = "已篡改的回滚说明。";
    refreshDependentDigests(fixture);

    expectProjectionFailure(fixture, "Codex host packet activation semantic binding drifted.");
  });

  it.each(["缺失", "顺序变化"] as const)("关闭式拒绝 Host checks %s", (mode) => {
    const fixture = createValidFixture();
    if (mode === "缺失") {
      fixture.hostResult.checks = fixture.hostResult.checks.slice(0, -1);
    } else {
      fixture.hostResult.checks = [...fixture.hostResult.checks].reverse();
    }

    expectProjectionFailure(
      fixture,
      "Codex host result environment, checks, or observation time drifted.",
    );
  });

  it("关闭式拒绝早于 Prepare 生成时间的 Host 验证时间", () => {
    const fixture = createValidFixture();
    fixture.hostResult.verifiedAt = "2026-07-15T07:59:59.999Z";

    expectProjectionFailure(
      fixture,
      "Codex host result environment, checks, or observation time drifted.",
    );
  });

  it("关闭式拒绝与 Prepare Manifest 不一致的验证环境", () => {
    const fixture = createValidFixture();
    fixture.hostResult.verificationEnvironment.platform = "linux";

    expectProjectionFailure(
      fixture,
      "Codex host result environment, checks, or observation time drifted.",
    );
  });

  it.each([
    ["未知平台", "freebsd", "x64", "Codex host path platform is unsupported."],
    ["未知架构", "win32", "s390x", "Codex host platform or architecture is unsupported."],
  ] as const)("关闭式拒绝%s", (_label, platform, architecture, expectedMessage) => {
    const fixture = createValidFixture();
    fixture.prepareManifest.executionEnvironment.platform = platform;
    fixture.prepareManifest.executionEnvironment.architecture = architecture;
    fixture.hostResult.verificationEnvironment.platform = platform;
    fixture.hostResult.verificationEnvironment.architecture = architecture;
    refreshDependentDigests(fixture);

    expectProjectionFailure(fixture, expectedMessage);
  });

  it("关闭式拒绝旧版 v1 Host Result", () => {
    const fixture = createValidFixture();
    fixture.hostResult.schemaVersion = "liushi.codex-host-smoke.result-verification.v1";

    expectProjectionFailure(fixture, "Codex compatibility source schema is invalid.");
  });

  it("关闭式拒绝遗留 productionVerified 字段", () => {
    const fixture = createValidFixture();
    const input: ProjectCodexCompatibilityEvidenceInput = {
      ...fixture,
      hostResult: { ...fixture.hostResult, productionVerified: true },
    };

    expectProjectionFailure(input, "Codex compatibility source schema is invalid.");
  });

  it("ExternalUri 必须精确绑定最终 Artifact 摘要 URN", () => {
    const fixture = createValidFixture();
    const repositoryProjection = projectSuccessfully(fixture);
    const expectedUrn = `urn:liushi:artifact:${repositoryProjection.artifactDigest}`;
    const externalProjection = projectSuccessfully({
      ...fixture,
      artifactLocatorKind: ExecutorEvidenceLocatorKind.ExternalUri,
    });

    expect(externalProjection.artifactDigest).toBe(repositoryProjection.artifactDigest);
    expect(
      externalProjection.evidence.every(
        (item) =>
          item.source.locator.kind === ExecutorEvidenceLocatorKind.ExternalUri &&
          item.source.locator.value === expectedUrn,
      ),
    ).toBe(true);
  });
});

function createValidFixture() {
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

/** 有效来源夹具的静态类型。 */
type ValidFixture = ReturnType<typeof createValidFixture>;

function refreshDependentDigests(fixture: ValidFixture): void {
  const activationPlanDigest = calculateDigest(fixture.activationPlan);
  fixture.prepareManifest.activationPlan.digest = activationPlanDigest;
  fixture.prepareManifest.activation.binding.activationPlanDigest = activationPlanDigest;

  const codexProbeDigest = calculateDigest(fixture.prepareManifest.codexProbe);
  fixture.prepareManifest.activation.binding.codexProbeDigest = codexProbeDigest;

  const activationDigest = calculateDigest(fixture.prepareManifest.activation.binding);
  fixture.prepareManifest.activation.digest = activationDigest;
  const prepareManifestDigest = calculateDigest(fixture.prepareManifest);

  fixture.hostResult.activationPlanDigest = activationPlanDigest;
  fixture.hostResult.codexProbeDigest = codexProbeDigest;
  fixture.hostResult.activationDigest = activationDigest;
  fixture.hostResult.prepareManifestDigest = prepareManifestDigest;
}

function projectSuccessfully(
  input: ProjectCodexCompatibilityEvidenceInput,
): CodexCompatibilityEvidenceProjection {
  const result = projector.project(input);
  expect(result.status).toBe(ResultStatus.Success);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function expectProjectionFailure(
  input: ProjectCodexCompatibilityEvidenceInput,
  expectedMessage: string,
): void {
  const result = projector.project(input);
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Success) {
    throw new Error("预期投影失败，但实际成功。");
  }
  expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
  expect(result.error.message).toBe(expectedMessage);
}

function calculateDigest(input: unknown): ContentDigest {
  const result = digestAdapter.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function collectStringValues(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStringValues(item));
  if (isRecord(value)) {
    return Object.values(value).flatMap((item) => collectStringValues(item));
  }
  return [];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
