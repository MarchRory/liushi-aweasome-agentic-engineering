import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import {
  VerificationKind,
  VerificationRequirement,
  validateVerificationPlan,
} from "../../src/domain/verification/index.js";

function createPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    planId: "plan-1",
    repositoryId: "verification-repository",
    worktreeId: "worktree-1",
    baseRevision: "base-revision",
    targetRevision: "target-revision",
    checks: [
      {
        checkId: "build",
        kind: VerificationKind.Build,
        requirement: VerificationRequirement.Required,
        command: {
          executable: "pnpm",
          args: ["build"],
          workingDirectory: "",
          allowedEnvironmentKeys: ["CI"],
        },
        timeoutMs: 1_000,
        retryable: false,
      },
    ],
    ...overrides,
  };
}

describe("Verification Plan validation", () => {
  it("规范化有效 Plan 并保留封闭枚举值", () => {
    const result = validateVerificationPlan(createPlan());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.repositoryId).toBe("verification-repository");
    expect(result.value.checks[0]?.kind).toBe(VerificationKind.Build);
  });

  const baseCheck = (createPlan()["checks"] as unknown[])[0] as Record<string, unknown>;

  it.each([
    [
      "拒绝未按 checkId 排序的检查",
      {
        checks: [
          baseCheck,
          {
            checkId: "aaa",
            kind: VerificationKind.Lint,
            requirement: VerificationRequirement.Advisory,
            command: {
              executable: "pnpm",
              args: ["lint"],
              workingDirectory: "",
              allowedEnvironmentKeys: [],
            },
            timeoutMs: 1_000,
            retryable: false,
          },
        ],
      },
    ],
    [
      "拒绝路径穿越",
      {
        checks: [
          {
            ...baseCheck,
            command: {
              executable: "pnpm",
              args: ["build"],
              workingDirectory: "../outside",
              allowedEnvironmentKeys: ["CI"],
            },
          },
        ],
      },
    ],
    [
      "拒绝不安全环境变量名",
      {
        checks: [
          {
            ...baseCheck,
            command: {
              executable: "pnpm",
              args: ["build"],
              workingDirectory: "",
              allowedEnvironmentKeys: ["CI=secret"],
            },
          },
        ],
      },
    ],
  ])("%s", (_caseName, overrides) => {
    const result = validateVerificationPlan(createPlan(overrides));

    expect(result.status).toBe(ResultStatus.Failure);
  });
});
