import { describe, expect, it, vi } from "vitest";

import {
  CodingTaskSessionCloseoutRecoveryResolution,
  CodingTaskSessionEffectiveCloseoutResolver,
  CodingTaskSessionEffectiveCloseoutSource,
  CodingTaskSessionEffectiveCloseoutStatus,
} from "#application/codingTaskSessionCloseoutRecovery/index.js";
import { CodingTaskSessionCloseoutRecoveryStateStatus } from "#application/codingTaskSessionCloseoutRecovery/state/index.js";
import { HarnessErrorCode, ResultStatus, success } from "#common/index.js";

import {
  SESSION_ID,
  WORKSPACE_ID,
  createRecoveryState,
  createResolverFixture,
  recoveryStatusContractViolation,
} from "./fixture.js";

const INPUT = { workspaceId: WORKSPACE_ID, sessionId: SESSION_ID };

describe("CodingTaskSessionEffectiveCloseoutResolver recovery", () => {
  it("成功解析 Blocked + RetryOnce Recovery Checkpoint", async () => {
    const fixture = createResolverFixture();
    const recovery = createRecoveryState({
      closeout: fixture.closeout.retryableBlocked,
      status: CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound,
      checkpoint: fixture.closeout.checkpoint,
      resolution: CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
    });
    vi.spyOn(fixture.closeoutStateStore, "load").mockResolvedValue(
      success(fixture.closeout.retryableBlocked),
    );
    vi.spyOn(fixture.recoveryStateStore, "find").mockResolvedValue(success(recovery));

    const result = await new CodingTaskSessionEffectiveCloseoutResolver(
      fixture.dependencies,
    ).resolve(INPUT);

    expect(result).toEqual(
      success({
        status: CodingTaskSessionEffectiveCloseoutStatus.Resolved,
        source: CodingTaskSessionEffectiveCloseoutSource.Recovery,
        checkpoint: fixture.closeout.checkpoint,
      }),
    );
  });

  it("Recovery Store 返回未知状态时报告 CorruptStore", async () => {
    const fixture = createResolverFixture();
    vi.spyOn(fixture.recoveryStateStore, "find").mockResolvedValue(
      success(recoveryStatusContractViolation(fixture.recovery)),
    );

    const result = await new CodingTaskSessionEffectiveCloseoutResolver(
      fixture.dependencies,
    ).resolve(INPUT);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.CorruptStore);
    }
  });
});
