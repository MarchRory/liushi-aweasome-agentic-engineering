import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import {
  ExecutorCompatibilityCertificateIdentityKind,
  SIGSTORE_BUILD_SIGNER_URI_OID,
  SIGSTORE_CERTIFICATE_ISSUER_OID,
  SIGSTORE_RUNNER_ENVIRONMENT_OID,
  SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID,
  SIGSTORE_SOURCE_REPOSITORY_URI_OID,
} from "../../src/domain/executorCompatibilityAttestation/index.js";
import {
  createExecutorCompatibilityPublisherTrustPolicy,
  createExecutorCompatibilityReleaseTrustProfile,
  deriveExecutorCompatibilityPublisherIdentityPolicy,
  isExecutorCompatibilityReleaseTrustSupportLevel,
  isExecutorCompatibilitySupportLevelAtLeast,
  validateExecutorCompatibilityPublisherTrustPolicy,
  validateExecutorCompatibilityReleaseTrustProfile,
} from "../../src/domain/executorCompatibilityReleaseTrust/index.js";
import { ExecutorSupportLevel } from "../../src/domain/executorCompatibility/index.js";
import {
  createExecutorCompatibilityAttestationFixture,
  type ExecutorCompatibilityAttestationFixture,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Release Trust Domain", () => {
  it("稳定创建 Profile 并绑定 Root 与 Bootstrap 摘要", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const first = createProfile(fixture);
    const second = createProfile(fixture);

    expect(second).toEqual(first);
    expect(first.profileDigest).not.toBe(first.trustedRootDigest);
    expect(first).not.toHaveProperty("publisherIdentityPolicy");
    expect(Object.keys(first)).toEqual([
      "schemaVersion",
      "profileId",
      "packageName",
      "repositoryUri",
      "target",
      "publisherTrustPolicy",
      "trustedRootDigest",
      "minimumSupportLevel",
      "bootstrapManifestDigest",
      "profileDigest",
    ]);
  });

  it("工厂规范化反序额外 OID，持久化 Validator 拒绝反序对象", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const reversed = createTrustPolicy(fixture, [
      { oid: "1.2.3.5", value: "later" },
      { oid: "1.2.3.4", value: "earlier" },
    ]);
    if (reversed.status === ResultStatus.Failure) throw reversed.error;
    expect(reversed.value.additionalCertificateExtensions.map((item) => item.oid)).toEqual([
      "1.2.3.4",
      "1.2.3.5",
    ]);
    const nonCanonical = {
      ...reversed.value,
      additionalCertificateExtensions: [
        ...reversed.value.additionalCertificateExtensions,
      ].reverse(),
    };
    expect(
      validateExecutorCompatibilityPublisherTrustPolicy(nonCanonical, fixture.digest),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        message: "Publisher Trust Policy additionalCertificateExtensions 未按 OID 稳定排序。",
      },
    });
  });

  it("对 Unsupported 和 Unverified 的支持等级比较始终返回 false", () => {
    for (const actual of [ExecutorSupportLevel.Unsupported, ExecutorSupportLevel.Unverified]) {
      for (const minimum of [
        ExecutorSupportLevel.Production,
        ExecutorSupportLevel.Compatible,
        ExecutorSupportLevel.Experimental,
      ]) {
        expect(isExecutorCompatibilitySupportLevelAtLeast(actual, minimum)).toBe(false);
      }
    }
    for (const minimum of [ExecutorSupportLevel.Unsupported, ExecutorSupportLevel.Unverified]) {
      expect(
        isExecutorCompatibilitySupportLevelAtLeast(ExecutorSupportLevel.Production, minimum),
      ).toBe(false);
    }
    expect(isExecutorCompatibilityReleaseTrustSupportLevel(ExecutorSupportLevel.Production)).toBe(
      true,
    );
    expect(isExecutorCompatibilityReleaseTrustSupportLevel(ExecutorSupportLevel.Unsupported)).toBe(
      false,
    );
  });

  it("允许同一 Profile 为不同 sourceRevision 派生不同完整身份策略", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const profile = createProfile(fixture);
    const first = deriveExecutorCompatibilityPublisherIdentityPolicy(
      { profile, releaseSubject: fixture.releaseSubject },
      fixture.digest,
    );
    const second = deriveExecutorCompatibilityPublisherIdentityPolicy(
      {
        profile,
        releaseSubject: { ...fixture.releaseSubject, sourceRevision: "b".repeat(40) },
      },
      fixture.digest,
    );
    if (first.status === ResultStatus.Failure) throw first.error;
    if (second.status === ResultStatus.Failure) throw second.error;

    expect(first.value.certificateIssuer).toBe(second.value.certificateIssuer);
    expect(first.value.certificateIdentity).toEqual(second.value.certificateIdentity);
    expect(first.value.ctLogThreshold).toBe(second.value.ctLogThreshold);
    expect(first.value.tlogThreshold).toBe(second.value.tlogThreshold);
    expect(first.value.certificateExtensions).not.toEqual(second.value.certificateExtensions);
    expect(first.value.identityPolicyDigest).not.toBe(second.value.identityPolicyDigest);
    expect(findExtension(first.value, SIGSTORE_SOURCE_REPOSITORY_URI_OID)?.value).toBe(
      profile.repositoryUri,
    );
    expect(findExtension(first.value, SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID)?.value).toBe(
      fixture.releaseSubject.sourceRevision,
    );
    expect(findExtension(second.value, SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID)?.value).toBe(
      "b".repeat(40),
    );
    expect(findExtension(first.value, SIGSTORE_BUILD_SIGNER_URI_OID)?.value).toBe(
      first.value.certificateIdentity.value,
    );
    expect(findExtension(first.value, SIGSTORE_RUNNER_ENVIRONMENT_OID)?.value).toBe(
      profile.publisherTrustPolicy.runnerEnvironment,
    );
  });

  it("从稳定 Profile 无损重建现有 P3b Release Identity Policy", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const profile = createProfile(fixture, []);
    const derived = deriveExecutorCompatibilityPublisherIdentityPolicy(
      { profile, releaseSubject: fixture.releaseSubject },
      fixture.digest,
    );

    expect(derived).toEqual({
      status: ResultStatus.Success,
      value: fixture.publisherIdentityPolicy,
    });
  });

  it.each([
    SIGSTORE_CERTIFICATE_ISSUER_OID,
    SIGSTORE_BUILD_SIGNER_URI_OID,
    SIGSTORE_RUNNER_ENVIRONMENT_OID,
    SIGSTORE_SOURCE_REPOSITORY_URI_OID,
    SIGSTORE_SOURCE_REPOSITORY_DIGEST_OID,
  ])("拒绝 additionalCertificateExtensions 中的受管 OID：%s", async (oid) => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const policy = createTrustPolicy(fixture, [{ oid, value: "forged" }]);

    expect(policy).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Publisher Trust Policy additionalCertificateExtensions 包含受管 OID。" },
    });
  });

  it("拒绝身份策略漂移、未知字段、非法 Profile ID、支持等级和锚点漂移", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const profile = createProfile(fixture);
    const otherDigest = digest(fixture, { other: true });

    expect(
      validateExecutorCompatibilityReleaseTrustProfile(
        { ...profile, profileId: "Bad_Profile" },
        fixture.digest,
      ),
    ).toMatchObject({ status: ResultStatus.Failure });
    expect(
      createExecutorCompatibilityReleaseTrustProfile(
        { ...profile, minimumSupportLevel: ExecutorSupportLevel.Unsupported },
        fixture.digest,
      ),
    ).toMatchObject({ status: ResultStatus.Failure });
    expect(
      validateExecutorCompatibilityReleaseTrustProfile(
        { ...profile, unexpected: true },
        fixture.digest,
      ),
    ).toMatchObject({ status: ResultStatus.Failure });
    expect(
      validateExecutorCompatibilityReleaseTrustProfile(
        {
          ...profile,
          publisherTrustPolicy: {
            ...profile.publisherTrustPolicy,
            publisherTrustPolicyDigest: otherDigest,
          },
        },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Publisher Trust Policy 摘要漂移。" },
    });
    expect(
      validateExecutorCompatibilityReleaseTrustProfile(
        { ...profile, repositoryUri: "https://github.com/other/repository" },
        fixture.digest,
      ),
    ).toMatchObject({ status: ResultStatus.Failure });
    expect(
      validateExecutorCompatibilityReleaseTrustProfile(
        {
          ...profile,
          target: { ...profile.target, uri: "https://registry.npmjs.org/other-package" },
        },
        fixture.digest,
      ),
    ).toMatchObject({ status: ResultStatus.Failure });
  });
});

function createProfile(
  fixture: ExecutorCompatibilityAttestationFixture,
  additionalCertificateExtensions: readonly { oid: string; value: string }[] = [
    { oid: "1.2.3.4", value: "stable-extra" },
  ],
) {
  const policy = createTrustPolicy(fixture, additionalCertificateExtensions);
  if (policy.status === ResultStatus.Failure) throw policy.error;
  const result = createExecutorCompatibilityReleaseTrustProfile(
    {
      profileId: "liushi-harness-production",
      packageName: fixture.releaseSubject.packageName,
      repositoryUri: fixture.releaseSubject.repositoryUri,
      target: fixture.target,
      publisherTrustPolicy: policy.value,
      trustedRootDigest: digest(fixture, { trustedRoot: true }),
      minimumSupportLevel: ExecutorSupportLevel.Production,
      bootstrapManifestDigest: digest(fixture, { bootstrap: true }),
    },
    fixture.digest,
  );
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function createTrustPolicy(
  fixture: ExecutorCompatibilityAttestationFixture,
  additionalCertificateExtensions: readonly { oid: string; value: string }[] = [],
) {
  const runnerEnvironment = fixture.publisherIdentityPolicy.certificateExtensions.find(
    (extension) => extension.oid === SIGSTORE_RUNNER_ENVIRONMENT_OID,
  );
  if (runnerEnvironment === undefined) throw new Error("缺少 Runner Environment 扩展。");
  return createExecutorCompatibilityPublisherTrustPolicy(
    {
      certificateIssuer: fixture.publisherIdentityPolicy.certificateIssuer,
      certificateIdentity: {
        ...fixture.publisherIdentityPolicy.certificateIdentity,
        kind: ExecutorCompatibilityCertificateIdentityKind.Uri,
      },
      runnerEnvironment: runnerEnvironment.value,
      ctLogThreshold: fixture.publisherIdentityPolicy.ctLogThreshold,
      tlogThreshold: fixture.publisherIdentityPolicy.tlogThreshold,
      additionalCertificateExtensions,
    },
    fixture.digest,
  );
}

function digest(fixture: ExecutorCompatibilityAttestationFixture, input: unknown) {
  const result = fixture.digest.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function findExtension(
  policy: { certificateExtensions: readonly { oid: string; value: string }[] },
  oid: string,
) {
  return policy.certificateExtensions.find((extension) => extension.oid === oid);
}
