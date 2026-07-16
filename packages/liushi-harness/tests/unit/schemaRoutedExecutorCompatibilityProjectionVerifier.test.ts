import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus, type ContentDigest } from "../../src/common/index.js";
import {
  ExecutorArchitecture,
  ExecutorEvidenceKind,
  ExecutorEvidenceLocatorKind,
  type ExecutorHostScope,
} from "../../src/domain/executorCompatibility/index.js";
import {
  CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  CodexCompatibilityEvidenceProjectorAdapter,
  CodexContractEvidenceProjectorAdapter,
  CodexHookAdapter,
  Rfc8785Sha256DigestAdapter,
  SchemaRoutedExecutorCompatibilityProjectionSetVerifierAdapter,
} from "../../src/infrastructure/index.js";
import { createCodexCompatibilitySourceFixture } from "../support/executorCompatibility/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const hostProjector = new CodexCompatibilityEvidenceProjectorAdapter(digest);
const contractProjector = new CodexContractEvidenceProjectorAdapter(digest, CodexHookAdapter);

describe("Schema-routed Executor Compatibility Projection verifier", () => {
  it("按 exact schema 路由并以 Host、Contract 稳定顺序返回完整集合", async () => {
    const projections = await createProjectionSet();
    const verified = createVerifier().verifyPersistedProjectionSet([
      projections.contract,
      projections.host,
    ]);

    expect(verified.status).toBe(ResultStatus.Success);
    if (verified.status === ResultStatus.Failure) throw verified.error;
    expect(verified.value.map((projection) => projection.artifactDigest)).toEqual([
      projections.host.artifactDigest,
      projections.contract.artifactDigest,
    ]);
    expect(
      verified.value.map((projection) =>
        projection.evidence
          .map((evidence) => evidence.evidenceDigest)
          .sort((left, right) => left.localeCompare(right)),
      ),
    ).toEqual(
      [projections.host, projections.contract].map((projection) =>
        projection.evidence
          .map((evidence) => evidence.evidenceDigest)
          .sort((left, right) => left.localeCompare(right)),
      ),
    );
    expect(verified.value.flatMap((projection) => projection.evidence)).toHaveLength(12);
  });

  it("缺失或重复 Host/Contract 来源均关闭式拒绝", async () => {
    const projections = await createProjectionSet();
    const verifier = createVerifier();

    for (const candidate of [
      [projections.host],
      [projections.contract],
      [projections.host, projections.host, projections.contract],
      [projections.host, projections.contract, projections.contract],
    ]) {
      expect(verifier.verifyPersistedProjectionSet(candidate)).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
    }
  });

  it("Contract Artifact 缺失、非字符串或未知 schema 均不猜测来源", async () => {
    const projections = await createProjectionSet();
    const { schemaVersion, ...withoutSchema } = projections.contract.artifact;
    expect(schemaVersion).toBe(CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION);
    const candidates = [
      { ...projections.contract, artifact: withoutSchema },
      { ...projections.contract, artifact: { ...projections.contract.artifact, schemaVersion: 1 } },
      {
        ...projections.contract,
        artifact: { ...projections.contract.artifact, schemaVersion: "unknown.contract.v1" },
      },
    ];

    for (const contract of candidates) {
      expect(
        createVerifier().verifyPersistedProjectionSet([projections.host, contract]),
      ).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
    }
  });

  it("拒绝来源专属复验合法但父 Digest、Scope 或观察锚点跨来源漂移的 Contract", async () => {
    const projections = await createProjectionSet();
    const scope = projections.host.evidence[0]?.scope;
    if (scope === undefined) throw new Error("Host Projection 缺少 Scope。");
    const wrongParent = await projectContract({
      scope,
      hostArtifactDigest: calculateDigest({ host: "other" }),
      observationAnchor: projections.observationAnchor,
    });
    const wrongScope = await projectContract({
      scope: { ...scope, architecture: ExecutorArchitecture.Arm64 },
      hostArtifactDigest: projections.host.artifactDigest,
      observationAnchor: projections.observationAnchor,
    });
    const wrongAnchor = await projectContract({
      scope,
      hostArtifactDigest: projections.host.artifactDigest,
      observationAnchor: "2026-07-15T08:09:11.000Z",
    });

    for (const contract of [wrongParent, wrongScope, wrongAnchor]) {
      expect(contractProjector.verifyPersistedProjection(contract).status).toBe(
        ResultStatus.Success,
      );
      expect(
        createVerifier().verifyPersistedProjectionSet([projections.host, contract]),
      ).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
    }
  });
});

function createVerifier(): SchemaRoutedExecutorCompatibilityProjectionSetVerifierAdapter {
  return new SchemaRoutedExecutorCompatibilityProjectionSetVerifierAdapter(
    [
      {
        schemaVersion: CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
        exactCount: 1,
        verifier: hostProjector,
      },
      {
        schemaVersion: CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
        exactCount: 1,
        verifier: contractProjector,
      },
    ],
    [
      {
        parentSchemaVersion: CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
        dependentSchemaVersion: CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
        dependentArtifactDigestField: "hostArtifactDigest",
        dependentObservationAnchorField: "observationAnchor",
        parentObservationKinds: [ExecutorEvidenceKind.SmokeTest, ExecutorEvidenceKind.NegativeTest],
      },
    ],
  );
}

async function createProjectionSet() {
  const fixture = createCodexCompatibilitySourceFixture();
  const host = hostProjector.project({
    ...fixture,
    artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
  });
  expect(host.status).toBe(ResultStatus.Success);
  if (host.status === ResultStatus.Failure) throw host.error;
  const observationAnchor = fixture.hostResult.verifiedAt;
  const scope = host.value.evidence[0]?.scope;
  if (scope === undefined) throw new Error("Host Projection 缺少 Scope。");
  const contract = await projectContract({
    scope,
    hostArtifactDigest: host.value.artifactDigest,
    observationAnchor,
  });
  return { host: host.value, contract, observationAnchor };
}

function projectContract(input: {
  readonly scope: ExecutorHostScope;
  readonly hostArtifactDigest: ContentDigest;
  readonly observationAnchor: string;
}) {
  return contractProjector
    .project({
      ...input,
      artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
    })
    .then((result) => {
      expect(result.status).toBe(ResultStatus.Success);
      if (result.status === ResultStatus.Failure) throw result.error;
      return result.value;
    });
}

function calculateDigest(input: unknown): ContentDigest {
  const result = digest.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
