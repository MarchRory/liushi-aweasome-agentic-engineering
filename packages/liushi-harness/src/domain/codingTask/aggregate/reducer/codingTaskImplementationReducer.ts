import type { CodingTaskAggregate } from "../../contracts/index.js";
import {
  CodingTaskAttemptOutcome,
  CodingTaskPhase,
  CodingTaskRunState,
} from "../../enums/index.js";
import type { ImplementationSubmittedEvent } from "../../events/index.js";
import { corrupt, invalidTransition } from "./codingTaskReducerErrors.js";

/** 原子应用实现提交，完成当前 Attempt 并进入验证阶段。 */
export function applyImplementationSubmitted(
  aggregate: CodingTaskAggregate,
  event: ImplementationSubmittedEvent,
): CodingTaskAggregate {
  assertActiveImplementation(aggregate);
  const current = aggregate.attempts.at(-1);
  if (
    current === undefined ||
    current.finishedAt !== undefined ||
    current.outcome !== undefined ||
    current.number !== event.payload.attemptNumber
  ) {
    throw invalidTransition(
      "ImplementationSubmitted 必须匹配当前未完成 Attempt。",
      "attemptNumber",
    );
  }
  assertImplementationSubmission(event.payload.targetRevision, event.payload.changedPaths);
  return {
    ...aggregate,
    attempts: [
      ...aggregate.attempts.slice(0, -1),
      {
        ...current,
        finishedAt: event.occurredAt,
        outcome: CodingTaskAttemptOutcome.Succeeded,
        targetRevision: event.payload.targetRevision,
        changedPaths: [...event.payload.changedPaths],
      },
    ],
    phase: CodingTaskPhase.Verification,
    runState: CodingTaskRunState.Active,
    version: event.sequence,
    updatedAt: event.occurredAt,
  };
}

function assertActiveImplementation(aggregate: CodingTaskAggregate): void {
  if (
    aggregate.phase !== CodingTaskPhase.Implementation ||
    aggregate.runState !== CodingTaskRunState.Active
  ) {
    throw invalidTransition("ImplementationSubmitted 的前置状态不允许执行。", "runState");
  }
}

function assertImplementationSubmission(
  targetRevision: string,
  changedPaths: readonly string[],
): void {
  if (
    typeof targetRevision !== "string" ||
    targetRevision.trim() !== targetRevision ||
    !targetRevision
  ) {
    throw corrupt("targetRevision 必须是非空且无首尾空白的字符串。", "targetRevision");
  }
  if (changedPaths.length === 0) {
    throw corrupt("changedPaths 必须非空。", "changedPaths");
  }
  for (const path of changedPaths) assertCanonicalChangedPath(path);
}

function assertCanonicalChangedPath(path: string): void {
  if (
    typeof path !== "string" ||
    path.trim() !== path ||
    !path ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    path.includes("\\") ||
    /[<>:"|?*\u0000]/.test(path) ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw corrupt("changedPaths 只能包含规范相对 POSIX 路径。", "changedPaths");
  }
}
