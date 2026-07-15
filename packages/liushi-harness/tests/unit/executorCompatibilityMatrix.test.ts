import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus, type ContentDigest } from "../../src/common/index.js";
import {
  EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
  ExecutorAdapterKind,
  ExecutorArchitecture,
  ExecutorCapability,
  ExecutorCapabilityQualifierKind,
  ExecutorCapabilitySupport,
  ExecutorDistribution,
  ExecutorEvidenceKind,
  ExecutorEvidenceLocatorKind,
  ExecutorEvidenceOutcome,
  ExecutorHostSurface,
  ExecutorOperatingSystem,
  ExecutorPermissionMode,
  ExecutorRequirementStatus,
  ExecutorScopeField,
  ExecutorSupportLevel,
  compileExecutorCompatibilityMatrix,
  createExecutorCapabilityEvidenceDigestInput,
  createExecutorCompatibilityMatrixDigestInput,
  createManagedFileMutationHookPolicy,
  validateExecutorCompatibilityMatrix,
  type ExecutorCapabilityEvidence,
  type ExecutorCapabilityQualifier,
  type ExecutorCompatibilityPolicy,
  type ExecutorHostScope,
} from "../../src/domain/executorCompatibility/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";

const digestAdapter = new Rfc8785Sha256DigestAdapter();
const fileMutationQualifier: ExecutorCapabilityQualifier = {
  kind: ExecutorCapabilityQualifierKind.CanonicalAction,
  value: "file_mutation",
};

describe("Executor Compatibility Matrix", () => {
  it("完整 Production 证据生成 Production Matrix", () => {
    const scope = createScope();
    const matrix = compileSuccessfully(
      scope,
      createTierEvidence(scope, ExecutorSupportLevel.Production),
    );

    expect(matrix.supportLevel).toBe(ExecutorSupportLevel.Production);
    expect(matrix.tiers).toEqual([
      expect.objectContaining({ level: ExecutorSupportLevel.Production, satisfied: true }),
      expect.objectContaining({ level: ExecutorSupportLevel.Compatible, satisfied: true }),
    ]);
    expect(
      matrix.capabilities.every((item) => item.support === ExecutorCapabilitySupport.Verified),
    ).toBe(true);
    expect(matrix.matrixDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("缺少 ProductionE2e 时最多声明 Compatible", () => {
    const scope = createScope();
    const matrix = compileSuccessfully(
      scope,
      createTierEvidence(scope, ExecutorSupportLevel.Compatible),
    );

    expect(matrix.supportLevel).toBe(ExecutorSupportLevel.Compatible);
    expect(matrix.tiers).toEqual([
      expect.objectContaining({ level: ExecutorSupportLevel.Production, satisfied: false }),
      expect.objectContaining({ level: ExecutorSupportLevel.Compatible, satisfied: true }),
    ]);
  });

  it("仅有 Static Probe 时为 Experimental", () => {
    const scope = createScope();
    const matrix = compileSuccessfully(scope, [createEvidence({ scope })]);

    expect(matrix.supportLevel).toBe(ExecutorSupportLevel.Experimental);
    expect(matrix.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: ExecutorCapability.CommandHookHandler,
          support: ExecutorCapabilitySupport.Experimental,
        }),
      ]),
    );
  });

  it("空证据集为 Unverified", () => {
    const matrix = compileSuccessfully(createScope(), []);

    expect(matrix.supportLevel).toBe(ExecutorSupportLevel.Unverified);
    expect(
      matrix.capabilities.every((item) => item.support === ExecutorCapabilitySupport.Unverified),
    ).toBe(true);
  });

  it("任一 Failed 证据将 Matrix 关闭为 Unsupported", () => {
    const scope = createScope();
    const evidence = createTierEvidence(scope, ExecutorSupportLevel.Production);
    const failedEvidence = createEvidence({
      scope,
      capability: ExecutorCapability.PreFileMutation,
      kind: ExecutorEvidenceKind.NegativeTest,
      outcome: ExecutorEvidenceOutcome.Failed,
      sourceKey: "failed-negative-test",
    });
    const matrix = compileSuccessfully(
      scope,
      evidence.map((item) =>
        item.capability === failedEvidence.capability && item.kind === failedEvidence.kind
          ? failedEvidence
          : item,
      ),
    );

    expect(matrix.supportLevel).toBe(ExecutorSupportLevel.Unsupported);
    const capability = matrix.capabilities.find(
      (item) => item.capability === ExecutorCapability.PreFileMutation,
    );
    expect(capability?.support).toBe(ExecutorCapabilitySupport.Unsupported);
    expect(
      capability?.requirements.find((item) => item.level === ExecutorSupportLevel.Compatible)
        ?.status,
    ).toBe(ExecutorRequirementStatus.Failed);
  });

  it("同类 Passed 与 Failed 证据形成 Conflicting 并关闭为 Unverified", () => {
    const scope = createScope();
    const passedEvidence = createEvidence({
      scope,
      capability: ExecutorCapability.PreFileMutation,
      kind: ExecutorEvidenceKind.ContractTest,
      outcome: ExecutorEvidenceOutcome.Passed,
      sourceKey: "contract-passed",
    });
    const failedEvidence = createEvidence({
      scope,
      capability: ExecutorCapability.PreFileMutation,
      kind: ExecutorEvidenceKind.ContractTest,
      outcome: ExecutorEvidenceOutcome.Failed,
      sourceKey: "contract-failed",
    });
    const matrix = compileSuccessfully(scope, [passedEvidence, failedEvidence]);
    const capability = matrix.capabilities.find(
      (item) => item.capability === ExecutorCapability.PreFileMutation,
    );
    const compatibleRequirement = capability?.requirements.find(
      (item) => item.level === ExecutorSupportLevel.Compatible,
    );
    const contractAssessment = compatibleRequirement?.evidenceKinds.find(
      (item) => item.kind === ExecutorEvidenceKind.ContractTest,
    );

    expect(contractAssessment?.status).toBe(ExecutorRequirementStatus.Conflicting);
    expect(compatibleRequirement?.status).toBe(ExecutorRequirementStatus.Conflicting);
    expect.soft(capability?.support).toBe(ExecutorCapabilitySupport.Unverified);
    expect.soft(matrix.supportLevel).toBe(ExecutorSupportLevel.Unverified);
  });

  it("同类 Passed 与 Inconclusive 证据形成 Conflicting 且不得声明 Production", () => {
    const scope = createScope();
    const evidence = createTierEvidence(scope, ExecutorSupportLevel.Production);
    const inconclusiveEvidence = createEvidence({
      scope,
      capability: ExecutorCapability.PreFileMutation,
      kind: ExecutorEvidenceKind.ContractTest,
      outcome: ExecutorEvidenceOutcome.Inconclusive,
      sourceKey: "contract-inconclusive",
    });
    const matrix = compileSuccessfully(scope, [...evidence, inconclusiveEvidence]);
    const capability = matrix.capabilities.find(
      (item) => item.capability === ExecutorCapability.PreFileMutation,
    );
    const compatibleRequirement = capability?.requirements.find(
      (item) => item.level === ExecutorSupportLevel.Compatible,
    );
    const contractAssessment = compatibleRequirement?.evidenceKinds.find(
      (item) => item.kind === ExecutorEvidenceKind.ContractTest,
    );

    expect(contractAssessment?.status).toBe(ExecutorRequirementStatus.Conflicting);
    expect(compatibleRequirement?.status).toBe(ExecutorRequirementStatus.Conflicting);
    expect.soft(capability?.support).toBe(ExecutorCapabilitySupport.Unverified);
    expect.soft(matrix.supportLevel).toBe(ExecutorSupportLevel.Unverified);
    expect.soft(matrix.supportLevel).not.toBe(ExecutorSupportLevel.Production);
  });

  it("仅有 Inconclusive 证据时保持 Missing 与 Unverified", () => {
    const scope = createScope();
    const matrix = compileSuccessfully(scope, [
      createEvidence({
        scope,
        capability: ExecutorCapability.PreFileMutation,
        kind: ExecutorEvidenceKind.ContractTest,
        outcome: ExecutorEvidenceOutcome.Inconclusive,
        sourceKey: "only-contract-inconclusive",
      }),
    ]);
    const capability = matrix.capabilities.find(
      (item) => item.capability === ExecutorCapability.PreFileMutation,
    );
    const compatibleRequirement = capability?.requirements.find(
      (item) => item.level === ExecutorSupportLevel.Compatible,
    );
    const contractAssessment = compatibleRequirement?.evidenceKinds.find(
      (item) => item.kind === ExecutorEvidenceKind.ContractTest,
    );

    expect(contractAssessment?.status).toBe(ExecutorRequirementStatus.Missing);
    expect(compatibleRequirement?.status).toBe(ExecutorRequirementStatus.Missing);
    expect.soft(capability?.support).toBe(ExecutorCapabilitySupport.Unverified);
    expect.soft(matrix.supportLevel).toBe(ExecutorSupportLevel.Unverified);
  });

  it.each([
    ["Executor Version", (scope: ExecutorHostScope) => ({ ...scope, executorVersion: "2.0.0" })],
    [
      "Operating System",
      (scope: ExecutorHostScope) => ({
        ...scope,
        operatingSystem: ExecutorOperatingSystem.Linux,
      }),
    ],
    [
      "Host Surface",
      (scope: ExecutorHostScope) => ({ ...scope, surface: ExecutorHostSurface.Desktop }),
    ],
    [
      "Architecture",
      (scope: ExecutorHostScope) => ({ ...scope, architecture: ExecutorArchitecture.Arm64 }),
    ],
    [
      "Distribution",
      (scope: ExecutorHostScope) => ({ ...scope, distribution: ExecutorDistribution.ClaudeCode }),
    ],
    [
      "Adapter Digest",
      (scope: ExecutorHostScope) => ({
        ...scope,
        adapterDigest: calculateDigest("other-adapter"),
      }),
    ],
    [
      "Configuration Digest",
      (scope: ExecutorHostScope) => ({
        ...scope,
        configurationDigest: calculateDigest("other-configuration"),
      }),
    ],
    ["Model", (scope: ExecutorHostScope) => ({ ...scope, modelId: "other-model" })],
    [
      "Permission",
      (scope: ExecutorHostScope) => ({
        ...scope,
        permissionMode: ExecutorPermissionMode.ReadOnly,
      }),
    ],
  ] as const)("拒绝跨 %s 的证据传播", (_name, mutateScope) => {
    const scope = createScope();
    const result = compileExecutorCompatibilityMatrix(
      {
        scope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: [createEvidence({ scope: mutateScope(scope) })],
      },
      digestAdapter,
    );

    expectInvalid(result, "Executor capability evidence scope does not match the target scope.");
  });

  it("CatPaw 不能伪装 Claude Code Distribution 或 Codex Adapter", () => {
    const catPawScope = createScope({
      adapterKind: ExecutorAdapterKind.ClaudeCompatible,
      distribution: ExecutorDistribution.CatPaw,
    });
    expect(compileSuccessfully(catPawScope, []).supportLevel).toBe(ExecutorSupportLevel.Unverified);

    const claudeCodeEvidence = createEvidence({
      scope: { ...catPawScope, distribution: ExecutorDistribution.ClaudeCode },
    });
    const distributionResult = compileExecutorCompatibilityMatrix(
      {
        scope: catPawScope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: [claudeCodeEvidence],
      },
      digestAdapter,
    );
    expectInvalid(
      distributionResult,
      "Executor capability evidence scope does not match the target scope.",
    );

    const adapterResult = compileExecutorCompatibilityMatrix(
      {
        scope: createScope({
          adapterKind: ExecutorAdapterKind.Codex,
          distribution: ExecutorDistribution.CatPaw,
        }),
        policy: createManagedFileMutationHookPolicy(),
        evidence: [],
      },
      digestAdapter,
    );
    expectInvalid(adapterResult, "Executor adapter kind and distribution are incompatible.");
  });

  it.each([
    [
      "modelId",
      createScopeWithoutModelId(),
      ExecutorScopeField.ModelId,
      ExecutorSupportLevel.Compatible,
    ],
    [
      "permissionMode",
      createScopeWithoutPermissionMode(),
      ExecutorScopeField.PermissionMode,
      ExecutorSupportLevel.Compatible,
    ],
    [
      "configurationDigest",
      createScopeWithoutConfigurationDigest(),
      ExecutorScopeField.ConfigurationDigest,
      ExecutorSupportLevel.Experimental,
    ],
  ] as const)("缺少 %s 时不得声明 Production", (_name, scope, missingField, supportLevel) => {
    const matrix = compileSuccessfully(
      scope,
      createTierEvidence(scope, ExecutorSupportLevel.Production),
    );

    expect(matrix.supportLevel).toBe(supportLevel);
    expect(matrix.supportLevel).not.toBe(ExecutorSupportLevel.Production);
    const production = matrix.tiers.find((item) => item.level === ExecutorSupportLevel.Production);
    expect(production?.satisfied).toBe(false);
    expect(production?.missingScopeFields).toContain(missingField);
  });

  it("关闭式拒绝不匹配与重复的 Evidence Qualifier", () => {
    const scope = createScope();
    const mismatchedResult = compileExecutorCompatibilityMatrix(
      {
        scope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: [
          createEvidence({
            scope,
            qualifiers: [
              {
                kind: ExecutorCapabilityQualifierKind.CanonicalAction,
                value: "command_execution",
              },
            ],
          }),
        ],
      },
      digestAdapter,
    );
    expectInvalid(
      mismatchedResult,
      "Executor capability evidence is outside the selected capability profile.",
    );

    const duplicateResult = compileExecutorCompatibilityMatrix(
      {
        scope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: [
          createEvidence({
            scope,
            qualifiers: [fileMutationQualifier, fileMutationQualifier],
          }),
        ],
      },
      digestAdapter,
    );
    expectInvalid(duplicateResult, "Executor capability evidence contains duplicate qualifiers.");
  });

  it("关闭式拒绝 Profile 未声明的 Evidence Kind", () => {
    const scope = createScope();
    const result = compileExecutorCompatibilityMatrix(
      {
        scope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: [
          createEvidence({
            scope,
            capability: ExecutorCapability.NativeHookInput,
            kind: ExecutorEvidenceKind.StaticProbe,
          }),
        ],
      },
      digestAdapter,
    );

    expectInvalid(
      result,
      "Executor capability evidence is outside the selected capability profile.",
    );
  });

  it("关闭式拒绝重复 Source Record", () => {
    const scope = createScope();
    const evidence = createEvidence({ scope });
    const result = compileExecutorCompatibilityMatrix(
      {
        scope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: [evidence, evidence],
      },
      digestAdapter,
    );

    expectInvalid(result, "Executor capability evidence contains a duplicate source record.");
  });

  it("关闭式拒绝 Policy 中重复的 Requirement Qualifier", () => {
    const policy = createManagedFileMutationHookPolicy();
    const result = compileExecutorCompatibilityMatrix(
      {
        scope: createScope(),
        policy: {
          ...policy,
          tiers: policy.tiers.map((tier) => ({
            ...tier,
            requirements: tier.requirements.map((requirement, index) =>
              index === 0
                ? {
                    ...requirement,
                    qualifiers: [fileMutationQualifier, fileMutationQualifier],
                  }
                : requirement,
            ),
          })),
        },
        evidence: [],
      },
      digestAdapter,
    );

    expectInvalid(result, "Executor compatibility requirement contains duplicate qualifiers.");
  });

  it.each([
    [
      "缺少 Compatible Tier",
      (): ExecutorCompatibilityPolicy => {
        const policy = createManagedFileMutationHookPolicy();
        return {
          ...policy,
          tiers: policy.tiers.filter((tier) => tier.level === ExecutorSupportLevel.Production),
        };
      },
      "Executor compatibility policy must define production and compatible tiers.",
    ],
    [
      "Scope Requirement 非单调",
      (): ExecutorCompatibilityPolicy => {
        const policy = createManagedFileMutationHookPolicy();
        return {
          ...policy,
          tiers: policy.tiers.map((tier) => ({
            ...tier,
            scopeRequirements: {
              ...tier.scopeRequirements,
              modelId: tier.level === ExecutorSupportLevel.Compatible,
            },
          })),
        };
      },
      "Production scope requirements must include compatible scope requirements.",
    ],
    [
      "Production 缺少 Compatible Requirement",
      (): ExecutorCompatibilityPolicy => {
        const policy = createManagedFileMutationHookPolicy();
        return {
          ...policy,
          tiers: policy.tiers.map((tier) => ({
            ...tier,
            requirements:
              tier.level === ExecutorSupportLevel.Production
                ? tier.requirements.slice(1)
                : tier.requirements,
          })),
        };
      },
      "Production capability requirements must include compatible requirements.",
    ],
    [
      "Production 缺少 Compatible Evidence Kind",
      (): ExecutorCompatibilityPolicy => {
        const policy = createManagedFileMutationHookPolicy();
        return {
          ...policy,
          tiers: policy.tiers.map((tier) => ({
            ...tier,
            requirements: tier.requirements.map((requirement, index) =>
              tier.level === ExecutorSupportLevel.Production && index === 0
                ? {
                    ...requirement,
                    evidenceKinds: requirement.evidenceKinds.filter(
                      (kind) => kind !== ExecutorEvidenceKind.ContractTest,
                    ),
                  }
                : requirement,
            ),
          })),
        };
      },
      "Production evidence requirements must include compatible evidence requirements.",
    ],
    [
      "Production 与 Compatible Policy 完全相同",
      (): ExecutorCompatibilityPolicy => {
        const policy = createManagedFileMutationHookPolicy();
        const compatible = policy.tiers.find(
          (tier) => tier.level === ExecutorSupportLevel.Compatible,
        );
        if (compatible === undefined) throw new Error("缺少 Compatible Policy Tier");
        return {
          ...policy,
          tiers: policy.tiers.map((tier) =>
            tier.level === ExecutorSupportLevel.Production
              ? { ...compatible, level: ExecutorSupportLevel.Production }
              : tier,
          ),
        };
      },
      undefined,
    ],
  ] as const)("关闭式拒绝非法 Policy：%s", (_name, createPolicy, message) => {
    const result = compileExecutorCompatibilityMatrix(
      { scope: createScope(), policy: createPolicy(), evidence: [] },
      digestAdapter,
    );

    if (message === undefined) {
      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.InvalidInput },
      });
    } else {
      expectInvalid(result, message);
    }
  });

  it("证据顺序变化时 Matrix 与 Digest 完全相同", () => {
    const scope = createScope();
    const evidence = createTierEvidence(scope, ExecutorSupportLevel.Production);
    const first = compileSuccessfully(scope, evidence);
    const second = compileSuccessfully(scope, [...evidence].reverse());

    expect(second).toEqual(first);
    expect(second.matrixDigest).toBe(first.matrixDigest);
  });

  it("Policy Tier 顺序变化时 Matrix 与 Digest 完全相同", () => {
    const scope = createScope();
    const evidence = createTierEvidence(scope, ExecutorSupportLevel.Production);
    const policy = createManagedFileMutationHookPolicy();
    const first = compileSuccessfully(scope, evidence);
    const result = compileExecutorCompatibilityMatrix(
      { scope, policy: { ...policy, tiers: [...policy.tiers].reverse() }, evidence },
      digestAdapter,
    );
    if (result.status === ResultStatus.Failure) throw result.error;

    expect(result.value).toEqual(first);
    expect(result.value.matrixDigest).toBe(first.matrixDigest);
  });

  it("observedAt 不触发自动失效但仍绑定 Evidence 身份", () => {
    const scope = createScope();
    const historical = compileSuccessfully(
      scope,
      createTierEvidence(scope, ExecutorSupportLevel.Production, "2000-01-01T00:00:00.000Z"),
    );
    const future = compileSuccessfully(
      scope,
      createTierEvidence(scope, ExecutorSupportLevel.Production, "2126-01-01T00:00:00.000Z"),
    );

    expect(historical.supportLevel).toBe(ExecutorSupportLevel.Production);
    expect(future.supportLevel).toBe(ExecutorSupportLevel.Production);
    expect(future.matrixDigest).not.toBe(historical.matrixDigest);
  });

  it("拒绝归一化 Evidence 元数据漂移", () => {
    const scope = createScope();
    const evidence = createEvidence({ scope });
    const result = compileExecutorCompatibilityMatrix(
      {
        scope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: [{ ...evidence, outcome: ExecutorEvidenceOutcome.Failed }],
      },
      digestAdapter,
    );

    expectInvalid(result, "Executor capability evidence digest drifted.");
  });

  it.each([
    [ExecutorEvidenceLocatorKind.RepositoryPath, "../evidence.json"],
    [ExecutorEvidenceLocatorKind.RepositoryPath, "C:/evidence.json"],
    [ExecutorEvidenceLocatorKind.RepositoryPath, "evidence\\report.json"],
    [ExecutorEvidenceLocatorKind.ExternalUri, "https://example.com/evidence.json?token=secret"],
    [ExecutorEvidenceLocatorKind.ExternalUri, "https://example.com/evidence.json"],
    [ExecutorEvidenceLocatorKind.ExternalUri, `urn:liushi:artifact:sha256:${"a".repeat(63)}`],
    [ExecutorEvidenceLocatorKind.ExternalUri, `urn:liushi:artifact:sha256:${"A".repeat(64)}`],
    [ExecutorEvidenceLocatorKind.ExternalUri, `urn:other:artifact:sha256:${"a".repeat(64)}`],
  ] as const)("拒绝不安全 Evidence Locator：%s %s", (kind, value) => {
    const scope = createScope();
    const result = compileExecutorCompatibilityMatrix(
      {
        scope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: [withEvidenceLocator(createEvidence({ scope }), kind, value)],
      },
      digestAdapter,
    );

    expectInvalid(result, "Executor capability evidence locator is unsafe.");
  });

  it("ExternalUri 接受从 source.artifactDigest 派生的 opaque artifact ID", () => {
    const scope = createScope();
    const evidence = createEvidence({ scope });
    const result = compileExecutorCompatibilityMatrix(
      {
        scope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: [
          withEvidenceLocator(
            evidence,
            ExecutorEvidenceLocatorKind.ExternalUri,
            `urn:liushi:artifact:${evidence.source.artifactDigest}`,
          ),
        ],
      },
      digestAdapter,
    );

    expect(result.status).toBe(ResultStatus.Success);
  });

  it("ExternalUri 拒绝格式合法但未绑定 source.artifactDigest 的 opaque artifact ID", () => {
    const scope = createScope();
    const evidence = createEvidence({ scope });
    const mismatchedArtifactDigest = calculateDigest("different-external-artifact");
    expect(mismatchedArtifactDigest).not.toBe(evidence.source.artifactDigest);

    const result = compileExecutorCompatibilityMatrix(
      {
        scope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: [
          withEvidenceLocator(
            evidence,
            ExecutorEvidenceLocatorKind.ExternalUri,
            `urn:liushi:artifact:${mismatchedArtifactDigest}`,
          ),
        ],
      },
      digestAdapter,
    );

    expectInvalid(result, "Executor capability evidence locator is unsafe.");
  });

  it("Matrix 完整性校验拒绝清空全部 Evidence Digests 的自洽 Production 伪造", () => {
    const scope = createScope();
    const trustedEvidence = createTierEvidence(scope, ExecutorSupportLevel.Production);
    const matrix = compileSuccessfully(scope, trustedEvidence);
    const policy = createManagedFileMutationHookPolicy();
    expect(
      validateExecutorCompatibilityMatrix(matrix, policy, trustedEvidence, digestAdapter).status,
    ).toBe(ResultStatus.Success);

    const forgedContent = createExecutorCompatibilityMatrixDigestInput({
      ...matrix,
      evidenceDigests: [],
      capabilities: matrix.capabilities.map((capability) => ({
        ...capability,
        evidenceDigests: [],
        requirements: capability.requirements.map((requirement) => ({
          ...requirement,
          evidenceKinds: requirement.evidenceKinds.map((assessment) => ({
            ...assessment,
            evidenceDigests: [],
          })),
        })),
      })),
    });
    const forgedMatrix = {
      ...forgedContent,
      matrixDigest: calculateDigest(forgedContent),
    };

    expect(forgedMatrix.evidenceDigests).toEqual([]);
    expect(
      forgedMatrix.capabilities.every(
        (capability) =>
          capability.evidenceDigests.length === 0 &&
          capability.requirements.every((requirement) =>
            requirement.evidenceKinds.every(
              (assessment) => assessment.evidenceDigests.length === 0,
            ),
          ),
      ),
    ).toBe(true);
    expect.soft(forgedMatrix.supportLevel).toBe(ExecutorSupportLevel.Production);
    expect
      .soft(forgedMatrix.tiers.find((tier) => tier.level === ExecutorSupportLevel.Production))
      .toEqual(expect.objectContaining({ satisfied: true }));
    expect
      .soft(
        forgedMatrix.capabilities.every(
          (capability) =>
            capability.support === ExecutorCapabilitySupport.Verified &&
            capability.requirements.every(
              (requirement) => requirement.status === ExecutorRequirementStatus.Satisfied,
            ),
        ),
      )
      .toBe(true);
    expect.soft(forgedMatrix.matrixDigest).not.toBe(matrix.matrixDigest);
    expect
      .soft(forgedMatrix.matrixDigest)
      .toBe(calculateDigest(createExecutorCompatibilityMatrixDigestInput(forgedMatrix)));
    expect(
      validateExecutorCompatibilityMatrix(forgedMatrix, policy, [], digestAdapter),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
  });

  it("Matrix 完整性校验拒绝摘要漂移", () => {
    const scope = createScope();
    const trustedEvidence = createTierEvidence(scope, ExecutorSupportLevel.Production);
    const matrix = compileSuccessfully(scope, trustedEvidence);
    const policy = createManagedFileMutationHookPolicy();
    expect(
      validateExecutorCompatibilityMatrix(matrix, policy, trustedEvidence, digestAdapter).status,
    ).toBe(ResultStatus.Success);

    const tampered = validateExecutorCompatibilityMatrix(
      { ...matrix, supportLevel: ExecutorSupportLevel.Experimental },
      policy,
      trustedEvidence,
      digestAdapter,
    );
    expect(tampered).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.InvalidInput,
        message: "Executor compatibility matrix digest drifted.",
      },
    });
  });
});

/** 证据夹具允许覆盖的字段。 */
interface EvidenceOverrides {
  readonly scope?: ExecutorHostScope;
  readonly capability?: ExecutorCapability;
  readonly kind?: ExecutorEvidenceKind;
  readonly outcome?: ExecutorEvidenceOutcome;
  readonly qualifiers?: readonly ExecutorCapabilityQualifier[];
  readonly observedAt?: string;
  readonly sourceKey?: string;
}

function createScope(overrides: Partial<ExecutorHostScope> = {}): ExecutorHostScope {
  return {
    adapterKind: ExecutorAdapterKind.Codex,
    distribution: ExecutorDistribution.CodexCli,
    adapterDigest: calculateDigest("codex-adapter"),
    executorVersion: "1.0.0",
    surface: ExecutorHostSurface.NonInteractiveCli,
    operatingSystem: ExecutorOperatingSystem.Windows,
    architecture: ExecutorArchitecture.X64,
    modelId: "fixture-model",
    permissionMode: ExecutorPermissionMode.WorkspaceWrite,
    configurationDigest: calculateDigest("executor-configuration"),
    ...overrides,
  };
}

function createScopeWithoutModelId(): ExecutorHostScope {
  const scope = { ...createScope() };
  delete scope.modelId;
  return scope;
}

function createScopeWithoutPermissionMode(): ExecutorHostScope {
  const scope = { ...createScope() };
  delete scope.permissionMode;
  return scope;
}

function createScopeWithoutConfigurationDigest(): ExecutorHostScope {
  const scope = { ...createScope() };
  delete scope.configurationDigest;
  return scope;
}

function createEvidence(overrides: EvidenceOverrides = {}): ExecutorCapabilityEvidence {
  const capability = overrides.capability ?? ExecutorCapability.CommandHookHandler;
  const kind = overrides.kind ?? ExecutorEvidenceKind.StaticProbe;
  const outcome = overrides.outcome ?? ExecutorEvidenceOutcome.Passed;
  const sourceKey = overrides.sourceKey ?? `${capability}:${kind}:${outcome}`;
  const evidence: Omit<ExecutorCapabilityEvidence, "evidenceDigest"> = {
    schemaVersion: EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
    scope: overrides.scope ?? createScope(),
    capability,
    kind,
    outcome,
    qualifiers: overrides.qualifiers ?? [fileMutationQualifier],
    source: {
      artifactDigest: calculateDigest({ sourceKey }),
      locator: {
        kind: ExecutorEvidenceLocatorKind.RepositoryPath,
        value: "evidence/executor-compatibility.json",
      },
      schemaVersion: "1.0.0",
      checkIds: [`${capability}.${kind}`],
      observedAt: overrides.observedAt ?? "2026-07-15T00:00:00.000Z",
    },
  };
  return {
    ...evidence,
    evidenceDigest: calculateDigest(createExecutorCapabilityEvidenceDigestInput(evidence)),
  };
}

function withEvidenceLocator(
  evidence: ExecutorCapabilityEvidence,
  kind: ExecutorEvidenceLocatorKind,
  value: string,
): ExecutorCapabilityEvidence {
  const source = { ...evidence.source, locator: { kind, value } };
  const evidenceWithoutDigest = { ...evidence, source };
  return {
    ...evidenceWithoutDigest,
    evidenceDigest: calculateDigest(
      createExecutorCapabilityEvidenceDigestInput(evidenceWithoutDigest),
    ),
  };
}

function createTierEvidence(
  scope: ExecutorHostScope,
  level: ExecutorSupportLevel.Production | ExecutorSupportLevel.Compatible,
  observedAt?: string,
): readonly ExecutorCapabilityEvidence[] {
  const tier = createManagedFileMutationHookPolicy().tiers.find((item) => item.level === level);
  if (tier === undefined) throw new Error(`缺少 ${level} Policy Tier`);
  return tier.requirements.flatMap((requirement) =>
    requirement.evidenceKinds.map((kind) =>
      createEvidence({
        scope,
        capability: requirement.capability,
        kind,
        qualifiers: requirement.qualifiers,
        ...(observedAt === undefined ? {} : { observedAt }),
      }),
    ),
  );
}

function compileSuccessfully(
  scope: ExecutorHostScope,
  evidence: readonly ExecutorCapabilityEvidence[],
) {
  const result = compileExecutorCompatibilityMatrix(
    { scope, policy: createManagedFileMutationHookPolicy(), evidence },
    digestAdapter,
  );
  if (result.status === ResultStatus.Failure) throw result.error;
  expect(result.status).toBe(ResultStatus.Success);
  return result.value;
}

function expectInvalid(
  result: ReturnType<typeof compileExecutorCompatibilityMatrix>,
  message: string,
): void {
  expect(result).toMatchObject({
    status: ResultStatus.Failure,
    error: { code: HarnessErrorCode.InvalidInput, message },
  });
}

function calculateDigest(input: unknown): ContentDigest {
  const result = digestAdapter.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
