import {
  EXECUTOR_COMPATIBILITY_POLICY_SCHEMA_VERSION,
  MANAGED_FILE_MUTATION_HOOK_PROFILE_ID,
} from "../constants/index.js";
import type {
  ExecutorCapabilityQualifier,
  ExecutorCapabilityRequirement,
  ExecutorCompatibilityPolicy,
} from "../contracts/index.js";
import {
  ExecutorCapability,
  ExecutorCapabilityQualifierKind,
  ExecutorEvidenceKind,
  ExecutorSupportLevel,
} from "../enums/index.js";

const FILE_MUTATION_QUALIFIERS: readonly ExecutorCapabilityQualifier[] = [
  {
    kind: ExecutorCapabilityQualifierKind.CanonicalAction,
    value: "file_mutation",
  },
];

/** 创建跨平台 Managed File Mutation Hook 的固定支持 Policy。 */
export function createManagedFileMutationHookPolicy(): ExecutorCompatibilityPolicy {
  const compatibleRequirements = createCompatibleRequirements();
  return {
    schemaVersion: EXECUTOR_COMPATIBILITY_POLICY_SCHEMA_VERSION,
    policyId: "managed_file_mutation_hooks.policy.v1",
    profileId: MANAGED_FILE_MUTATION_HOOK_PROFILE_ID,
    tiers: [
      {
        level: ExecutorSupportLevel.Production,
        scopeRequirements: {
          modelId: true,
          permissionMode: true,
          configurationDigest: true,
        },
        requirements: compatibleRequirements.map((requirement) => ({
          ...requirement,
          evidenceKinds: uniqueKinds([
            ...requirement.evidenceKinds,
            ExecutorEvidenceKind.ProductionE2e,
          ]),
        })),
      },
      {
        level: ExecutorSupportLevel.Compatible,
        scopeRequirements: {
          modelId: false,
          permissionMode: false,
          configurationDigest: true,
        },
        requirements: compatibleRequirements,
      },
    ],
  };
}

function createCompatibleRequirements(): readonly ExecutorCapabilityRequirement[] {
  return [
    requirement(ExecutorCapability.CommandHookHandler, [
      ExecutorEvidenceKind.StaticProbe,
      ExecutorEvidenceKind.ContractTest,
      ExecutorEvidenceKind.SmokeTest,
    ]),
    requirement(ExecutorCapability.NativeHookInput, [
      ExecutorEvidenceKind.ContractTest,
      ExecutorEvidenceKind.SmokeTest,
    ]),
    requirement(ExecutorCapability.PreFileMutation, [
      ExecutorEvidenceKind.ContractTest,
      ExecutorEvidenceKind.SmokeTest,
      ExecutorEvidenceKind.NegativeTest,
    ]),
    requirement(ExecutorCapability.PostFileMutation, [
      ExecutorEvidenceKind.ContractTest,
      ExecutorEvidenceKind.SmokeTest,
    ]),
    requirement(ExecutorCapability.DenyFileMutation, [
      ExecutorEvidenceKind.ContractTest,
      ExecutorEvidenceKind.NegativeTest,
    ]),
  ];
}

function requirement(
  capability: ExecutorCapability,
  evidenceKinds: readonly ExecutorEvidenceKind[],
): ExecutorCapabilityRequirement {
  return {
    capability,
    qualifiers: FILE_MUTATION_QUALIFIERS,
    evidenceKinds,
  };
}

function uniqueKinds(kinds: readonly ExecutorEvidenceKind[]): readonly ExecutorEvidenceKind[] {
  return [...new Set(kinds)];
}
