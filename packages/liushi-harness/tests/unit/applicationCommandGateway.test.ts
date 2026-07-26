import { describe, expect, it } from "vitest";

import {
  ApplicationCommandGateway,
  CommandErrorCode,
  CommandReservationDisposition,
  CommandStatus,
  type CommandHandler,
  type CommandReservationStore,
} from "../../src/application/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
} from "../../src/common/index.js";

describe("Application Command Gateway", () => {
  it("Handler 成功后提交 Committed Receipt", async () => {
    const store = completingStore();
    const gateway = new ApplicationCommandGateway(store, immediateDelay);
    const result = await gateway.execute(command(), committedHandler);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 3 },
    });
  });

  it("已有 Receipt 时不再次调用 Handler", async () => {
    let calls = 0;
    const store: CommandReservationStore = {
      reserve: () =>
        Promise.resolve(
          success({
            disposition: CommandReservationDisposition.Resolved,
            receipt: {
              schemaVersion: "1.0.0",
              commandId: "command-1",
              requestDigest: digest("a"),
              status: CommandStatus.Committed,
              committedVersion: 2,
            },
          }),
        ),
      complete: (_command, receipt) => Promise.resolve(success(receipt)),
    };
    const result = await new ApplicationCommandGateway(store, immediateDelay).execute(command(), {
      execute: () => {
        calls += 1;
        return Promise.resolve(success({ committedVersion: 99 }));
      },
    });

    expect(result.status).toBe(ResultStatus.Success);
    expect(calls).toBe(0);
  });

  it("Handler 已执行但 Receipt 写入失败时返回 OutcomeUnknown", async () => {
    const store: CommandReservationStore = {
      reserve: () =>
        Promise.resolve(success({ disposition: CommandReservationDisposition.Acquired })),
      complete: () =>
        Promise.resolve(
          failure(
            new HarnessError(
              HarnessErrorCode.CommandGatewayCommitOutcomeUnknown,
              "receipt unavailable",
            ),
          ),
        ),
    };
    const result = await new ApplicationCommandGateway(store, immediateDelay).execute(
      command(),
      committedHandler,
    );

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CommandStatus.OutcomeUnknown,
        errorCode: CommandErrorCode.OutcomeUnknown,
      },
    });
  });

  it("Receipt 首次提交遇到未知态时只重试 Completion，不重复 Handler", async () => {
    let handlerCalls = 0;
    let completionCalls = 0;
    const store: CommandReservationStore = {
      reserve: () =>
        Promise.resolve(success({ disposition: CommandReservationDisposition.Acquired })),
      complete: (_command, receipt) => {
        completionCalls += 1;
        return Promise.resolve(
          completionCalls === 1
            ? failure(
                new HarnessError(
                  HarnessErrorCode.CommandGatewayCommitOutcomeUnknown,
                  "receipt lock unavailable",
                ),
              )
            : success(receipt),
        );
      },
    };
    const result = await new ApplicationCommandGateway(store, immediateDelay).execute(command(), {
      execute: () => {
        handlerCalls += 1;
        return Promise.resolve(success({ committedVersion: 3 }));
      },
    });

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 3 },
    });
    expect(handlerCalls).toBe(1);
    expect(completionCalls).toBe(2);
  });

  it("将确定性版本冲突映射为 Conflict Receipt", async () => {
    const handler: CommandHandler = {
      execute: () =>
        Promise.resolve(
          failure(new HarnessError(HarnessErrorCode.VersionConflict, "stale aggregate")),
        ),
    };
    const result = await new ApplicationCommandGateway(completingStore(), immediateDelay).execute(
      command(),
      handler,
    );

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CommandStatus.Conflict,
        errorCode: CommandErrorCode.VersionConflict,
      },
    });
  });

  it.each([
    HarnessErrorCode.HookBindingCommitOutcomeUnknown,
    HarnessErrorCode.HookBindingLockReleaseUnknown,
    HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown,
    HarnessErrorCode.CodingTaskSessionAdmissionLockReleaseUnknown,
  ])("将 Runtime 持久化未知结果 %s 映射为 OutcomeUnknown Receipt", async (errorCode) => {
    const result = await new ApplicationCommandGateway(completingStore(), immediateDelay).execute(
      command(),
      {
        execute: () =>
          Promise.resolve(failure(new HarnessError(errorCode, "session admission unknown"))),
      },
    );

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CommandStatus.OutcomeUnknown,
        errorCode: CommandErrorCode.OutcomeUnknown,
      },
    });
  });

  it("锁不可用映射为 ResourceUnavailable", async () => {
    const handler: CommandHandler = {
      execute: () =>
        Promise.resolve(
          failure(new HarnessError(HarnessErrorCode.LockUnavailable, "resource is busy")),
        ),
    };
    const result = await new ApplicationCommandGateway(completingStore(), immediateDelay).execute(
      command(),
      handler,
    );

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CommandStatus.Rejected,
        errorCode: CommandErrorCode.ResourceUnavailable,
      },
    });
  });
});

const immediateDelay = { wait: () => Promise.resolve() };
const committedHandler: CommandHandler = {
  execute: () => Promise.resolve(success({ committedVersion: 3 })),
};

function completingStore(): CommandReservationStore {
  return {
    reserve: () =>
      Promise.resolve(success({ disposition: CommandReservationDisposition.Acquired })),
    complete: (_command, receipt) => Promise.resolve(success(receipt)),
  };
}

function command() {
  return {
    schemaVersion: "1.0.0",
    commandId: "command-1",
    commandType: "task.propose",
    aggregateType: "task",
    aggregateId: "task-1",
    expectedVersion: 0,
    idempotencyKey: "proposal-1",
    requestDigest: digest("a"),
    actor: { kind: ActorKind.Agent, actorId: "planner" },
    authorizationContext: {},
    correlationId: "correlation-1",
    submittedAt: "2026-07-12T00:00:00.000Z",
    payload: {},
  };
}

function digest(character: string): ContentDigest {
  return `sha256:${character.repeat(64)}` as ContentDigest;
}
