import { describe, expect, it } from "vitest";

import { ActorKind, ResultStatus } from "../../src/common/index.js";
import { ApprovalDecision } from "../../src/domain/approval/index.js";
import { GateId } from "../../src/domain/policy/index.js";
import {
  createExecutorCompatibilityAttestationFixture,
  createExecutorCompatibilityG6BindingForFixture,
  withApprovalRecordDigest,
  withDecisionRequestDigest,
} from "../support/executorCompatibility/index.js";

describe("Executor Compatibility Attestation G6 Approval", () => {
  it("拒绝错误 Gate、非 Human Actor、非 Approved 决策与逆序时间", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const wrongGateRequest = withDecisionRequestDigest(
      { ...fixture.decisionRequest, gate: GateId.G4RiskOperation },
      fixture,
    );
    const wrongGateApproval = withApprovalRecordDigest(
      {
        ...fixture.approvalRecord,
        gate: GateId.G4RiskOperation,
        decisionRequestDigest: wrongGateRequest.digest,
      },
      fixture,
    );
    expect(
      createExecutorCompatibilityG6BindingForFixture(fixture, wrongGateRequest, wrongGateApproval),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "Release Attestation 只接受 G6 Merge/Release Approval。" },
    });

    const agentApproval = withApprovalRecordDigest(
      {
        ...fixture.approvalRecord,
        actor: { kind: ActorKind.Agent, actorId: "release-agent" },
      },
      fixture,
    );
    expect(
      createExecutorCompatibilityG6BindingForFixture(
        fixture,
        fixture.decisionRequest,
        agentApproval,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "G6 ApprovalRecord 必须由 Human Actor 创建。" },
    });

    const rejectedApproval = withApprovalRecordDigest(
      {
        ...fixture.approvalRecord,
        decision: ApprovalDecision.Rejected,
        reason: "Release evidence is incomplete.",
      },
      fixture,
    );
    expect(
      createExecutorCompatibilityG6BindingForFixture(
        fixture,
        fixture.decisionRequest,
        rejectedApproval,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "G6 ApprovalRecord 必须明确批准 Release Candidate。" },
    });

    const earlyApproval = withApprovalRecordDigest(
      { ...fixture.approvalRecord, createdAt: "2026-07-15T23:59:59.999Z" },
      fixture,
    );
    expect(
      createExecutorCompatibilityG6BindingForFixture(
        fixture,
        fixture.decisionRequest,
        earlyApproval,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "G6 ApprovalRecord 不能早于 DecisionRequest 创建。" },
    });
  });

  it("拒绝 DecisionRequest 与 ApprovalRecord 的独立摘要篡改", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const differentDigest = fixture.digest.calculate({ tampered: true });
    if (differentDigest.status === ResultStatus.Failure) throw differentDigest.error;

    expect(
      createExecutorCompatibilityG6BindingForFixture(
        fixture,
        { ...fixture.decisionRequest, digest: differentDigest.value },
        fixture.approvalRecord,
      ),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "G6 DecisionRequest 摘要漂移。" },
    });
    expect(
      createExecutorCompatibilityG6BindingForFixture(fixture, fixture.decisionRequest, {
        ...fixture.approvalRecord,
        digest: differentDigest.value,
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { message: "G6 ApprovalRecord 摘要漂移。" },
    });
  });
});
