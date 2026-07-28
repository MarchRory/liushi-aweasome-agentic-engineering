import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CodingTaskDeliveryCompletionStage,
  CodingTaskDeliveryCompletionStatus,
  CommandStatus,
} from "../../src/application/index.js";
import { ResultStatus } from "../../src/common/index.js";
import {
  createDeliveryCompletionSetup,
  deliveryCompletionWorktreeRoot,
} from "../support/codingTaskDeliveryCompletion/index.js";

describe("CodingTaskDeliveryCompletionService", () => {
  it("只从权威 Aggregate 与 Plan Selector 构造 Verification Command", async () => {
    const setup = createDeliveryCompletionSetup();
    const result = await setup.service.execute(setup.input);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CodingTaskDeliveryCompletionStatus.ReviewReady },
    });
    expect(setup.verificationCompletion).toHaveBeenCalledOnce();
    const completionInput = setup.verificationCompletion.mock.calls[0]?.[0];
    expect(completionInput?.command).toMatchObject({
      aggregateId: setup.aggregate.codingTaskId,
      expectedVersion: setup.aggregate.version,
      correlationId: setup.input.deliveryCommand.correlationId,
      causationId: setup.input.deliveryCommand.commandId,
      payload: {
        workspaceId: setup.aggregate.workspaceId,
        attemptNumber: 1,
        plan: {
          baseRevision: setup.aggregate.baseRevision,
          targetRevision: setup.aggregate.attempts[0]?.targetRevision,
        },
      },
    });
    expect(completionInput?.runtime).toEqual({
      worktreeRoot: deliveryCompletionWorktreeRoot,
    });
  });

  it("静态 Verification 元数据无效时在 Delivery 前拒绝", async () => {
    const setup = createDeliveryCompletionSetup();
    const result = await setup.service.execute({
      ...setup.input,
      verification: { ...setup.input.verification, planId: "" },
    });

    expect(result.status).toBe(ResultStatus.Failure);
    expect(setup.deliverySubmission).not.toHaveBeenCalled();
  });

  it("调用方 Runtime Root 与权威受管 Worktree 不一致时停止", async () => {
    const setup = createDeliveryCompletionSetup();
    const result = await setup.service.execute({
      ...setup.input,
      verification: {
        ...setup.input.verification,
        runtime: { worktreeRoot: resolve("untrusted-worktree") },
      },
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        details: { stage: CodingTaskDeliveryCompletionStage.RuntimeBinding },
      },
    });
    expect(setup.deliverySubmission).toHaveBeenCalledOnce();
    expect(setup.verificationCompletion).not.toHaveBeenCalled();
  });

  it("Runtime Root 是否等价完全委托给平台路径端口", async () => {
    const setup = createDeliveryCompletionSetup();
    setup.managedWorktreePath.hasSamePathIdentity.mockReturnValueOnce(true);
    const aliasRoot = resolve("worktree-path-alias");
    const result = await setup.service.execute({
      ...setup.input,
      verification: {
        ...setup.input.verification,
        runtime: { worktreeRoot: aliasRoot },
      },
    });

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CodingTaskDeliveryCompletionStatus.ReviewReady },
    });
    expect(setup.managedWorktreePath.hasSamePathIdentity).toHaveBeenCalledWith(
      deliveryCompletionWorktreeRoot,
      aliasRoot,
    );
  });

  it("Delivery OutcomeUnknown 时不进入任何后续阶段", async () => {
    const setup = createDeliveryCompletionSetup(CommandStatus.OutcomeUnknown);
    const result = await setup.service.execute(setup.input);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CodingTaskDeliveryCompletionStatus.OutcomeUnknown,
        stoppedStage: CodingTaskDeliveryCompletionStage.Delivery,
      },
    });
    expect(setup.codingTaskLoad).not.toHaveBeenCalled();
    expect(setup.verificationCompletion).not.toHaveBeenCalled();
  });
});
