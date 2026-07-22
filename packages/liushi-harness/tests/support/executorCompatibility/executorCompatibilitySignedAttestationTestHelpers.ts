import type {
  ExecutorCompatibilitySigstoreBundleJson,
  ExecutorCompatibilitySignedAttestationArtifact,
  ExecutorCompatibilityTrustedRootJson,
  ExecutorCompatibilityVerifiedSignerIdentity,
} from "../../../src/application/index.js";
import { ResultStatus } from "../../../src/common/index.js";
import type { ExecutorCompatibilityReleaseAttestationDraft } from "../../../src/domain/executorCompatibilityAttestation/index.js";
import { createExecutorCompatibilitySignedAttestationArtifact } from "../../../src/application/index.js";

import type { ExecutorCompatibilityAttestationFixture } from "./executorCompatibilityAttestationFixture.js";

/** 创建不含测试辅助字段的严格 Release Attestation Draft。 */
export function createStrictExecutorCompatibilityAttestationDraft(
  fixture: ExecutorCompatibilityAttestationFixture,
): ExecutorCompatibilityReleaseAttestationDraft {
  return {
    bundle: fixture.bundle,
    publisherIdentityPolicy: fixture.publisherIdentityPolicy,
    releaseCandidate: fixture.releaseCandidate,
    decisionRequest: fixture.decisionRequest,
    approvalRecord: fixture.approvalRecord,
    g6Approval: fixture.g6Approval,
    statement: fixture.statement,
  };
}

/** 创建应用层单测使用的最小 Sigstore Bundle JSON。 */
export function createExecutorCompatibilitySigstoreBundleStub(
  marker = "signed",
): ExecutorCompatibilitySigstoreBundleJson {
  return {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    marker,
  };
}

/** 创建应用层单测使用的最小 Trusted Root JSON。 */
export function createExecutorCompatibilityTrustedRootStub(
  marker = "trusted",
): ExecutorCompatibilityTrustedRootJson {
  return {
    mediaType: "application/vnd.dev.sigstore.trustedroot.v0.2+json",
    marker,
  };
}

/** 从 Fixture 的发布者策略创建精确匹配的已验证签名者身份。 */
export function createVerifiedSignerIdentityStub(
  fixture: ExecutorCompatibilityAttestationFixture,
): ExecutorCompatibilityVerifiedSignerIdentity {
  return {
    certificateIssuer: fixture.publisherIdentityPolicy.certificateIssuer,
    certificateIdentity: fixture.publisherIdentityPolicy.certificateIdentity.value,
    certificateExtensions: fixture.publisherIdentityPolicy.certificateExtensions.map(
      (extension) => ({ ...extension }),
    ),
  };
}

/** 创建已计算全部内容摘要的应用层签名 Artifact。 */
export function createSignedAttestationArtifactForFixture(
  fixture: ExecutorCompatibilityAttestationFixture,
  sigstoreBundle = createExecutorCompatibilitySigstoreBundleStub(),
): ExecutorCompatibilitySignedAttestationArtifact {
  const artifact = createExecutorCompatibilitySignedAttestationArtifact(
    {
      draft: createStrictExecutorCompatibilityAttestationDraft(fixture),
      sigstoreBundle,
    },
    fixture.digest,
  );
  if (artifact.status === ResultStatus.Failure) throw artifact.error;
  return artifact.value;
}
