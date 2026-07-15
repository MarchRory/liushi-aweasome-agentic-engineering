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
import {
  codexCompatibilitySourceFixtureValues,
  createCodexCompatibilitySourceFixture,
  type CodexCompatibilitySourceFixture,
} from "../support/executorCompatibility/index.js";

const digestAdapter = new Rfc8785Sha256DigestAdapter();
const projector = new CodexCompatibilityEvidenceProjectorAdapter(digestAdapter);
const {
  candidateConfigDigest: CANDIDATE_CONFIG_DIGEST,
  codexExecutable: CODEX_EXECUTABLE,
  generatedAt: GENERATED_AT,
  packageTarballDigest: PACKAGE_TARBALL_DIGEST,
  planRiskArtifactDigest: PLAN_RISK_ARTIFACT_DIGEST,
  privateIdentifiers: PRIVATE_IDENTIFIERS,
  projectRevision: PROJECT_REVISION,
  root: ROOT,
  verifiedAt: VERIFIED_AT,
} = codexCompatibilitySourceFixtureValues;
const createValidFixture = createCodexCompatibilitySourceFixture;
/** 有效来源 Fixture 的静态类型。 */
type ValidFixture = CodexCompatibilitySourceFixture;

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

  it("有效 RuntimeStore Projection 可确定性复验为相同 Evidence", () => {
    const projection = createRuntimeStoreProjection();
    const first = projector.verifyPersistedProjection(projection);
    const second = projector.verifyPersistedProjection(structuredClone(projection));

    expect(first.status).toBe(ResultStatus.Success);
    expect(second.status).toBe(ResultStatus.Success);
    if (first.status === ResultStatus.Failure) throw first.error;
    if (second.status === ResultStatus.Failure) throw second.error;
    const expectedEvidence = [...projection.evidence].sort((left, right) =>
      left.evidenceDigest.localeCompare(right.evidenceDigest),
    );
    expect(first.value.evidence).toEqual(expectedEvidence);
    expect(second.value.evidence).toEqual(first.value.evidence);
    expect(
      first.value.evidence.every(
        (evidence) => evidence.source.locator.kind === ExecutorEvidenceLocatorKind.RuntimeStore,
      ),
    ).toBe(true);
  });

  it("复验拒绝已重算 Evidence 摘要但背离 Artifact checkIds 的 Projection", () => {
    const projection = createRuntimeStoreProjection();
    const original = projection.evidence[0];
    if (original === undefined) throw new Error("测试 Evidence 缺失。");
    const tampered = {
      ...original,
      source: {
        ...original.source,
        checkIds: original.source.checkIds.slice(0, 1),
      },
    };
    const tamperedWithDigest = {
      ...tampered,
      evidenceDigest: calculateDigest(createExecutorCapabilityEvidenceDigestInput(tampered)),
    };

    expect(tamperedWithDigest.evidenceDigest).not.toBe(original.evidenceDigest);
    expect(tamperedWithDigest.evidenceDigest).toBe(
      calculateDigest(createExecutorCapabilityEvidenceDigestInput(tamperedWithDigest)),
    );
    expectPersistedProjectionCorrupt(
      {
        ...projection,
        evidence: [tamperedWithDigest, ...projection.evidence.slice(1)],
      },
      "Codex Compatibility Evidence 与脱敏 Artifact 投影不一致。",
    );
  });

  it("复验将非法 Artifact Schema 归类为 CorruptStore", () => {
    const projection = createRuntimeStoreProjection();

    expectPersistedProjectionCorrupt(
      {
        ...projection,
        artifact: { ...projection.artifact, observations: [] },
      },
      "Codex Compatibility Artifact Schema 无效。",
    );
  });

  it("复验将 Artifact 摘要漂移归类为 CorruptStore", () => {
    const projection = createRuntimeStoreProjection();

    expectPersistedProjectionCorrupt(
      {
        ...projection,
        artifactDigest: calculateDigest({ artifact: "drifted" }),
      },
      "Codex Compatibility Artifact 摘要不匹配。",
    );
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

function createRuntimeStoreProjection(): CodexCompatibilityEvidenceProjection {
  return projectSuccessfully({
    ...createValidFixture(),
    artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
  });
}

function expectPersistedProjectionCorrupt(
  projection: Parameters<typeof projector.verifyPersistedProjection>[0],
  expectedMessage: string,
): void {
  const result = projector.verifyPersistedProjection(projection);
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Success) {
    throw new Error("预期持久化 Projection 复验失败，但实际成功。");
  }
  expect(result.error.code).toBe(HarnessErrorCode.CorruptStore);
  expect(result.error.message).toBe(expectedMessage);
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
