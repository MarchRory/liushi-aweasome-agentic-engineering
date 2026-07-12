import { ActorKind, HarnessError, HarnessErrorCode } from "#common/index.js";

import type { CodingTaskAggregate } from "../../contracts/index.js";
import {
  CodingTaskControlAction,
  CodingTaskHumanResolution,
  CodingTaskRunState,
} from "../../enums/index.js";
import type { HumanControlAppliedEvent, HumanResolutionAppliedEvent } from "../../events/index.js";
import { invalidTransition, corrupt } from "./codingTaskReducerErrors.js";

/** 应用 HumanControlApplied 事件。 */
export function applyHumanControl(
  aggregate: CodingTaskAggregate,
  event: HumanControlAppliedEvent,
): CodingTaskAggregate {
  assertHumanActor(event.actor.kind, "CodingTask Human 控制必须由 Human 发起。");
  if (event.payload.requiresHuman !== true)
    throw corrupt("CodingTask Human 控制必须声明 requiresHuman=true。", "requiresHuman");
  if (event.payload.fromState !== aggregate.runState)
    throw corrupt("Human 控制的前置状态与 Aggregate 不一致。", "fromState");
  switch (event.payload.action) {
    case CodingTaskControlAction.Pause:
      if (
        aggregate.runState !== CodingTaskRunState.Active ||
        event.payload.toState !== CodingTaskRunState.Paused
      ) {
        throw invalidTransition("只有 Active CodingTask 可以 Pause。", "action");
      }
      break;
    case CodingTaskControlAction.Resume:
      if (
        aggregate.runState !== CodingTaskRunState.Paused ||
        event.payload.toState !== CodingTaskRunState.Active
      ) {
        throw invalidTransition("只有 Paused CodingTask 可以 Resume。", "action");
      }
      break;
    case CodingTaskControlAction.Cancel:
      if (
        aggregate.runState === CodingTaskRunState.Completed ||
        aggregate.runState === CodingTaskRunState.Cancelled ||
        event.payload.toState !== CodingTaskRunState.Cancelled
      ) {
        throw invalidTransition("终态 CodingTask 不能继续控制。", "action");
      }
      break;
    default:
      throw corrupt("CodingTask Human 控制动作未知。", "action");
  }
  return {
    ...aggregate,
    runState: event.payload.toState,
    version: event.sequence,
    updatedAt: event.occurredAt,
  };
}

/** 应用 HumanResolutionApplied 事件，显式恢复或取消 WaitingHuman。 */
export function applyHumanResolution(
  aggregate: CodingTaskAggregate,
  event: HumanResolutionAppliedEvent,
): CodingTaskAggregate {
  assertHumanActor(event.actor.kind, "CodingTask Human 处置必须由 Human 发起。");
  if (event.payload.requiresHuman !== true)
    throw corrupt("CodingTask Human 处置必须声明 requiresHuman=true。", "requiresHuman");
  if (
    aggregate.runState !== CodingTaskRunState.WaitingHuman ||
    event.payload.fromState !== CodingTaskRunState.WaitingHuman
  ) {
    throw invalidTransition("只有 WaitingHuman CodingTask 可以接受 Human 处置。", "fromState");
  }
  switch (event.payload.resolution) {
    case CodingTaskHumanResolution.ResumeImplementation:
      if (
        event.payload.toState !== CodingTaskRunState.Active ||
        event.payload.inputBindingSet === undefined
      ) {
        throw invalidTransition(
          "恢复实现必须绑定 Human 重新确认的 InputBindingSet。",
          "inputBindingSet",
        );
      }
      return {
        ...aggregate,
        inputBindingSet: event.payload.inputBindingSet,
        runState: CodingTaskRunState.Active,
        version: event.sequence,
        updatedAt: event.occurredAt,
      };
    case CodingTaskHumanResolution.Cancel:
      if (
        event.payload.toState !== CodingTaskRunState.Cancelled ||
        event.payload.inputBindingSet !== undefined
      ) {
        throw invalidTransition("取消处置不能恢复执行或携带新的 InputBindingSet。", "resolution");
      }
      return {
        ...aggregate,
        runState: CodingTaskRunState.Cancelled,
        version: event.sequence,
        updatedAt: event.occurredAt,
      };
    default:
      throw corrupt("CodingTask Human 处置动作未知。", "resolution");
  }
}

function assertHumanActor(actorKind: ActorKind, message: string): void {
  if (actorKind !== ActorKind.Human) {
    throw new HarnessError(HarnessErrorCode.OperationForbidden, message, { actorKind });
  }
}
