import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import {
  VerificationFailureKind,
  VerificationKind,
  VerificationRequirement,
  VerificationSelectionMode,
  VerificationStatus,
  validateEvidenceBundle,
  validateProjectVerificationChecks,
  validateVerificationCheck,
  validateVerificationPlan,
} from "../../src/domain/verification/index.js";

function createPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    planId: "plan-1",
    repositoryId: "verification-repository",
    worktreeId: "worktree-1",
    expectedBranchName: "main",
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

describe("Project Verification Check validation", () => {
  const projectCheck = {
    ...(createPlan()["checks"] as Record<string, unknown>[])[0],
    selectionMode: VerificationSelectionMode.Always,
    validatorIds: ["validator.build"],
  };

  it("公开并复用单个 VerificationCheck 校验", () => {
    expect(validateVerificationCheck(projectCheck).status).toBe(ResultStatus.Success);
  });

  it("接受按稳定顺序声明的项目 Check", () => {
    const result = validateProjectVerificationChecks([
      projectCheck,
      {
        ...projectCheck,
        checkId: "lint",
        kind: VerificationKind.Lint,
        requirement: VerificationRequirement.Conditional,
        selectionMode: VerificationSelectionMode.ChangedPaths,
        pathGlobs: ["src/**/*.ts"],
        validatorIds: ["validator.lint"],
      },
    ]);

    expect(result.status).toBe(ResultStatus.Success);
  });

  it.each([
    ["拒绝空 Check 集合", []],
    [
      "拒绝缺少 Required Check",
      [
        {
          ...projectCheck,
          requirement: VerificationRequirement.Conditional,
          selectionMode: VerificationSelectionMode.ChangedPaths,
          pathGlobs: ["src/**/*.ts"],
        },
      ],
    ],
    ["拒绝重复 Check ID", [projectCheck, projectCheck]],
    [
      "拒绝未按 Check ID 排序",
      [
        { ...projectCheck, checkId: "z-check" },
        { ...projectCheck, checkId: "a-check" },
      ],
    ],
    [
      "拒绝未排序 Validator ID",
      [{ ...projectCheck, validatorIds: ["validator.z", "validator.a"] }],
    ],
    [
      "拒绝重复 Path Glob",
      [
        {
          ...projectCheck,
          requirement: VerificationRequirement.Conditional,
          selectionMode: VerificationSelectionMode.ChangedPaths,
          pathGlobs: ["src/**/*.ts", "src/**/*.ts"],
        },
      ],
    ],
    [
      "拒绝非法 Path Glob",
      [
        {
          ...projectCheck,
          requirement: VerificationRequirement.Conditional,
          selectionMode: VerificationSelectionMode.ChangedPaths,
          pathGlobs: ["../src/**/*.ts"],
        },
      ],
    ],
    [
      "拒绝 Required 使用 changed_paths",
      [
        {
          ...projectCheck,
          selectionMode: VerificationSelectionMode.ChangedPaths,
          pathGlobs: ["src/**/*.ts"],
        },
      ],
    ],
    ["拒绝 always 声明 Path Glob", [{ ...projectCheck, pathGlobs: ["src/**/*.ts"] }]],
    [
      "拒绝 changed_paths 缺少 Path Glob",
      [
        {
          ...projectCheck,
          requirement: VerificationRequirement.Conditional,
          selectionMode: VerificationSelectionMode.ChangedPaths,
        },
      ],
    ],
  ])("%s", (_caseName, checks) => {
    expect(validateProjectVerificationChecks(checks).status).toBe(ResultStatus.Failure);
  });
});

describe("EvidenceBundle validation", () => {
  it("接受摘要、Revision 和 EvidenceRef 一致的 Bundle", () => {
    const result = validateEvidenceBundle(createEvidenceBundle());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.checks[0]?.outputDigest).toMatch(/^sha256:/u);
  });

  it.each([
    [
      "拒绝 Evidence 摘要与 Check 输出摘要不一致",
      {
        checks: [
          {
            ...createEvidenceCheck(),
            evidence: {
              ...createEvidenceCheck().evidence,
              contentDigest: `sha256:${"2".repeat(64)}`,
            },
          },
        ],
      },
    ],
    [
      "拒绝 Evidence Revision 与 Bundle Target 不一致",
      {
        checks: [
          {
            ...createEvidenceCheck(),
            evidence: { ...createEvidenceCheck().evidence, revision: "other-revision" },
          },
        ],
      },
    ],
    ["拒绝重复 Check ID", { checks: [createEvidenceCheck(), createEvidenceCheck()] }],
    ["拒绝总体状态与必需 Check 不一致", { status: VerificationStatus.Passed }],
  ])("%s", (_caseName, overrides) => {
    expect(validateEvidenceBundle(createEvidenceBundle(overrides)).status).toBe(
      ResultStatus.Failure,
    );
  });
});

function createEvidenceBundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    verificationRunId: "run-1",
    planId: "plan-1",
    repositoryId: "verification-repository",
    worktreeId: "worktree-1",
    baseRevision: "base-revision",
    targetRevision: "target-revision",
    planDigest: `sha256:${"a".repeat(64)}`,
    status: VerificationStatus.Failed,
    generatedAt: "2026-07-12T00:00:02.000Z",
    checks: [createEvidenceCheck()],
    ...overrides,
  };
}

function createEvidenceCheck() {
  const outputDigest = `sha256:${"1".repeat(64)}`;
  return {
    checkId: "build",
    kind: VerificationKind.Build,
    requirement: VerificationRequirement.Required,
    status: VerificationStatus.Failed,
    failureKind: VerificationFailureKind.CommandFailed,
    exitCode: 1,
    outputDigest,
    startedAt: "2026-07-12T00:00:00.000Z",
    completedAt: "2026-07-12T00:00:01.000Z",
    evidence: {
      evidenceId: "run-1.build",
      kind: "test",
      source: "liushi-harness.verification",
      title: "Verification check build",
      locator: "plan-1/build",
      revision: "target-revision",
      observedAt: "2026-07-12T00:00:01.000Z",
      contentDigest: outputDigest,
    },
  };
}
