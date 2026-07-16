import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import {
  createExecutorCompatibilityPublicationBundle,
  validateExecutorCompatibilityPublicationBundle,
} from "../../src/domain/executorCompatibilityPublication/index.js";
import { createExecutorCompatibilityPublicationFixture } from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Publication Domain", () => {
  it("规范化 Projection 与 Evidence 顺序并生成稳定 Bundle Digest", async () => {
    const fixture = await createExecutorCompatibilityPublicationFixture();
    const reversed = createExecutorCompatibilityPublicationBundle(
      {
        releaseSubject: fixture.releaseSubject,
        matrix: fixture.matrix,
        policy: fixture.policy,
        projections: [...fixture.projections]
          .reverse()
          .map((projection) => ({ ...projection, evidence: [...projection.evidence].reverse() })),
      },
      fixture.digest,
    );

    expect(reversed).toEqual({ status: ResultStatus.Success, value: fixture.bundle });
    expect(fixture.bundle.projections.map((item) => item.artifactDigest)).toEqual(
      [...fixture.bundle.projections.map((item) => item.artifactDigest)].sort(),
    );
    expect(
      fixture.bundle.projections.every((projection) =>
        projection.evidence
          .map((evidence) => evidence.evidenceDigest)
          .every((digest, index, values) => index === 0 || (values[index - 1] ?? "") < digest),
      ),
    ).toBe(true);
  });

  it("拒绝 Tarball Digest 与 Matrix Adapter Digest 漂移", async () => {
    const fixture = await createExecutorCompatibilityPublicationFixture();
    const result = createExecutorCompatibilityPublicationBundle(
      {
        releaseSubject: {
          ...fixture.releaseSubject,
          packageDigest: calculateDifferentDigest(fixture),
        },
        matrix: fixture.matrix,
        policy: fixture.policy,
        projections: fixture.projections,
      },
      fixture.digest,
    );

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Publication Tarball Digest 与 Matrix Adapter Digest 不一致。" },
    });
  });

  it("拒绝 Artifact 内容、Evidence 集合与 Bundle Digest 的独立篡改", async () => {
    const fixture = await createExecutorCompatibilityPublicationFixture();
    const firstProjection = fixture.bundle.projections[0];
    if (firstProjection === undefined) throw new Error("Publication Fixture 缺少 Projection。");
    const tamperedArtifact = {
      ...fixture.bundle,
      projections: [
        { ...firstProjection, artifact: { replaced: true } },
        ...fixture.bundle.projections.slice(1),
      ],
    };
    expect(
      validateExecutorCompatibilityPublicationBundle(tamperedArtifact, fixture.digest),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Publication Artifact Digest 与内容不一致。" },
    });

    const duplicateEvidence = firstProjection.evidence[0];
    if (duplicateEvidence === undefined) throw new Error("Publication Fixture 缺少 Evidence。");
    expect(
      validateExecutorCompatibilityPublicationBundle(
        {
          ...fixture.bundle,
          projections: [
            {
              ...firstProjection,
              evidence: [...firstProjection.evidence, duplicateEvidence],
            },
            ...fixture.bundle.projections.slice(1),
          ],
        },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Publication Bundle 包含重复 Evidence。" },
    });

    expect(
      validateExecutorCompatibilityPublicationBundle(
        { ...fixture.bundle, bundleDigest: calculateDifferentDigest(fixture) },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Executor Compatibility Publication Bundle 摘要漂移。" },
    });
  });

  it("拒绝非规范顺序与未知顶层字段", async () => {
    const fixture = await createExecutorCompatibilityPublicationFixture();
    expect(
      validateExecutorCompatibilityPublicationBundle(
        { ...fixture.bundle, projections: [...fixture.bundle.projections].reverse() },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Executor Compatibility Publication Projection 未按摘要稳定排序。" },
    });
    expect(
      validateExecutorCompatibilityPublicationBundle(
        { ...fixture.bundle, unexpected: true },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Executor Compatibility Publication Bundle Schema 非法。" },
    });
  });

  it.each([
    "http://github.com/MarchRory/liushi-aweasome-agentic-engineering",
    "https://user:secret@github.com/MarchRory/liushi-aweasome-agentic-engineering",
    "https://github.com/MarchRory/liushi-aweasome-agentic-engineering?token=secret",
    "https://github.com/MarchRory/liushi-aweasome-agentic-engineering#main",
    "https://github.com/MarchRory/liushi-aweasome-agentic-engineering/",
  ])("拒绝非规范或携带凭据的 Repository URI：%s", async (repositoryUri) => {
    const fixture = await createExecutorCompatibilityPublicationFixture();
    const result = createExecutorCompatibilityPublicationBundle(
      {
        releaseSubject: { ...fixture.releaseSubject, repositoryUri },
        matrix: fixture.matrix,
        policy: fixture.policy,
        projections: fixture.projections,
      },
      fixture.digest,
    );

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Executor Compatibility Publication Bundle Schema 非法。" },
    });
  });
});

function calculateDifferentDigest(
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityPublicationFixture>>,
) {
  const digest = fixture.digest.calculate({ different: true });
  if (digest.status === ResultStatus.Failure) throw digest.error;
  expect(digest.value).not.toBe(fixture.releaseSubject.packageDigest);
  return digest.value;
}
