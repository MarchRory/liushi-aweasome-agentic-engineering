import { describe, expect, it } from "vitest";

import type { ExecutorCompatibilityEvidenceProjection } from "../../src/application/ports/executorCompatibilityEvidenceProjectionVerifier/index.js";
import { ResultStatus, type ContentDigest } from "../../src/common/index.js";
import {
  ExecutorAdapterKind,
  ExecutorArchitecture,
  ExecutorCapability,
  ExecutorDistribution,
  ExecutorEvidenceKind,
  ExecutorEvidenceLocatorKind,
  ExecutorEvidenceOutcome,
  ExecutorHostSurface,
  ExecutorOperatingSystem,
  ExecutorSupportLevel,
  compileExecutorCompatibilityMatrix,
  createManagedFileMutationHookPolicy,
  type ExecutorHostScope,
} from "../../src/domain/executorCompatibility/index.js";
import {
  CODEX_CONTRACT_POST_ADDITIONAL_CONTEXT,
  CODEX_CONTRACT_SUITE_DEFINITION,
  CodexContractEvidenceProjectorAdapter,
  CodexContractCheckOutcome,
  CodexContractFaultInjection,
  type CodexContractEvidenceProjection,
} from "../../src/infrastructure/executors/codex/contractEvidence/index.js";
import { CodexHookAdapter } from "../../src/infrastructure/executors/codex/hooks/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/serialization/jsonDigest/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const OBSERVATION_ANCHOR = "2026-07-16T08:00:00.000Z";

describe("Codex Contract Evidence Projection", () => {
  it("固定 Suite 全通过时生成五条 ContractTest Passed Evidence", async () => {
    const projection = await projectSuccessfully();

    expect(projection.artifact.caseResults).toHaveLength(5);
    expect(
      projection.artifact.caseResults.every(
        (item) => item.outcome === ExecutorEvidenceOutcome.Passed,
      ),
    ).toBe(true);
    expect(projection.evidence).toHaveLength(5);
    expect(
      projection.evidence.every(
        (item) =>
          item.kind === ExecutorEvidenceKind.ContractTest &&
          item.outcome === ExecutorEvidenceOutcome.Passed,
      ),
    ).toBe(true);
    expect(projection.evidence.map((item) => item.capability)).toEqual([
      ExecutorCapability.CommandHookHandler,
      ExecutorCapability.NativeHookInput,
      ExecutorCapability.PreFileMutation,
      ExecutorCapability.PostFileMutation,
      ExecutorCapability.DenyFileMutation,
    ]);
    expect(projection.artifact.suite.cases).toEqual(CODEX_CONTRACT_SUITE_DEFINITION.cases);
    expect(projection.artifact.scope).not.toHaveProperty("modelId");
    expect(projection.artifact.scope).not.toHaveProperty("permissionMode");
  });

  it("单个受控 Contract check 故障只生成对应 Failed Evidence", async () => {
    const projector = new CodexContractEvidenceProjectorAdapter(
      digest,
      CodexHookAdapter,
      CodexContractFaultInjection.PostAdditionalContext,
    );
    const projection = await projectSuccessfully(projector);
    const failed = projection.evidence.filter(
      (item) => item.outcome === ExecutorEvidenceOutcome.Failed,
    );
    const postResult = projection.artifact.caseResults.find(
      (item) => item.capability === ExecutorCapability.PostFileMutation,
    );

    expect(failed).toHaveLength(1);
    expect(failed[0]?.capability).toBe(ExecutorCapability.PostFileMutation);
    expect(postResult?.checks).toContainEqual({
      checkId: "post.additional_context_mapping.v1",
      outcome: CodexContractCheckOutcome.Failed,
    });
    const compiled = compileExecutorCompatibilityMatrix(
      {
        scope: projection.artifact.scope,
        policy: createManagedFileMutationHookPolicy(),
        evidence: projection.evidence,
      },
      digest,
    );
    expect(compiled.status).toBe(ResultStatus.Success);
    if (compiled.status === ResultStatus.Failure) throw compiled.error;
    expect(compiled.value.supportLevel).toBe(ExecutorSupportLevel.Unsupported);
    expect(JSON.stringify(projection)).not.toContain(CODEX_CONTRACT_POST_ADDITIONAL_CONTEXT);
  });

  it("相同可信输入重复投影得到逐字段相等 Artifact 与相同 Digest", async () => {
    const first = await projectSuccessfully();
    const second = await projectSuccessfully();

    expect(second).toEqual(first);
    expect(second.artifact).toEqual(first.artifact);
    expect(second.artifactDigest).toBe(first.artifactDigest);
  });

  it("拒绝 Scope 漂移以及缺失 configurationDigest", async () => {
    const validScope = createScope();
    const { configurationDigest: _omitted, ...withoutConfiguration } = validScope;
    const projector = createProjector();
    const drifted = await projector.project({
      scope: { ...validScope, surface: ExecutorHostSurface.Desktop },
      hostArtifactDigest: calculateDigest("host-artifact"),
      observationAnchor: OBSERVATION_ANCHOR,
      artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
    });
    const incomplete = await projector.project({
      scope: withoutConfiguration,
      hostArtifactDigest: calculateDigest("host-artifact"),
      observationAnchor: OBSERVATION_ANCHOR,
      artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
    });

    expect(drifted.status).toBe(ResultStatus.Failure);
    expect(incomplete.status).toBe(ResultStatus.Failure);
  });

  it("有效 RuntimeStore Projection 可同步复验", async () => {
    const projector = createProjector();
    const projection = await projectSuccessfully(projector);
    const persistedProjection: ExecutorCompatibilityEvidenceProjection = {
      artifact: structuredClone(projection.artifact),
      artifactDigest: projection.artifactDigest,
      evidence: structuredClone(projection.evidence),
    };
    const verified = projector.verifyPersistedProjection(persistedProjection);

    expect(verified.status).toBe(ResultStatus.Success);
    if (verified.status === ResultStatus.Failure) throw verified.error;
    expect(verified.value).toEqual(persistedProjection);
  });

  it("接受 Runtime Store 按 Evidence Digest 重排后重建的合法 Projection", async () => {
    const projector = createProjector();
    const projection = await projectSuccessfully(projector);
    const persistedProjection: ExecutorCompatibilityEvidenceProjection = {
      artifact: structuredClone(projection.artifact),
      artifactDigest: projection.artifactDigest,
      evidence: [...structuredClone(projection.evidence)].sort((left, right) =>
        left.evidenceDigest.localeCompare(right.evidenceDigest),
      ),
    };

    const verified = projector.verifyPersistedProjection(persistedProjection);

    expect(verified.status).toBe(ResultStatus.Success);
    if (verified.status === ResultStatus.Failure) throw verified.error;
    expect(
      verified.value.evidence
        .map((item) => item.evidenceDigest)
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(persistedProjection.evidence.map((item) => item.evidenceDigest));
  });

  it("Artifact、Evidence、Check ID 与 Suite Digest 篡改均关闭式拒绝", async () => {
    const projector = createProjector();
    const projection = await projectSuccessfully(projector);
    const firstCase = projection.artifact.caseResults[0];
    const firstEvidence = projection.evidence[0];
    if (firstCase === undefined || firstEvidence === undefined) {
      throw new Error("Contract Evidence 测试夹具不完整。");
    }

    const tamperedArtifactDigest = {
      ...projection,
      artifactDigest: calculateDigest("tampered-artifact"),
    };
    const tamperedCheck = {
      ...projection,
      artifact: {
        ...projection.artifact,
        caseResults: [
          {
            ...firstCase,
            checks: [
              { ...firstCase.checks[0], checkId: "tampered.check.v1" },
              ...firstCase.checks.slice(1),
            ],
          },
          ...projection.artifact.caseResults.slice(1),
        ],
      },
    };
    const tamperedSuiteDigest = {
      ...projection,
      artifact: {
        ...projection.artifact,
        suite: {
          ...projection.artifact.suite,
          definitionDigest: calculateDigest("tampered-suite"),
        },
      },
    };
    const tamperedEvidence = {
      ...projection,
      evidence: [
        { ...firstEvidence, evidenceDigest: calculateDigest("tampered-evidence") },
        ...projection.evidence.slice(1),
      ],
    };

    for (const candidate of [
      tamperedArtifactDigest,
      tamperedCheck,
      tamperedSuiteDigest,
      tamperedEvidence,
    ]) {
      expect(projector.verifyPersistedProjection(candidate).status).toBe(ResultStatus.Failure);
    }
  });

  it("漏 Case、重排 Suite Definition 与错误 Host Digest 均关闭式拒绝", async () => {
    const projector = createProjector();
    const projection = await projectSuccessfully(projector);
    const missingCase = {
      ...projection,
      artifact: {
        ...projection.artifact,
        caseResults: projection.artifact.caseResults.slice(0, -1),
      },
    };
    const reorderedDefinition = {
      ...projection,
      artifact: {
        ...projection.artifact,
        suite: {
          ...projection.artifact.suite,
          cases: [...projection.artifact.suite.cases].reverse(),
        },
      },
    };
    const wrongHostDigest = {
      ...projection,
      artifact: {
        ...projection.artifact,
        hostArtifactDigest: calculateDigest("wrong-host-artifact"),
      },
    };

    expect(projector.verifyPersistedProjection(missingCase).status).toBe(ResultStatus.Failure);
    expect(projector.verifyPersistedProjection(reorderedDefinition).status).toBe(
      ResultStatus.Failure,
    );
    expect(projector.verifyPersistedProjection(wrongHostDigest).status).toBe(ResultStatus.Failure);
  });

  it("投影不包含原始 Session、Turn、Tool ID、Payload 或绝对路径", async () => {
    const projection = await projectSuccessfully();
    const serialized = JSON.stringify(projection);

    for (const forbidden of [
      "contract-session-v1",
      "contract-turn-v1",
      "contract-command-v1",
      "contract-native-v1",
      "contract-pre-v1",
      "contract-post-v1",
      "contract-deny-v1",
      "contract-model-v1",
      "tool_input",
      "tool_response",
      "*** Begin Patch",
      "actorId",
      "sessionId",
      "turnId",
      "toolCallId",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(
      collectStrings(projection).some((value) => /^(?:[A-Za-z]:[\\/]|[\\/]{2}|\/)/u.test(value)),
    ).toBe(false);
  });
});

function createProjector(): CodexContractEvidenceProjectorAdapter {
  return new CodexContractEvidenceProjectorAdapter(digest, CodexHookAdapter);
}

async function projectSuccessfully(
  projector: CodexContractEvidenceProjectorAdapter = createProjector(),
): Promise<CodexContractEvidenceProjection> {
  const result = await projector.project({
    scope: createScope(),
    hostArtifactDigest: calculateDigest("host-artifact"),
    observationAnchor: OBSERVATION_ANCHOR,
    artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
  });
  expect(result.status).toBe(ResultStatus.Success);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function createScope(): ExecutorHostScope {
  return {
    adapterKind: ExecutorAdapterKind.Codex,
    distribution: ExecutorDistribution.CodexCli,
    adapterDigest: calculateDigest("codex-adapter"),
    executorVersion: "0.144.0",
    surface: ExecutorHostSurface.InteractiveTui,
    operatingSystem: ExecutorOperatingSystem.Windows,
    architecture: ExecutorArchitecture.X64,
    configurationDigest: calculateDigest("codex-hook-configuration"),
  };
}

function calculateDigest(input: unknown): ContentDigest {
  const result = digest.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function collectStrings(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item));
  if (isRecord(value)) return Object.values(value).flatMap((item) => collectStrings(item));
  return [];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
