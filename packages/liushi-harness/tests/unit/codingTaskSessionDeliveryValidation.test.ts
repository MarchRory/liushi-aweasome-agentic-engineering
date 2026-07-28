import { describe, expect, it } from "vitest";

import {
  CODING_TASK_AGGREGATE_TYPE,
  CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE,
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  CodingTaskSessionDeliverySubmissionDisposition,
  CodingTaskSessionEffectiveCloseoutSource,
  CodingTaskSessionEffectiveCloseoutStatus,
  CodingTaskSessionEffectiveCloseoutUnresolvedReason,
  classifyCodingTaskSessionDeliverySubmission,
  parseCodingTaskSessionDeliverySubmissionCommand,
  resolveCodingTaskSessionDeliveryCheckpoint,
  validateCodingTaskSessionDeliveryAuthority,
  validateFreshCodingTaskSessionDeliveryCheckpoint,
} from "../../src/application/index.js";
import { ActorKind, HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  CodingTaskAttemptOutcome,
  CodingTaskPhase,
  type CodingTaskAggregate,
} from "../../src/domain/codingTask/index.js";
import {
  checkpoint,
  checkpointBoundState,
  digest,
  digestOf,
  initialState,
  persistedState,
  snapshot,
  unwrap,
} from "../support/codingTaskSessionCloseout/index.js";
import { createCloseoutManagerAuthority } from "../support/codingTaskSessionCloseoutManager/index.js";

describe("CodingTask Session Delivery fail-closed validation", () => {
  it("只接受与 Closeout、CodingTask 和因果链完全一致的命令", () => {
    const fixture = createFixture();

    expect(
      validateCodingTaskSessionDeliveryAuthority(fixture.command, fixture.state, fixture.aggregate),
    ).toEqual({ status: ResultStatus.Success, value: undefined });
    const driftedVersion = validateCodingTaskSessionDeliveryAuthority(
      fixture.command,
      fixture.state,
      { ...fixture.aggregate, version: fixture.aggregate.version + 1 },
    );
    expectFailure(driftedVersion, HarnessErrorCode.VersionConflict);
    const driftedCausation = validateCodingTaskSessionDeliveryAuthority(
      { ...fixture.command, causationId: "unrelated-command" },
      fixture.state,
      fixture.aggregate,
    );
    expectFailure(driftedCausation, HarnessErrorCode.PreconditionNotMet);
  });

  it("拒绝未解析、来源漂移或摘要漂移的 Effective Closeout", () => {
    const fixture = createFixture();
    const unresolved = resolveCodingTaskSessionDeliveryCheckpoint(fixture.command, {
      status: CodingTaskSessionEffectiveCloseoutStatus.Unresolved,
      reason: CodingTaskSessionEffectiveCloseoutUnresolvedReason.RecoveryMissing,
    });
    expectFailure(unresolved, HarnessErrorCode.PreconditionNotMet);

    const sourceDrift = resolveCodingTaskSessionDeliveryCheckpoint(fixture.command, {
      status: CodingTaskSessionEffectiveCloseoutStatus.Resolved,
      source: CodingTaskSessionEffectiveCloseoutSource.Recovery,
      checkpoint: fixture.checkpoint,
    });
    expectFailure(sourceDrift, HarnessErrorCode.PreconditionNotMet);

    const digestDrift = resolveCodingTaskSessionDeliveryCheckpoint(fixture.command, {
      status: CodingTaskSessionEffectiveCloseoutStatus.Resolved,
      source: CodingTaskSessionEffectiveCloseoutSource.Original,
      checkpoint: {
        ...fixture.checkpoint,
        bindingDigest: digestOf({ checkpoint: "drifted" }),
      },
    });
    expectFailure(digestDrift, HarnessErrorCode.PreconditionNotMet);
  });

  it("锁内新鲜 Checkpoint 必须与 Effective Checkpoint 全字段一致", () => {
    const fixture = createFixture();
    expect(
      validateFreshCodingTaskSessionDeliveryCheckpoint(fixture.checkpoint, fixture.checkpoint),
    ).toEqual({ status: ResultStatus.Success, value: undefined });

    const drifted = validateFreshCodingTaskSessionDeliveryCheckpoint(fixture.checkpoint, {
      ...fixture.checkpoint,
      checkpoint: {
        ...fixture.checkpoint.checkpoint,
        changedPaths: [...fixture.checkpoint.checkpoint.changedPaths].reverse(),
      },
    });
    expectFailure(drifted, HarnessErrorCode.PreconditionNotMet);
  });

  it("活动 Implementation 首次提交，精确已提交状态只允许幂等接纳", () => {
    const fixture = createFixture();
    expect(
      classifyCodingTaskSessionDeliverySubmission(
        fixture.aggregate,
        fixture.state.attemptNumber,
        fixture.checkpoint,
      ),
    ).toEqual({
      status: ResultStatus.Success,
      value: CodingTaskSessionDeliverySubmissionDisposition.SubmitRequired,
    });

    const submitted: CodingTaskAggregate = {
      ...fixture.aggregate,
      phase: CodingTaskPhase.Verification,
      attempts: [
        {
          ...fixture.aggregate.attempts[0]!,
          finishedAt: fixture.state.updatedAt,
          outcome: CodingTaskAttemptOutcome.Succeeded,
          targetRevision: fixture.checkpoint.checkpoint.targetRevision,
          changedPaths: fixture.checkpoint.checkpoint.changedPaths,
        },
      ],
    };
    expect(
      classifyCodingTaskSessionDeliverySubmission(
        submitted,
        fixture.state.attemptNumber,
        fixture.checkpoint,
      ),
    ).toEqual({
      status: ResultStatus.Success,
      value: CodingTaskSessionDeliverySubmissionDisposition.AlreadySubmitted,
    });
  });
});

function createFixture() {
  const currentSnapshot = snapshot();
  const state = checkpointBoundState(
    persistedState(initialState(), currentSnapshot),
    "2026-07-26T00:00:02.000Z",
  );
  const aggregate = createCloseoutManagerAuthority().codingTask.aggregate;
  const currentCheckpoint = checkpoint(currentSnapshot);
  const payload = {
    workspaceId: state.workspaceId,
    sessionId: state.sessionId,
    expectedCheckpointBindingDigest: currentCheckpoint.bindingDigest,
    expectedEffectiveSource: CodingTaskSessionEffectiveCloseoutSource.Original,
  };
  const command = unwrap(
    parseCodingTaskSessionDeliverySubmissionCommand(
      {
        schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
        commandId: "delivery-validation-command",
        commandType: CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE,
        aggregateType: CODING_TASK_AGGREGATE_TYPE,
        aggregateId: state.codingTaskId,
        expectedVersion: aggregate.version,
        idempotencyKey: "delivery-validation-command",
        requestDigest: digestOf(payload),
        actor: { kind: ActorKind.Agent, actorId: state.actor.actorId },
        authorizationContext: {},
        correlationId: state.correlationId,
        causationId: state.commandId,
        submittedAt: "2026-07-26T00:00:03.000Z",
        payload,
      },
      digest,
    ),
  );
  return { aggregate, checkpoint: currentCheckpoint, command, state };
}

function expectFailure(
  result: { readonly status: ResultStatus; readonly error?: { readonly code: HarnessErrorCode } },
  code: HarnessErrorCode,
): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error?.code).toBe(code);
}
