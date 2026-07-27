import { describe, expect, it, vi } from "vitest";

import { CodingTaskSessionEffectiveCloseoutResolver } from "#application/codingTaskSessionCloseoutRecovery/effectiveResolver/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus, failure, success } from "#common/index.js";

import {
  SESSION_ID,
  WORKSPACE_ID,
  createResolverFixture,
  type ResolverFixture,
} from "./fixture.js";

const INPUT = { workspaceId: WORKSPACE_ID, sessionId: SESSION_ID };

function createResolver(fixture: ResolverFixture) {
  return new CodingTaskSessionEffectiveCloseoutResolver(fixture.dependencies);
}

function expectFailureCode(
  result: Awaited<ReturnType<CodingTaskSessionEffectiveCloseoutResolver["resolve"]>>,
  code: HarnessErrorCode,
): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}

describe("CodingTaskSessionEffectiveCloseoutResolver failures", () => {
  it("Store failure 原样传播，Store throw 转 IoFailure", async () => {
    const fixture = createResolverFixture();
    const storeFailure = failure(new HarnessError(HarnessErrorCode.CorruptStore, "corrupt"));
    vi.spyOn(fixture.closeoutStateStore, "load").mockResolvedValue(storeFailure);
    expect(await createResolver(fixture).resolve(INPUT)).toBe(storeFailure);

    vi.spyOn(fixture.closeoutStateStore, "load").mockRejectedValue(new Error("closeout io"));
    expectFailureCode(await createResolver(fixture).resolve(INPUT), HarnessErrorCode.IoFailure);

    const recoveryFailure = failure(
      new HarnessError(HarnessErrorCode.CorruptStore, "recovery corrupt"),
    );
    vi.spyOn(fixture.closeoutStateStore, "load").mockResolvedValue(
      success(fixture.closeout.outcomeUnknown),
    );
    vi.spyOn(fixture.recoveryStateStore, "find").mockResolvedValue(recoveryFailure);
    expect(await createResolver(fixture).resolve(INPUT)).toBe(recoveryFailure);

    vi.spyOn(fixture.recoveryStateStore, "find").mockRejectedValue(new Error("recovery io"));
    expectFailureCode(await createResolver(fixture).resolve(INPUT), HarnessErrorCode.IoFailure);
  });

  it("Digest failure 原样传播，Digest throw 转 IoFailure", async () => {
    const fixture = createResolverFixture();
    const digestFailure = failure(new HarnessError(HarnessErrorCode.CorruptStore, "digest failed"));
    vi.spyOn(fixture.dependencies.digest, "calculate").mockReturnValue(digestFailure);
    expect(await createResolver(fixture).resolve(INPUT)).toBe(digestFailure);

    vi.spyOn(fixture.dependencies.digest, "calculate").mockImplementation(() => {
      throw new Error("digest io");
    });
    expectFailureCode(await createResolver(fixture).resolve(INPUT), HarnessErrorCode.IoFailure);
  });
});
