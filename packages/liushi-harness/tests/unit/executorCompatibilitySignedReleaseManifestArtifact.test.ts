import { describe, expect, it } from "vitest";

import {
  createExecutorCompatibilitySignedReleaseManifestArtifact,
  validateExecutorCompatibilitySignedReleaseManifestArtifact,
} from "../../src/application/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  createExecutorCompatibilityReleaseManifestAttestationFixture,
  createExecutorCompatibilitySigstoreBundleStub,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Signed Release Manifest Artifact", () => {
  it("确定性创建并重新验证完整内容寻址 Artifact", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const first = createExecutorCompatibilitySignedReleaseManifestArtifact(
      {
        draft: fixture.manifestAttestationDraft,
        sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub("manifest-signed"),
      },
      fixture.digest,
    );
    const second = createExecutorCompatibilitySignedReleaseManifestArtifact(
      {
        draft: fixture.manifestAttestationDraft,
        sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub("manifest-signed"),
      },
      fixture.digest,
    );

    expect(first.status).toBe(ResultStatus.Success);
    expect(second).toEqual(first);
    if (first.status === ResultStatus.Failure) throw first.error;
    expect(first.value.statementDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(first.value.sigstoreBundleDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(first.value.artifactDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(
      validateExecutorCompatibilitySignedReleaseManifestArtifact(first.value, fixture.digest),
    ).toEqual(first);
  });

  it("拒绝 Bundle、Draft、摘要和未知字段漂移", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const created = createExecutorCompatibilitySignedReleaseManifestArtifact(
      {
        draft: fixture.manifestAttestationDraft,
        sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub("manifest-signed"),
      },
      fixture.digest,
    );
    if (created.status === ResultStatus.Failure) throw created.error;
    const statement = fixture.manifestAttestationDraft.statement;

    for (const candidate of [
      {
        ...created.value,
        sigstoreBundle: { ...created.value.sigstoreBundle, marker: "tampered" },
      },
      {
        ...created.value,
        draft: {
          ...created.value.draft,
          statement: {
            ...statement,
            subject: [
              {
                ...statement.subject[0],
                digest: { sha256: "0".repeat(64) },
              },
            ],
          },
        },
      },
      { ...created.value, artifactDigest: created.value.statementDigest },
      { ...created.value, unexpected: true },
    ]) {
      expect(
        validateExecutorCompatibilitySignedReleaseManifestArtifact(candidate, fixture.digest),
      ).toMatchObject({ status: ResultStatus.Failure });
    }
  });

  it("创建前必须重新构建 Manifest Draft", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const statement = fixture.manifestAttestationDraft.statement;
    const result = createExecutorCompatibilitySignedReleaseManifestArtifact(
      {
        draft: {
          ...fixture.manifestAttestationDraft,
          statement: {
            ...statement,
            predicate: {
              ...statement.predicate,
              g6Approval: {
                ...statement.predicate.g6Approval,
                approvalRecordDigest: fixture.manifest.manifestDigest,
              },
            },
          },
        },
        sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub(),
      },
      fixture.digest,
    );

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
  });
});
