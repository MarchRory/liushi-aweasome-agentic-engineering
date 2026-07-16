import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import {
  EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SUBJECT_NAME,
  createExecutorCompatibilityPublisherIdentityPolicy,
  type ExecutorCompatibilityAttestationStatement,
} from "../../src/domain/executorCompatibilityAttestation/index.js";
import {
  createExecutorCompatibilityAttestationFixture,
  createPublisherIdentityPolicyInput,
  executorCompatibilityAttestationWorkflowIdentity,
  validateExecutorCompatibilityStatementForFixture,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility in-toto Statement", () => {
  it("创建固定双 Subject 并绑定精确 G6 Candidate", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();

    expect(fixture.statement.subject).toEqual([
      {
        name: EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SUBJECT_NAME,
        digest: { sha256: fixture.bundle.bundleDigest.slice("sha256:".length) },
      },
      {
        name: "npm:liushi-harness@0.0.0",
        digest: { sha256: fixture.releaseSubject.packageDigest.slice("sha256:".length) },
      },
    ]);
    expect(fixture.g6Approval.releaseCandidateDigest).toBe(
      fixture.releaseCandidate.candidateDigest,
    );
  });

  it("拒绝 Subject、Predicate、Identity Policy、G6 与未知字段漂移", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const tamperedSubject: ExecutorCompatibilityAttestationStatement = {
      ...fixture.statement,
      subject: [
        {
          ...fixture.statement.subject[0],
          digest: { sha256: "0".repeat(64) },
        },
        fixture.statement.subject[1],
      ],
    };
    expect(
      validateExecutorCompatibilityStatementForFixture(fixture, tamperedSubject),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "in-toto Statement Subject 与 Publication Bundle 或 Tarball 不一致。" },
    });

    const tamperedPredicate: ExecutorCompatibilityAttestationStatement = {
      ...fixture.statement,
      predicate: {
        ...fixture.statement.predicate,
        releaseSubject: {
          ...fixture.statement.predicate.releaseSubject,
          packageVersion: "0.0.1",
        },
      },
    };
    expect(
      validateExecutorCompatibilityStatementForFixture(fixture, tamperedPredicate),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "in-toto Predicate 与 Publication Bundle 绑定不一致。" },
    });

    const alternatePolicy = createExecutorCompatibilityPublisherIdentityPolicy(
      createPublisherIdentityPolicyInput(
        fixture.releaseSubject.repositoryUri,
        fixture.releaseSubject.sourceRevision,
        executorCompatibilityAttestationWorkflowIdentity.replace("release.yml", "publish.yml"),
      ),
      fixture.digest,
    );
    if (alternatePolicy.status === ResultStatus.Failure) throw alternatePolicy.error;
    expect(
      validateExecutorCompatibilityStatementForFixture(fixture, {
        ...fixture.statement,
        predicate: {
          ...fixture.statement.predicate,
          publisherIdentityPolicy: alternatePolicy.value,
        },
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        message: "in-toto Predicate Publisher Identity Policy 未绑定 Release Candidate。",
      },
    });

    const otherDigest = fixture.digest.calculate({ forgedApproval: true });
    if (otherDigest.status === ResultStatus.Failure) throw otherDigest.error;
    expect(
      validateExecutorCompatibilityStatementForFixture(fixture, {
        ...fixture.statement,
        predicate: {
          ...fixture.statement.predicate,
          g6Approval: {
            ...fixture.statement.predicate.g6Approval,
            approvalRecordDigest: otherDigest.value,
          },
        },
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        message: "in-toto Predicate 中的 G6 Approval Binding 与受信输入不一致。",
      },
    });

    expect(
      validateExecutorCompatibilityStatementForFixture(fixture, {
        ...fixture.statement,
        unexpected: true,
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "in-toto Statement Schema 非法。" },
    });
  });
});
