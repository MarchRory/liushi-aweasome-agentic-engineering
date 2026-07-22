import { describe, expect, it } from "vitest";

import { ActorKind, ResultStatus } from "../../src/common/index.js";
import { ApprovalDecision } from "../../src/domain/approval/index.js";
import {
  ExecutorCompatibilityReleaseApprovalSubject,
  createExecutorCompatibilityPublisherIdentityPolicy,
  validateExecutorCompatibilityReleaseG6ApprovalRecords,
} from "../../src/domain/executorCompatibilityAttestation/index.js";
import {
  createExecutorCompatibilityReleaseManifestDigestInput,
  validateExecutorCompatibilityReleaseManifestIntegrity,
  type ExecutorCompatibilityReleaseManifest,
} from "../../src/domain/executorCompatibilityReleaseManifest/index.js";
import {
  createExecutorCompatibilityReleaseManifestAttestationDraft,
  rebuildExecutorCompatibilityReleaseManifestAttestationDraft,
  validateExecutorCompatibilityReleaseManifestAttestationStatement,
} from "../../src/domain/executorCompatibilityReleaseManifestAttestation/index.js";
import {
  createExecutorCompatibilityReleaseManifestAttestationFixture,
  withManifestApprovalRecordDigest,
  withManifestDecisionRequestDigest,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Release Manifest Attestation Domain", () => {
  it("确定性创建绑定唯一 Manifest Subject 与独立 Human G6 的 Draft", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const input = draftInput(fixture);
    const first = createExecutorCompatibilityReleaseManifestAttestationDraft(input, fixture.digest);
    const second = createExecutorCompatibilityReleaseManifestAttestationDraft(
      input,
      fixture.digest,
    );
    expect(first.status).toBe(ResultStatus.Success);
    expect(second).toEqual(first);
    if (first.status === ResultStatus.Failure) throw first.error;
    expect(first.value.g6Approval.manifestDigest).toBe(fixture.manifest.manifestDigest);
    expect(first.value.statement.subject).toHaveLength(1);
    expect(first.value.statement.subject[0].digest.sha256).toBe(
      fixture.manifest.manifestDigest.slice("sha256:".length),
    );
    expect(first.value.statement.predicate.manifest).toEqual(fixture.manifest);
  });

  it("拒绝重算 Manifest 摘要后的非规范 Artifact 顺序", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const reversed = withManifestDigest(fixture, {
      ...fixture.manifest,
      artifacts: [...fixture.manifest.artifacts].reverse(),
    });
    expect(
      validateExecutorCompatibilityReleaseManifestIntegrity(reversed, fixture.digest).status,
    ).toBe(ResultStatus.Failure);
  });

  it("拒绝非 Human、Rejected 与自定义动作的 Manifest G6", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const nonHuman = withManifestApprovalRecordDigest(
      {
        ...fixture.manifestApprovalRecord,
        actor: { kind: ActorKind.Agent, actorId: "forged-agent" },
      },
      fixture,
    );
    const rejected = withManifestApprovalRecordDigest(
      {
        ...fixture.manifestApprovalRecord,
        decision: ApprovalDecision.Rejected,
        reason: "Manifest 尚未满足发布条件。",
      },
      fixture,
    );
    const customDecision = withManifestDecisionRequestDigest(
      { ...fixture.manifestDecisionRequest, requiredAction: "Accept any manifest." },
      fixture,
    );
    const customApproval = withManifestApprovalRecordDigest(
      {
        ...fixture.manifestApprovalRecord,
        decisionRequestDigest: customDecision.digest,
      },
      fixture,
    );
    expect(
      validateExecutorCompatibilityReleaseG6ApprovalRecords(
        {
          artifactDigest: fixture.manifest.manifestDigest,
          decisionRequest: fixture.manifestDecisionRequest,
          approvalRecord: rejected,
          approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
        },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "G6 ApprovalRecord 必须明确批准 Release Manifest。" },
    });
    for (const input of [
      { ...draftInput(fixture), approvalRecord: nonHuman },
      { ...draftInput(fixture), approvalRecord: rejected },
      {
        ...draftInput(fixture),
        decisionRequest: customDecision,
        approvalRecord: customApproval,
      },
    ]) {
      expect(
        createExecutorCompatibilityReleaseManifestAttestationDraft(input, fixture.digest).status,
      ).toBe(ResultStatus.Failure);
    }
  });

  it("拒绝运行时伪造的共享 G6 审批主体", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    expect(
      validateExecutorCompatibilityReleaseG6ApprovalRecords(
        {
          artifactDigest: digest(fixture, { unboundManifest: true }),
          decisionRequest: fixture.manifestDecisionRequest,
          approvalRecord: fixture.manifestApprovalRecord,
          approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
        },
        fixture.digest,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "G6 DecisionRequest 未绑定精确 Release Manifest Digest。" },
    });
    expect(
      validateExecutorCompatibilityReleaseG6ApprovalRecords(
        {
          artifactDigest: fixture.manifest.manifestDigest,
          decisionRequest: fixture.manifestDecisionRequest,
          approvalRecord: fixture.manifestApprovalRecord,
          approvalSubject: "custom" as never,
        },
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
  });

  it("拒绝重算 Manifest 摘要后的 Identity Policy 交叉漂移", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const otherPolicy = createExecutorCompatibilityPublisherIdentityPolicy(
      {
        ...fixture.policyInput,
        certificateIssuer: "https://issuer.example.com",
      },
      fixture.digest,
    );
    if (otherPolicy.status === ResultStatus.Failure) throw otherPolicy.error;
    const manifest = withManifestDigest(fixture, {
      ...fixture.manifest,
      publisherIdentityPolicyDigest: otherPolicy.value.identityPolicyDigest,
    });
    expect(
      createExecutorCompatibilityReleaseManifestAttestationDraft(
        { ...draftInput(fixture), manifest },
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
  });

  it("拒绝 Subject、Predicate、unknown 与持久化 Draft 漂移", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const draft = fixture.manifestAttestationDraft;
    const context = {
      manifest: fixture.manifest,
      publisherIdentityPolicy: fixture.publisherIdentityPolicy,
      decisionRequest: fixture.manifestDecisionRequest,
      approvalRecord: fixture.manifestApprovalRecord,
    };
    const subjectTampered = {
      ...draft.statement,
      subject: [
        {
          ...draft.statement.subject[0],
          digest: { sha256: "b".repeat(64) },
        },
      ],
    };
    const predicateTampered = {
      ...draft.statement,
      predicate: {
        ...draft.statement.predicate,
        manifest: {
          ...draft.statement.predicate.manifest,
          manifestDigest: digest(fixture, { forgedManifest: true }),
        },
      },
    };
    expect(
      validateExecutorCompatibilityReleaseManifestAttestationStatement(
        subjectTampered,
        context,
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      validateExecutorCompatibilityReleaseManifestAttestationStatement(
        predicateTampered,
        context,
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      rebuildExecutorCompatibilityReleaseManifestAttestationDraft(
        { ...draft, unexpected: true },
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      rebuildExecutorCompatibilityReleaseManifestAttestationDraft(
        { ...draft, statement: subjectTampered },
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
  });

  it("公开 Statement Validator 必须从真实记录重算 G6 Binding", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const draft = fixture.manifestAttestationDraft;
    const forgedBinding = {
      ...draft.g6Approval,
      decisionRequestDigest: digest(fixture, { forgedDecision: true }),
      approvalRecordDigest: digest(fixture, { forgedApproval: true }),
    };
    const forgedStatement = {
      ...draft.statement,
      predicate: { ...draft.statement.predicate, g6Approval: forgedBinding },
    };
    const nonHumanApproval = withManifestApprovalRecordDigest(
      {
        ...fixture.manifestApprovalRecord,
        actor: { kind: ActorKind.Agent, actorId: "forged-agent" },
      },
      fixture,
    );
    const validContext = {
      manifest: fixture.manifest,
      publisherIdentityPolicy: fixture.publisherIdentityPolicy,
      decisionRequest: fixture.manifestDecisionRequest,
      approvalRecord: fixture.manifestApprovalRecord,
    };
    expect(
      validateExecutorCompatibilityReleaseManifestAttestationStatement(
        forgedStatement,
        validContext,
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      validateExecutorCompatibilityReleaseManifestAttestationStatement(
        draft.statement,
        { ...validContext, approvalRecord: nonHumanApproval },
        fixture.digest,
      ).status,
    ).toBe(ResultStatus.Failure);
  });
});

function draftInput(
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityReleaseManifestAttestationFixture>>,
) {
  return {
    manifest: fixture.manifest,
    publisherIdentityPolicy: fixture.publisherIdentityPolicy,
    decisionRequest: fixture.manifestDecisionRequest,
    approvalRecord: fixture.manifestApprovalRecord,
  };
}

function withManifestDigest(
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityReleaseManifestAttestationFixture>>,
  manifest: ExecutorCompatibilityReleaseManifest,
): ExecutorCompatibilityReleaseManifest {
  return {
    ...manifest,
    manifestDigest: digest(
      fixture,
      createExecutorCompatibilityReleaseManifestDigestInput(manifest),
    ),
  };
}

function digest(
  fixture: Awaited<ReturnType<typeof createExecutorCompatibilityReleaseManifestAttestationFixture>>,
  input: unknown,
) {
  const result = fixture.digest.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
