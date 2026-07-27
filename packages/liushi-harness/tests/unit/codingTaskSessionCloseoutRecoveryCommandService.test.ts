import { describe, expect, it } from "vitest";

import { CommandStatus, type CommandReceipt } from "../../src/application/command/index.js";
import { ApplicationCommandGateway } from "../../src/application/commandGateway/index.js";
import { CodingTaskSessionCloseoutRecoveryCommandService } from "../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import {
  CommandReservationDisposition,
  type CommandReservationStore,
} from "../../src/application/ports/index.js";
import { ResultStatus, success } from "../../src/common/index.js";
import { createRecoveryHandlerHarness } from "../support/codingTaskSessionCloseoutRecoveryHandler/index.js";

describe("CodingTaskSessionCloseoutRecoveryCommandService", () => {
  it("经 Gateway reservation 提交 Receipt，幂等重放不再次进入 Handler", async () => {
    const harness = createRecoveryHandlerHarness();
    const service = new CodingTaskSessionCloseoutRecoveryCommandService(
      new ApplicationCommandGateway(rememberingStore(), immediateDelay),
      harness.handler,
    );

    const first = await service.execute(harness.command);
    const replay = await service.execute(harness.command);

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 2 },
    });
    expect(replay).toEqual(first);
    expect(harness.calls).toMatchObject({ execute: 1, release: 1 });
  });

  it("Repository Lock acquire 未知经 Gateway 映射为 OutcomeUnknown Receipt", async () => {
    const harness = createRecoveryHandlerHarness({ acquireThrow: true });
    const service = new CodingTaskSessionCloseoutRecoveryCommandService(
      new ApplicationCommandGateway(rememberingStore(), immediateDelay),
      harness.handler,
    );
    const result = await service.execute(harness.command);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.OutcomeUnknown },
    });
    expect(harness.calls).toMatchObject({ create: 0, replace: 0, execute: 0, release: 0 });
  });

  it("畸形输入在 Gateway 拒绝且不进入 Handler", async () => {
    const harness = createRecoveryHandlerHarness();
    const service = new CodingTaskSessionCloseoutRecoveryCommandService(
      new ApplicationCommandGateway(rememberingStore(), immediateDelay),
      harness.handler,
    );
    const result = await service.execute({});

    expect(result.status).toBe(ResultStatus.Failure);
    expect(harness.calls).toMatchObject({ create: 0, replace: 0, execute: 0, release: 0 });
  });
});

const immediateDelay = { wait: () => Promise.resolve() };

function rememberingStore(): CommandReservationStore {
  let receipt: CommandReceipt | null = null;
  return {
    reserve: () =>
      Promise.resolve(
        receipt === null
          ? success({ disposition: CommandReservationDisposition.Acquired })
          : success({ disposition: CommandReservationDisposition.Resolved, receipt }),
      ),
    complete: (_command, completed) => {
      receipt = completed;
      return Promise.resolve(success(completed));
    },
  };
}
