import type { CodingTaskAggregate } from "../../contracts/index.js";
import {
  CodingTaskAttemptOutcome,
  CodingTaskPhase,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
  FailureTaxonomy,
} from "../../enums/index.js";
import type {
  AttemptFinishedEvent,
  AttemptStartedEvent,
  VerificationFinishedEvent,
  VerificationRequestedEvent,
} from "../../events/index.js";
import { invalidTransition, corrupt } from "./codingTaskReducerErrors.js";

/** 应用 AttemptStarted 事件并保持 Attempt 串行不变量。 */
export function applyAttemptStarted(
  aggregate: CodingTaskAggregate,
  event: AttemptStartedEvent,
): CodingTaskAggregate {
  assertActiveImplementation(aggregate, "AttemptStarted");
  const current = aggregate.attempts.at(-1);
  if (current !== undefined) {
    if (current.finishedAt === undefined || current.outcome === undefined) {
      throw invalidTransition("上一个 Attempt 尚未完成，不能开始新的 Attempt。", "attemptNumber");
    }
    if (
      current.outcome === CodingTaskAttemptOutcome.Succeeded &&
      current.verificationOutcome === undefined
    ) {
      throw invalidTransition("Succeeded Attempt 必须先请求 Verification。", "attemptNumber");
    }
  }
  const expected = aggregate.attempts.length + 1;
  if (
    event.payload.attemptNumber !== expected ||
    !Number.isInteger(event.payload.attemptNumber) ||
    event.payload.attemptNumber < 1
  ) {
    throw corrupt("Attempt 序号不连续。", "attemptNumber");
  }
  return {
    ...aggregate,
    attempts: [...aggregate.attempts, { number: expected, startedAt: event.occurredAt }],
    version: event.sequence,
    updatedAt: event.occurredAt,
  };
}

/** 应用 AttemptFinished 事件并按照结果矩阵决定是否等待 Human。 */
export function applyAttemptFinished(
  aggregate: CodingTaskAggregate,
  event: AttemptFinishedEvent,
): CodingTaskAggregate {
  assertActiveImplementation(aggregate, "AttemptFinished");
  const current = aggregate.attempts.at(-1);
  if (
    current === undefined ||
    current.finishedAt !== undefined ||
    current.outcome !== undefined ||
    current.number !== event.payload.attemptNumber
  ) {
    throw invalidTransition("AttemptFinished 必须匹配当前未完成 Attempt。", "attemptNumber");
  }
  assertAttemptOutcome(event.payload.outcome, event.payload.failureTaxonomy);
  const attempts = [
    ...aggregate.attempts.slice(0, -1),
    {
      ...current,
      finishedAt: event.occurredAt,
      outcome: event.payload.outcome,
      ...(event.payload.failureTaxonomy === undefined
        ? {}
        : { failureTaxonomy: event.payload.failureTaxonomy }),
    },
  ];
  return {
    ...aggregate,
    attempts,
    runState: isHumanBlocked(event.payload.outcome, event.payload.failureTaxonomy)
      ? CodingTaskRunState.WaitingHuman
      : CodingTaskRunState.Active,
    version: event.sequence,
    updatedAt: event.occurredAt,
  };
}

/** 应用 VerificationRequested 事件并进入验证阶段。 */
export function applyVerificationRequested(
  aggregate: CodingTaskAggregate,
  event: VerificationRequestedEvent,
): CodingTaskAggregate {
  assertActiveImplementation(aggregate, "VerificationRequested");
  const current = aggregate.attempts.at(-1);
  if (
    current === undefined ||
    current.number !== event.payload.attemptNumber ||
    current.outcome !== CodingTaskAttemptOutcome.Succeeded ||
    current.verificationOutcome !== undefined
  ) {
    throw invalidTransition(
      "只有未验证的 Succeeded Attempt 才能请求 Verification。",
      "attemptNumber",
    );
  }
  return {
    ...aggregate,
    phase: CodingTaskPhase.Verification,
    version: event.sequence,
    updatedAt: event.occurredAt,
  };
}

/** 应用 VerificationFinished 事件并进入完成、修复或 Human 阻塞状态。 */
export function applyVerificationFinished(
  aggregate: CodingTaskAggregate,
  event: VerificationFinishedEvent,
): CodingTaskAggregate {
  if (
    aggregate.phase !== CodingTaskPhase.Verification ||
    aggregate.runState !== CodingTaskRunState.Active
  ) {
    throw invalidTransition("当前状态不允许接纳 Verification 结果。", "runState");
  }
  const current = aggregate.attempts.at(-1);
  if (
    current === undefined ||
    current.number !== event.payload.attemptNumber ||
    current.outcome !== CodingTaskAttemptOutcome.Succeeded ||
    current.verificationOutcome !== undefined
  ) {
    throw invalidTransition(
      "VerificationFinished 必须匹配当前未验证的 Succeeded Attempt。",
      "attemptNumber",
    );
  }
  assertVerificationOutcome(event.payload.outcome, event.payload.failureTaxonomy);
  const attempts = [
    ...aggregate.attempts.slice(0, -1),
    {
      ...current,
      verificationOutcome: event.payload.outcome,
      ...(event.payload.failureTaxonomy === undefined
        ? {}
        : { verificationFailureTaxonomy: event.payload.failureTaxonomy }),
    },
  ];
  const passed = event.payload.outcome === CodingTaskVerificationOutcome.Passed;
  const implementationDefect =
    event.payload.failureTaxonomy === FailureTaxonomy.ImplementationDefect;
  return {
    ...aggregate,
    attempts,
    phase: passed ? CodingTaskPhase.Verification : CodingTaskPhase.Implementation,
    runState: passed
      ? CodingTaskRunState.Completed
      : implementationDefect
        ? CodingTaskRunState.Active
        : CodingTaskRunState.WaitingHuman,
    version: event.sequence,
    updatedAt: event.occurredAt,
  };
}

function assertActiveImplementation(aggregate: CodingTaskAggregate, eventName: string): void {
  if (
    aggregate.phase !== CodingTaskPhase.Implementation ||
    aggregate.runState !== CodingTaskRunState.Active
  ) {
    throw invalidTransition(`${eventName} 的前置状态不允许执行。`, "runState");
  }
}

function assertAttemptOutcome(
  outcome: CodingTaskAttemptOutcome,
  failureTaxonomy: FailureTaxonomy | undefined,
): void {
  switch (outcome) {
    case CodingTaskAttemptOutcome.Succeeded:
      if (failureTaxonomy !== undefined)
        throw corrupt("Succeeded 不能携带失败分类。", "failureTaxonomy");
      return;
    case CodingTaskAttemptOutcome.Failed:
      if (
        failureTaxonomy !== FailureTaxonomy.ImplementationDefect &&
        failureTaxonomy !== FailureTaxonomy.RequirementOrSolutionGap &&
        failureTaxonomy !== FailureTaxonomy.EnvironmentFailure
      ) {
        throw corrupt("Failed 只能使用明确的实现、需求或环境失败分类。", "failureTaxonomy");
      }
      return;
    case CodingTaskAttemptOutcome.OutcomeUnknown:
      if (failureTaxonomy !== FailureTaxonomy.OutcomeUnknown)
        throw corrupt("OutcomeUnknown 必须使用 OutcomeUnknown 分类。", "failureTaxonomy");
      return;
    default:
      throw corrupt("Attempt Outcome 未知。", "outcome");
  }
}

function assertVerificationOutcome(
  outcome: CodingTaskVerificationOutcome,
  failureTaxonomy: FailureTaxonomy | undefined,
): void {
  switch (outcome) {
    case CodingTaskVerificationOutcome.Passed:
      if (failureTaxonomy !== undefined)
        throw corrupt("Passed 不能携带失败分类。", "failureTaxonomy");
      return;
    case CodingTaskVerificationOutcome.Failed:
      if (
        failureTaxonomy !== FailureTaxonomy.ImplementationDefect &&
        failureTaxonomy !== FailureTaxonomy.RequirementOrSolutionGap &&
        failureTaxonomy !== FailureTaxonomy.EnvironmentFailure
      ) {
        throw corrupt("Verification Failed 只能使用明确失败分类。", "failureTaxonomy");
      }
      return;
    case CodingTaskVerificationOutcome.OutcomeUnknown:
      if (failureTaxonomy !== FailureTaxonomy.OutcomeUnknown)
        throw corrupt(
          "Verification OutcomeUnknown 必须使用 OutcomeUnknown 分类。",
          "failureTaxonomy",
        );
      return;
    default:
      throw corrupt("Verification Outcome 未知。", "outcome");
  }
}

function isHumanBlocked(
  outcome: CodingTaskAttemptOutcome,
  failureTaxonomy: FailureTaxonomy | undefined,
): boolean {
  return (
    outcome === CodingTaskAttemptOutcome.OutcomeUnknown ||
    failureTaxonomy === FailureTaxonomy.RequirementOrSolutionGap ||
    failureTaxonomy === FailureTaxonomy.EnvironmentFailure
  );
}
