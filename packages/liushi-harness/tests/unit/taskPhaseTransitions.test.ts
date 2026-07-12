import { describe, expect, it } from "vitest";

import {
  HarnessErrorCode,
  ResultStatus,
  TaskPhase,
  canTransitionTaskPhase,
  transitionTaskPhase,
} from "../../src/index.js";

describe("TaskPhase 迁移", () => {
  it.each([
    [TaskPhase.Context, TaskPhase.Requirements],
    [TaskPhase.Requirements, TaskPhase.Planning],
    [TaskPhase.Planning, TaskPhase.Implementation],
    [TaskPhase.Implementation, TaskPhase.Verification],
    [TaskPhase.Verification, TaskPhase.Implementation],
    [TaskPhase.Verification, TaskPhase.Review],
    [TaskPhase.Review, TaskPhase.Learning],
    [TaskPhase.Learning, TaskPhase.Done],
  ])("允许 %s -> %s", (current, target) => {
    expect(canTransitionTaskPhase(current, target)).toBe(true);

    const result = transitionTaskPhase(current, target);

    expect(result).toEqual({ status: ResultStatus.Success, value: target });
  });

  it.each([
    [TaskPhase.Context, TaskPhase.Planning],
    [TaskPhase.Requirements, TaskPhase.Context],
    [TaskPhase.Planning, TaskPhase.Requirements],
    [TaskPhase.Planning, TaskPhase.Verification],
    [TaskPhase.Implementation, TaskPhase.Review],
    [TaskPhase.Verification, TaskPhase.Learning],
    [TaskPhase.Review, TaskPhase.Done],
    [TaskPhase.Learning, TaskPhase.Review],
    [TaskPhase.Done, TaskPhase.Context],
  ])("拒绝 %s -> %s", (current, target) => {
    expect(canTransitionTaskPhase(current, target)).toBe(false);

    const result = transitionTaskPhase(current, target);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidStateTransition);
      expect(result.error.details).toEqual({ current, target });
    }
  });
});
