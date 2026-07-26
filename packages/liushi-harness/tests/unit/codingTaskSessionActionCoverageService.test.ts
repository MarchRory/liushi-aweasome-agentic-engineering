import { describe, expect, it } from "vitest";

import {
  ActionJournalStatus,
  ActionResolution,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  SessionActionTraceDisposition,
  SessionActionTraceDropReason,
  CodingTaskSessionActionCoverageService,
  failure,
  type ActionJournalState,
  type SessionActionIntentRecord,
  type SessionActionObservationRecord,
  type Result,
} from "../../src/index.js";
import { createCoverageFixture } from "../support/codingTaskSessionActionCoverage/index.js";

describe("CodingTask Session Action/Trace Coverage Proof Service", () => {
  it("黄金路径包含 Committed、Recovered，并规范化 Action/Trace 摘要排序", async () => {
    const fixture = createCoverageFixture({ multiTrace: true });
    const result = await new CodingTaskSessionActionCoverageService(fixture.dependencies).execute(
      fixture.input,
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.actions.map((action) => action.actionId)).toEqual([
      "01ARZ3NDEKTSV4RRFFQ69G5FCY",
      "01ARZ3NDEKTSV4RRFFQ69G5FCZ",
    ]);
    const actionA = result.value.actions[0];
    expect(actionA?.traceObservationDigests).toEqual(
      [...(actionA?.traceObservationDigests ?? [])].sort(),
    );
    expect(result.value).not.toHaveProperty("journals");
    expect(result.value).not.toHaveProperty("traces");
    expect(fixture.calls.journal).toEqual([
      "01ARZ3NDEKTSV4RRFFQ69G5FCY",
      "01ARZ3NDEKTSV4RRFFQ69G5FCZ",
    ]);
    expect(fixture.calls.trace).toEqual(fixture.calls.journal);
  });

  it("拒绝调用方注入 Action IDs 的定位输入", async () => {
    const fixture = createCoverageFixture();
    const result = await new CodingTaskSessionActionCoverageService(fixture.dependencies).create({
      ...fixture.input,
      actionIds: ["caller-supplied"],
    } as never);

    expectFailure(result, HarnessErrorCode.InvalidInput);
    expect(fixture.calls.journal).toEqual([]);
    expect(fixture.calls.trace).toEqual([]);
  });

  it.each([
    [
      "Activation worktree",
      (fixture: ReturnType<typeof createCoverageFixture>) => {
        fixture.faults.activationRecord = {
          ...fixture.activation,
          worktreeId: "other-worktree",
        };
      },
    ],
    [
      "Admission binding",
      (fixture: ReturnType<typeof createCoverageFixture>) => {
        (
          fixture.admission as unknown as { activationBindingDigest: string }
        ).activationBindingDigest = "sha256:" + "d".repeat(64);
      },
    ],
    [
      "Admission session binding",
      (fixture: ReturnType<typeof createCoverageFixture>) => {
        (fixture.admission as unknown as { sessionBindingDigest: string }).sessionBindingDigest =
          "sha256:" + "d".repeat(64);
      },
    ],
    [
      "Intent provenance",
      (fixture: ReturnType<typeof createCoverageFixture>) => {
        const state = fixture.journals.get("01ARZ3NDEKTSV4RRFFQ69G5FCY")!;
        const intent = state.intent as SessionActionIntentRecord;
        fixture.journals.set("01ARZ3NDEKTSV4RRFFQ69G5FCY", {
          ...state,
          intent: {
            ...intent,
            sessionProvenance: { ...intent.sessionProvenance, attemptNumber: 2 },
          },
        });
      },
    ],
  ])("拒绝 %s 漂移", async (_name, mutate) => {
    const fixture = createCoverageFixture();
    mutate(fixture);
    const result = await new CodingTaskSessionActionCoverageService(fixture.dependencies).execute(
      fixture.input,
    );

    expectFailure(result, HarnessErrorCode.PreconditionNotMet);
  });

  it.each([
    [
      "非 Closing",
      (fixture: ReturnType<typeof createCoverageFixture>) => {
        (fixture.admission as unknown as { status: string }).status = "waiting_agent";
      },
    ],
    [
      "空 Action",
      (fixture: ReturnType<typeof createCoverageFixture>) => {
        (
          fixture.admission as unknown as { admittedActionIds: readonly string[] }
        ).admittedActionIds = [];
      },
    ],
    [
      "重复 Action",
      (fixture: ReturnType<typeof createCoverageFixture>) => {
        (
          fixture.admission as unknown as { admittedActionIds: readonly string[] }
        ).admittedActionIds = ["01ARZ3NDEKTSV4RRFFQ69G5FCY", "01ARZ3NDEKTSV4RRFFQ69G5FCY"];
      },
    ],
    [
      "存在 Pending",
      (fixture: ReturnType<typeof createCoverageFixture>) => {
        (fixture.admission as unknown as { pendingAdmission: object | null }).pendingAdmission = {
          actionId: "01ARZ3NDEKTSV4RRFFQ69G5FCY",
          intentDigest: "sha256:" + "d".repeat(64),
          executorSessionIdDigest: "sha256:" + "e".repeat(64),
        };
      },
    ],
    [
      "未 Claim Executor",
      (fixture: ReturnType<typeof createCoverageFixture>) => {
        (
          fixture.admission as unknown as {
            claimedExecutorSessionIdDigest: string | null;
          }
        ).claimedExecutorSessionIdDigest = null;
      },
    ],
  ])("拒绝 Admission %s", async (_name, mutate) => {
    const fixture = createCoverageFixture();
    mutate(fixture);
    const result = await new CodingTaskSessionActionCoverageService(fixture.dependencies).execute(
      fixture.input,
    );

    expectFailure(result, HarnessErrorCode.PreconditionNotMet);
    expect(fixture.calls.journal).toEqual([]);
  });

  it.each([
    [
      "Journal 非终态",
      (state: ActionJournalState) => ({ ...state, status: ActionJournalStatus.IntentRecorded }),
    ],
    ["缺 Observation", (state: ActionJournalState) => ({ ...state, observations: [] })],
    ["缺 Resolution", (state: ActionJournalState) => ({ ...state, resolutions: [] })],
    [
      "Dropped Trace",
      (state: ActionJournalState) =>
        withObservation(state, (observation) => ({
          ...observation,
          trace: {
            ...observation.trace,
            disposition: SessionActionTraceDisposition.Dropped,
            dropReason: SessionActionTraceDropReason.IoFailure,
          },
        })),
    ],
    [
      "旧 v2 缺 digest",
      (state: ActionJournalState) =>
        withObservation(state, (observation) => {
          return {
            ...observation,
            trace: { ...observation.trace, observationDigest: undefined },
          } as unknown as SessionActionObservationRecord;
        }),
    ],
  ])("拒绝 %s", async (_name, mutate) => {
    const fixture = createCoverageFixture();
    const actionId = "01ARZ3NDEKTSV4RRFFQ69G5FCY";
    fixture.journals.set(actionId, mutate(fixture.journals.get(actionId)!));
    const result = await new CodingTaskSessionActionCoverageService(fixture.dependencies).execute(
      fixture.input,
    );

    expectFailure(result, HarnessErrorCode.PreconditionNotMet);
  });

  it("拒绝中途已终结后仍继续追加 Observation 的伪造 Journal", async () => {
    const fixture = createCoverageFixture({ multiTrace: true });
    const actionId = "01ARZ3NDEKTSV4RRFFQ69G5FCY";
    const state = fixture.journals.get(actionId)!;
    fixture.journals.set(actionId, {
      ...state,
      resolutions: [
        { ...state.resolutions[0]!, resolution: ActionResolution.Committed },
        state.resolutions[1]!,
      ],
    });

    const result = await new CodingTaskSessionActionCoverageService(fixture.dependencies).execute(
      fixture.input,
    );

    expectFailure(result, HarnessErrorCode.PreconditionNotMet);
  });

  it("Trace query error 原样传播，并拒绝 skippedRecord", async () => {
    const fixture = createCoverageFixture();
    const error = new HarnessError(HarnessErrorCode.IoFailure, "trace query failed");
    fixture.faults.traceError = error;
    const propagated = await new CodingTaskSessionActionCoverageService(
      fixture.dependencies,
    ).execute(fixture.input);
    expect(propagated).toEqual({ status: ResultStatus.Failure, error });

    const skippedFixture = createCoverageFixture();
    skippedFixture.traces.set("01ARZ3NDEKTSV4RRFFQ69G5FCY", {
      ...skippedFixture.traces.get("01ARZ3NDEKTSV4RRFFQ69G5FCY")!,
      skippedRecordCount: 1,
    });
    const skipped = await new CodingTaskSessionActionCoverageService(
      skippedFixture.dependencies,
    ).execute(skippedFixture.input);
    expectFailure(skipped, HarnessErrorCode.PreconditionNotMet);
  });

  it.each(["missing", "duplicate", "extra", "content drift", "unknown field"])(
    "拒绝 Trace %s 或内容漂移",
    async (kind) => {
      const fixture = createCoverageFixture({ multiTrace: true });
      const actionId = "01ARZ3NDEKTSV4RRFFQ69G5FCY";
      const current = fixture.traces.get(actionId)!;
      const observations = [...current.observations];
      if (kind === "missing") observations.pop();
      if (kind === "duplicate") observations[1] = observations[0]!;
      if (kind === "extra")
        observations.push({ ...observations[0]!, spanId: "4".repeat(16) as never });
      if (kind === "content drift")
        observations[0] = { ...observations[0]!, operationName: "other" };
      if (kind === "unknown field") {
        observations[0] = { ...observations[0]!, unknown: true } as never;
      }
      fixture.traces.set(actionId, { observations, skippedRecordCount: 0 });
      const result = await new CodingTaskSessionActionCoverageService(fixture.dependencies).execute(
        fixture.input,
      );

      expectFailure(result, HarnessErrorCode.PreconditionNotMet);
    },
  );

  it.each(["activation", "admission", "journal", "trace"])(
    "原样传播 %s Port error",
    async (port) => {
      const fixture = createCoverageFixture();
      const error = new HarnessError(HarnessErrorCode.CorruptStore, `${port} unavailable`);
      if (port === "activation") fixture.faults.activationError = error;
      if (port === "admission") fixture.faults.admissionError = error;
      if (port === "journal") fixture.faults.journalError = error;
      if (port === "trace") fixture.faults.traceError = error;

      const result = await new CodingTaskSessionActionCoverageService(fixture.dependencies).execute(
        fixture.input,
      );

      expect(result).toEqual({ status: ResultStatus.Failure, error });
    },
  );

  it("原样传播 Content Digest Port error", async () => {
    const fixture = createCoverageFixture();
    const error = new HarnessError(HarnessErrorCode.IoFailure, "digest unavailable");
    const service = new CodingTaskSessionActionCoverageService({
      ...fixture.dependencies,
      contentDigest: {
        calculate(input) {
          return typeof input === "object" && input !== null && "traceId" in input
            ? failure(error)
            : fixture.digest.calculate(input);
        },
      },
    });

    const result = await service.execute(fixture.input);

    expect(result).toEqual({ status: ResultStatus.Failure, error });
  });
});

function withObservation(
  state: ActionJournalState,
  mutate: (observation: SessionActionObservationRecord) => SessionActionObservationRecord,
): ActionJournalState {
  const observation = state.observations[0] as SessionActionObservationRecord;
  return { ...state, observations: [mutate(observation)] };
}

function expectFailure(result: Result<unknown, HarnessError>, code: HarnessErrorCode): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}
