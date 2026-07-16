import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import {
  ExecutorCompatibilityPublicationTargetKind,
  SIGSTORE_RUNNER_ENVIRONMENT_OID,
  createExecutorCompatibilityPublisherIdentityPolicy,
  createExecutorCompatibilityReleaseAttestationDraft,
  createExecutorCompatibilityReleaseCandidate,
} from "../../src/domain/executorCompatibilityAttestation/index.js";
import { createExecutorCompatibilityPublicationBundle } from "../../src/domain/executorCompatibilityPublication/index.js";
import {
  createExecutorCompatibilityAttestationFixture,
  createExecutorCompatibilityG6BindingForFixture,
  createPublisherIdentityPolicyInput,
  executorCompatibilityAttestationWorkflowIdentity,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Attestation Identity Policy", () => {
  it("规范化证书扩展并固定精确发布者身份", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const sortedOids = fixture.publisherIdentityPolicy.certificateExtensions.map(
      (extension) => extension.oid,
    );

    expect(sortedOids).toEqual([...sortedOids].sort());
    expect(fixture.publisherIdentityPolicy.certificateIssuer).toBe(
      "https://token.actions.githubusercontent.com",
    );
    expect(fixture.publisherIdentityPolicy.certificateExtensions).toContainEqual({
      oid: SIGSTORE_RUNNER_ENVIRONMENT_OID,
      value: "github-hosted",
    });
  });

  it("Identity、Target 与 Bundle 任一变化都会产生新的 Candidate Digest", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const alternateWorkflow = executorCompatibilityAttestationWorkflowIdentity.replace(
      "release.yml",
      "publish.yml",
    );
    const policy = createExecutorCompatibilityPublisherIdentityPolicy(
      createPublisherIdentityPolicyInput(
        fixture.releaseSubject.repositoryUri,
        fixture.releaseSubject.sourceRevision,
        alternateWorkflow,
      ),
      fixture.digest,
    );
    if (policy.status === ResultStatus.Failure) throw policy.error;
    const identityCandidate = createExecutorCompatibilityReleaseCandidate(
      {
        bundle: fixture.bundle,
        publisherIdentityPolicy: policy.value,
        target: fixture.target,
      },
      fixture.digest,
    );
    if (identityCandidate.status === ResultStatus.Failure) throw identityCandidate.error;

    const targetCandidate = createExecutorCompatibilityReleaseCandidate(
      {
        bundle: fixture.bundle,
        publisherIdentityPolicy: fixture.publisherIdentityPolicy,
        target: {
          kind: ExecutorCompatibilityPublicationTargetKind.ArtifactRegistry,
          uri: "https://artifacts.example.com/liushi-harness/0.0.0",
        },
      },
      fixture.digest,
    );
    if (targetCandidate.status === ResultStatus.Failure) throw targetCandidate.error;

    const changedBundle = createExecutorCompatibilityPublicationBundle(
      {
        releaseSubject: { ...fixture.releaseSubject, packageVersion: "0.0.1" },
        matrix: fixture.matrix,
        policy: fixture.policy,
        projections: fixture.projections,
      },
      fixture.digest,
    );
    if (changedBundle.status === ResultStatus.Failure) throw changedBundle.error;
    const bundleCandidate = createExecutorCompatibilityReleaseCandidate(
      {
        bundle: changedBundle.value,
        publisherIdentityPolicy: fixture.publisherIdentityPolicy,
        target: fixture.target,
      },
      fixture.digest,
    );
    if (bundleCandidate.status === ResultStatus.Failure) throw bundleCandidate.error;

    expect(
      new Set([
        fixture.releaseCandidate.candidateDigest,
        identityCandidate.value.candidateDigest,
        targetCandidate.value.candidateDigest,
        bundleCandidate.value.candidateDigest,
      ]).size,
    ).toBe(4);
    expect(
      createExecutorCompatibilityG6BindingForFixture(
        { ...fixture, releaseCandidate: targetCandidate.value },
        fixture.decisionRequest,
        fixture.approvalRecord,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "G6 DecisionRequest 未绑定精确 Release Candidate Digest。" },
    });
  });

  it("拒绝不完整身份策略、源码 Revision 漂移与非规范发布目标", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const duplicateExtension = fixture.policyInput.certificateExtensions[0];
    if (duplicateExtension === undefined) throw new Error("测试策略缺少证书扩展。");
    expect(
      createExecutorCompatibilityPublisherIdentityPolicy(
        {
          ...fixture.policyInput,
          certificateExtensions: [duplicateExtension, duplicateExtension],
        },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Publisher Identity Policy 包含重复证书扩展 OID。" },
    });

    expect(
      createExecutorCompatibilityPublisherIdentityPolicy(
        {
          ...fixture.policyInput,
          certificateExtensions: fixture.policyInput.certificateExtensions.filter(
            (extension) => extension.value !== "github-hosted",
          ),
        },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        message: "Publisher Identity Policy 必须固定 Runner Environment 证书扩展。",
      },
    });

    expect(
      createExecutorCompatibilityPublisherIdentityPolicy(
        {
          ...fixture.policyInput,
          certificateIdentity: {
            ...fixture.policyInput.certificateIdentity,
            value: "https://github.com",
          },
        },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Publisher Identity Policy Schema 非法。" },
    });

    const revisionExtension = fixture.policyInput.certificateExtensions.find(
      (extension) => extension.value === fixture.releaseSubject.sourceRevision,
    );
    if (revisionExtension === undefined) throw new Error("测试策略缺少源码 Revision 扩展。");
    const revisionDriftPolicy = createExecutorCompatibilityPublisherIdentityPolicy(
      {
        ...fixture.policyInput,
        certificateExtensions: fixture.policyInput.certificateExtensions.map((extension) =>
          extension.oid === revisionExtension.oid
            ? { ...extension, value: "b".repeat(40) }
            : extension,
        ),
      },
      fixture.digest,
    );
    if (revisionDriftPolicy.status === ResultStatus.Failure) throw revisionDriftPolicy.error;
    expect(
      createExecutorCompatibilityReleaseCandidate(
        {
          bundle: fixture.bundle,
          publisherIdentityPolicy: revisionDriftPolicy.value,
          target: fixture.target,
        },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        message: "Publisher Identity Policy 未绑定 Publication Bundle 的源码 Revision。",
      },
    });

    for (const uri of [
      "https://registry.npmjs.org/liushi-harness?token=secret",
      "https://registry.npmjs.org",
    ]) {
      expect(
        createExecutorCompatibilityReleaseCandidate(
          {
            bundle: fixture.bundle,
            publisherIdentityPolicy: fixture.publisherIdentityPolicy,
            target: { kind: ExecutorCompatibilityPublicationTargetKind.NpmRegistry, uri },
          },
          fixture.digest,
        ),
      ).toMatchObject({
        status: ResultStatus.Failure,
        error: { message: "Release Candidate Schema 非法。" },
      });
    }

    const alternateCandidate = createExecutorCompatibilityReleaseCandidate(
      {
        bundle: fixture.bundle,
        publisherIdentityPolicy: fixture.publisherIdentityPolicy,
        target: {
          kind: ExecutorCompatibilityPublicationTargetKind.GitHubRelease,
          uri: "https://github.com/MarchRory/liushi-aweasome-agentic-engineering/releases/tag/v0.0.0",
        },
      },
      fixture.digest,
    );
    if (alternateCandidate.status === ResultStatus.Failure) throw alternateCandidate.error;
    expect(
      createExecutorCompatibilityReleaseAttestationDraft(
        {
          bundle: fixture.bundle,
          publisherIdentityPolicy: fixture.publisherIdentityPolicy,
          releaseCandidate: alternateCandidate.value,
          decisionRequest: fixture.decisionRequest,
          approvalRecord: fixture.approvalRecord,
        },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "G6 DecisionRequest 未绑定精确 Release Candidate Digest。" },
    });
  });
});
