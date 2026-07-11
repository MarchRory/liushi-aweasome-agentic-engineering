import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { TaskPhase } from "./taskPhase.js";

/** 判断 Task Phase 是否允许直接迁移到目标阶段。 */
export function canTransitionTaskPhase(current: TaskPhase, target: TaskPhase): boolean {
  switch (current) {
    case TaskPhase.Context:
      return target === TaskPhase.Requirements;
    case TaskPhase.Requirements:
      return target === TaskPhase.Planning;
    case TaskPhase.Planning:
      return target === TaskPhase.Implementation;
    case TaskPhase.Implementation:
      return target === TaskPhase.Verification;
    case TaskPhase.Verification:
      return target === TaskPhase.Implementation || target === TaskPhase.Review;
    case TaskPhase.Review:
      return target === TaskPhase.Learning;
    case TaskPhase.Learning:
      return target === TaskPhase.Done;
    case TaskPhase.Done:
      return false;
  }
}

/** 校验并返回目标 Task Phase。 */
export function transitionTaskPhase(
  current: TaskPhase,
  target: TaskPhase,
): Result<TaskPhase, HarnessError> {
  if (!canTransitionTaskPhase(current, target)) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidStateTransition,
        `Task phase cannot transition from ${current} to ${target}.`,
        { current, target },
      ),
    );
  }

  return success(target);
}
