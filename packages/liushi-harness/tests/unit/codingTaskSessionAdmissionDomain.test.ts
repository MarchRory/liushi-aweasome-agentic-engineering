import { describe, expect, it } from "vitest";

import {
  ResultStatus,
  parseContentDigest,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "../../src/common/index.js";
import {
  beginClosing,
  beginPending,
  CodingTaskSessionAdmissionStatus,
  commitPending,
  createCodingTaskSessionAdmissionState,
  markOutcomeUnknown,
  type CodingTaskSessionAdmissionState,
} from "../../src/domain/codingTaskSession/index.js";
import { parseCodingTaskSessionId } from "../../src/domain/codingTaskSession/index.js";
import { parseWorkspaceId } from "../../src/domain/workspace/index.js";

const workspaceId = parseWorkspaceId("workspace-1");
const sessionId = parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5FAV");
if (workspaceId.status === ResultStatus.Failure) throw workspaceId.error;
if (sessionId.status === ResultStatus.Failure) throw sessionId.error;
const workspace = workspaceId.value;
const session = sessionId.value;

const digestA = contentDigest("a");
const digestB = contentDigest("b");
const digestC = contentDigest("c");

describe("CodingTask Session Admission domain state", () => {
  it("creates waiting_agent state and commits a deduplicated pending admission", () => {
    const created = createState();
    expect(created.status).toBe(ResultStatus.Success);
    if (created.status === ResultStatus.Failure) return;
    expect(created.value.status).toBe(CodingTaskSessionAdmissionStatus.WaitingAgent);
    expect(created.value.version).toBe(0);

    const pending = beginPending(created.value, {
      actionId: "action-1",
      intentDigest: digestA,
      executorSessionIdDigest: digestB,
      updatedAt: "2026-07-23T00:00:01.000Z",
    });
    expect(pending.status).toBe(ResultStatus.Success);
    if (pending.status === ResultStatus.Failure) return;

    const committed = commitPending(pending.value, {
      actionId: "action-1",
      intentDigest: digestA,
      executorSessionIdDigest: digestB,
      updatedAt: "2026-07-23T00:00:02.000Z",
    });
    expect(committed.status).toBe(ResultStatus.Success);
    if (committed.status === ResultStatus.Failure) return;
    expect(committed.value.admittedActionIds).toEqual(["action-1"]);
    expect(committed.value.pendingAdmission).toBeNull();

    const duplicate = beginPending(committed.value, {
      actionId: "action-1",
      intentDigest: digestA,
      executorSessionIdDigest: digestB,
      updatedAt: "2026-07-23T00:00:03.000Z",
    });
    expect(duplicate.status).toBe(ResultStatus.Success);
    if (duplicate.status === ResultStatus.Failure) return;
    const duplicateCommit = commitPending(duplicate.value, {
      actionId: "action-1",
      intentDigest: digestA,
      executorSessionIdDigest: digestB,
      updatedAt: "2026-07-23T00:00:04.000Z",
    });
    expect(duplicateCommit.status).toBe(ResultStatus.Success);
    if (duplicateCommit.status === ResultStatus.Failure) return;
    expect(duplicateCommit.value.admittedActionIds).toEqual(["action-1"]);
  });

  it("rejects different executor claims and mismatched pending identity", () => {
    const created = expectState(createState());
    const pending = expectState(
      beginPending(created, {
        actionId: "action-1",
        intentDigest: digestA,
        executorSessionIdDigest: digestB,
        updatedAt: "2026-07-23T00:00:01.000Z",
      }),
    );
    expect(
      beginPending(pending, {
        actionId: "action-2",
        intentDigest: digestA,
        executorSessionIdDigest: digestC,
        updatedAt: "2026-07-23T00:00:02.000Z",
      }).status,
    ).toBe(ResultStatus.Failure);
    expect(
      commitPending(pending, {
        actionId: "action-1",
        intentDigest: digestC,
        executorSessionIdDigest: digestB,
        updatedAt: "2026-07-23T00:00:02.000Z",
      }).status,
    ).toBe(ResultStatus.Failure);
  });

  it("blocks closing while pending and preserves pending for outcome_unknown", () => {
    const created = expectState(createState());
    const pending = expectState(
      beginPending(created, {
        actionId: "action-1",
        intentDigest: digestA,
        executorSessionIdDigest: digestB,
        updatedAt: "2026-07-23T00:00:01.000Z",
      }),
    );
    expect(beginClosing(pending, { updatedAt: "2026-07-23T00:00:02.000Z" }).status).toBe(
      ResultStatus.Failure,
    );

    const unknown = expectState(
      markOutcomeUnknown(pending, { updatedAt: "2026-07-23T00:00:02.000Z" }),
    );
    expect(unknown.status).toBe(CodingTaskSessionAdmissionStatus.OutcomeUnknown);
    expect(unknown.pendingAdmission).toEqual(pending.pendingAdmission);
    expect(
      beginPending(unknown, {
        actionId: "action-2",
        intentDigest: digestA,
        executorSessionIdDigest: digestB,
        updatedAt: "2026-07-23T00:00:03.000Z",
      }).status,
    ).toBe(ResultStatus.Failure);
  });

  it("blocks new pending after closing and permits fail-closed outcome_unknown", () => {
    const closing = expectState(
      beginClosing(expectState(createState()), {
        updatedAt: "2026-07-23T00:00:01.000Z",
      }),
    );
    expect(closing.status).toBe(CodingTaskSessionAdmissionStatus.Closing);
    expect(
      beginPending(closing, {
        actionId: "action-1",
        intentDigest: digestA,
        executorSessionIdDigest: digestB,
        updatedAt: "2026-07-23T00:00:02.000Z",
      }).status,
    ).toBe(ResultStatus.Failure);

    const unknown = expectState(
      markOutcomeUnknown(closing, { updatedAt: "2026-07-23T00:00:03.000Z" }),
    );
    expect(unknown.status).toBe(CodingTaskSessionAdmissionStatus.OutcomeUnknown);
  });
});

function createState(): ReturnType<typeof createCodingTaskSessionAdmissionState> {
  return createCodingTaskSessionAdmissionState({
    workspaceId: workspace,
    sessionId: session,
    activationBindingDigest: digestA,
    sessionBindingDigest: digestB,
    updatedAt: "2026-07-23T00:00:00.000Z",
  });
}

function expectState(
  result: Result<CodingTaskSessionAdmissionState, HarnessError>,
): CodingTaskSessionAdmissionState {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function contentDigest(hexCharacter: string): ContentDigest {
  const parsed = parseContentDigest(`sha256:${hexCharacter.repeat(64)}`);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}
