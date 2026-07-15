import type { ContentDigest, HarnessError, Result } from "#common/index.js";

import type {
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
} from "../enums/index.js";

/** 一项支持声明不能跨越的精确执行器 Host Scope。 */
export interface ExecutorHostScope {
  /** Harness 使用的 Adapter 协议。 */
  readonly adapterKind: ExecutorAdapterKind;
  /** 实际接受验证的产品发行版。 */
  readonly distribution: ExecutorDistribution;
  /** 当前 Adapter 实现或 npm Tarball 的内容摘要。 */
  readonly adapterDigest: ContentDigest;
  /** 实际执行器返回的精确版本。 */
  readonly executorVersion: string;
  /** 动态调用所在 Host Surface。 */
  readonly surface: ExecutorHostSurface;
  /** Host 操作系统。 */
  readonly operatingSystem: ExecutorOperatingSystem;
  /** Host 处理器架构。 */
  readonly architecture: ExecutorArchitecture;
  /** 动态调用使用的模型标识。 */
  readonly modelId?: string;
  /** Harness 归一化后的权限范围。 */
  readonly permissionMode?: ExecutorPermissionMode;
  /** 平台配置投影的内容摘要。 */
  readonly configurationDigest?: ContentDigest;
}

/** 限定一份证据或 Policy Requirement 的能力覆盖范围。 */
export interface ExecutorCapabilityQualifier {
  /** 限定维度。 */
  readonly kind: ExecutorCapabilityQualifierKind;
  /** 经过安全字符校验的维度值。 */
  readonly value: string;
}

/** 原始能力证据的可复核 Locator。 */
export interface ExecutorEvidenceLocator {
  /** Locator 所属存储边界。 */
  readonly kind: ExecutorEvidenceLocatorKind;
  /** 不包含 Secret 的稳定相对路径或内容寻址 Artifact URN。 */
  readonly value: string;
}

/** 生成能力证据的不可变来源。 */
export interface ExecutorEvidenceSource {
  /** 原始 Probe、测试报告或 Host 结果的内容摘要。 */
  readonly artifactDigest: ContentDigest;
  /** Human 或验证器可以重新读取原始 Artifact 的位置。 */
  readonly locator: ExecutorEvidenceLocator;
  /** 原始来源的 Schema 版本。 */
  readonly schemaVersion: string;
  /** 实际用于形成结论的检查项。 */
  readonly checkIds: readonly string[];
  /** 证据产生时间，只用于审计，不参与失效计算。 */
  readonly observedAt: string;
}

/** 一份已经由平台投影器归一化的能力证据。 */
export interface ExecutorCapabilityEvidence {
  /** 能力证据契约版本。 */
  readonly schemaVersion: string;
  /** 证据严格绑定的 Host Scope。 */
  readonly scope: ExecutorHostScope;
  /** 证据所覆盖的规范能力。 */
  readonly capability: ExecutorCapability;
  /** 证据等级。 */
  readonly kind: ExecutorEvidenceKind;
  /** 证据结果。 */
  readonly outcome: ExecutorEvidenceOutcome;
  /** 限制能力覆盖范围的限定符。 */
  readonly qualifiers: readonly ExecutorCapabilityQualifier[];
  /** 原始、可复核的证据来源。 */
  readonly source: ExecutorEvidenceSource;
  /** 排除自身后对完整归一化 Evidence 计算的摘要。 */
  readonly evidenceDigest: ContentDigest;
}

/** 一个支持等级对单项能力提出的证据要求。 */
export interface ExecutorCapabilityRequirement {
  /** 被要求的规范能力。 */
  readonly capability: ExecutorCapability;
  /** 证据必须覆盖的限定符。 */
  readonly qualifiers: readonly ExecutorCapabilityQualifier[];
  /** 必须分别存在通过记录的证据等级。 */
  readonly evidenceKinds: readonly ExecutorEvidenceKind[];
}

/** 一个支持等级对 Host Scope 完整性的要求。 */
export interface ExecutorTierScopeRequirements {
  /** 是否必须绑定模型标识。 */
  readonly modelId: boolean;
  /** 是否必须绑定权限范围。 */
  readonly permissionMode: boolean;
  /** 是否必须绑定平台配置摘要。 */
  readonly configurationDigest: boolean;
}

/** 一个可声明支持等级的完整 Policy。 */
export interface ExecutorSupportTierPolicy {
  /** 当前 Tier 形成的支持声明。 */
  readonly level: ExecutorSupportLevel;
  /** Host Scope 必须具备的字段。 */
  readonly scopeRequirements: ExecutorTierScopeRequirements;
  /** 该 Tier 的全部能力证据要求。 */
  readonly requirements: readonly ExecutorCapabilityRequirement[];
}

/** 由源码管理并通过摘要绑定的执行器支持 Policy。 */
export interface ExecutorCompatibilityPolicy {
  /** Policy 契约版本。 */
  readonly schemaVersion: string;
  /** Policy 稳定标识。 */
  readonly policyId: string;
  /** 被评估的能力 Profile。 */
  readonly profileId: string;
  /** 由编译器按固定优先级评估的支持等级集合。 */
  readonly tiers: readonly ExecutorSupportTierPolicy[];
}

/** 一个证据等级在 Requirement 中的具体评估。 */
export interface ExecutorEvidenceKindAssessment {
  /** 被要求的证据等级。 */
  readonly kind: ExecutorEvidenceKind;
  /** 当前证据集合得出的状态。 */
  readonly status: ExecutorRequirementStatus;
  /** 支撑该状态的来源摘要。 */
  readonly evidenceDigests: readonly ContentDigest[];
}

/** 单条能力 Requirement 的确定性评估。 */
export interface ExecutorRequirementAssessment {
  /** Requirement 所属的支持等级。 */
  readonly level: ExecutorSupportLevel;
  /** 被评估的能力。 */
  readonly capability: ExecutorCapability;
  /** Requirement 的限定符。 */
  readonly qualifiers: readonly ExecutorCapabilityQualifier[];
  /** Requirement 的总体状态。 */
  readonly status: ExecutorRequirementStatus;
  /** 每个证据等级的细分状态。 */
  readonly evidenceKinds: readonly ExecutorEvidenceKindAssessment[];
}

/** Matrix 中一项规范能力的支持结论。 */
export interface ExecutorCapabilityAssessment {
  /** 被评估的能力。 */
  readonly capability: ExecutorCapability;
  /** 结论对应的能力限定符。 */
  readonly qualifiers: readonly ExecutorCapabilityQualifier[];
  /** 单项能力支持状态。 */
  readonly support: ExecutorCapabilitySupport;
  /** 各声明 Tier 的 Requirement 结果。 */
  readonly requirements: readonly ExecutorRequirementAssessment[];
  /** 参与结论的全部来源摘要。 */
  readonly evidenceDigests: readonly ContentDigest[];
}

/** 一个支持 Tier 的 Scope 与 Requirement 汇总结论。 */
export interface ExecutorSupportTierAssessment {
  /** 被评估的支持等级。 */
  readonly level: ExecutorSupportLevel;
  /** Tier 是否满足全部 Scope 和能力要求。 */
  readonly satisfied: boolean;
  /** 目标 Scope 缺失的必要字段。 */
  readonly missingScopeFields: readonly ExecutorScopeField[];
  /** 未满足的 Requirement 稳定身份。 */
  readonly unsatisfiedRequirementIds: readonly string[];
}

/** 精确 Host Scope 的可发布执行器兼容性矩阵。 */
export interface ExecutorCompatibilityMatrix {
  /** Matrix 契约版本。 */
  readonly schemaVersion: string;
  /** 被评估的能力 Profile。 */
  readonly profileId: string;
  /** 不能向其他版本或平台传播的精确 Host Scope。 */
  readonly scope: ExecutorHostScope;
  /** Policy 的确定性摘要。 */
  readonly policyDigest: ContentDigest;
  /** 当前证据最多允许声明的支持等级。 */
  readonly supportLevel: ExecutorSupportLevel;
  /** 每个可声明 Tier 的汇总结论。 */
  readonly tiers: readonly ExecutorSupportTierAssessment[];
  /** 每项规范能力的细分结论。 */
  readonly capabilities: readonly ExecutorCapabilityAssessment[];
  /** Matrix 使用的全部证据来源摘要。 */
  readonly evidenceDigests: readonly ContentDigest[];
  /** 排除自身后计算的 Matrix 摘要。 */
  readonly matrixDigest: ContentDigest;
}

/** 执行器兼容性编译所需的摘要端口。 */
export interface ExecutorCompatibilityDigestPort {
  /** 对 JSON 兼容输入计算 RFC 8785 SHA-256 摘要。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}

/** Executor Compatibility Matrix 编译输入。 */
export interface CompileExecutorCompatibilityMatrixInput {
  /** 目标精确 Host Scope。 */
  readonly scope: ExecutorHostScope;
  /** 由源码管理的支持 Policy。 */
  readonly policy: ExecutorCompatibilityPolicy;
  /** 已经由平台 Adapter 归一化的证据集合。 */
  readonly evidence: readonly ExecutorCapabilityEvidence[];
}
