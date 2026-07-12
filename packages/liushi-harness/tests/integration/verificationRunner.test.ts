import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RunVerificationUseCase } from "../../src/application/useCases/runVerification/index.js";
import { ResultStatus } from "../../src/common/index.js";
import type { VerificationExecutorPort } from "../../src/application/ports/verification/index.js";
import { createHarnessApplication } from "../../src/index.js";
import {
  VerificationKind,
  VerificationRequirement,
  VerificationStatus,
  type VerificationPlan,
} from "../../src/domain/verification/index.js";
import { parseRepositoryId } from "../../src/domain/workspace/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/serialization/index.js";
import {
  MockVerificationExecutorAdapter,
  type MockVerificationOutcome,
} from "../../src/infrastructure/verification/index.js";
import { FixedClock } from "../support/runtime/index.js";

const WORKTREE_ROOT = "C:\\verification-worktree";
const FIXED_TIME = "2026-07-12T00:00:00.000Z";
const repositoryId = (() => {
  const result = parseRepositoryId("verification-repository");
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
})();

function createPlan(
  checks: VerificationPlan["checks"] = [
    {
      checkId: "build",
      kind: VerificationKind.Build,
      requirement: VerificationRequirement.Required,
      command: {
        executable: "pnpm",
        args: ["build"],
        workingDirectory: "",
        allowedEnvironmentKeys: [],
      },
      timeoutMs: 1_000,
      retryable: false,
    },
  ],
): VerificationPlan {
  return {
    schemaVersion: 1,
    planId: "plan-1",
    repositoryId,
    worktreeId: "worktree-1",
    baseRevision: "base-revision",
    targetRevision: "target-revision",
    checks,
  };
}

function runWithOutcomes(
  outcomes: ReadonlyMap<string, MockVerificationOutcome>,
  plan = createPlan(),
) {
  return new RunVerificationUseCase(
    new MockVerificationExecutorAdapter(new FixedClock(FIXED_TIME), outcomes),
    new Rfc8785Sha256DigestAdapter(),
    new FixedClock(FIXED_TIME),
  ).execute({
    verificationRunId: "run-1",
    plan,
    worktreeRoot: WORKTREE_ROOT,
  });
}

describe("Run Verification Use Case", () => {
  it("为失败的必需检查生成摘要证据且不泄漏原始输出", async () => {
    const result = await runWithOutcomes(
      new Map([["build", { status: VerificationStatus.Failed, stderr: "secret command output" }]]),
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(VerificationStatus.Failed);
    expect(result.value.checks[0]?.status).toBe(VerificationStatus.Failed);
    expect(result.value.checks[0]?.failureKind).toBe("command_failed");
    expect(result.value.checks[0]?.outputDigest).toMatch(/^sha256:/u);
    expect(result.value.checks[0]?.evidence.contentDigest).toBe(
      result.value.checks[0]?.outputDigest,
    );
    expect(result.value).not.toHaveProperty("stdout");
    expect(result.value).not.toHaveProperty("stderr");
  });

  it("未配置的 Mock Check fail-closed 为 Blocked", async () => {
    const result = await runWithOutcomes(new Map());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(VerificationStatus.Blocked);
    expect(result.value.checks[0]?.failureKind).toBe("unconfigured");
  });

  it("建议检查失败不会阻断整体通过", async () => {
    const plan = createPlan([
      {
        checkId: "advisory-lint",
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
      {
        checkId: "build",
        kind: VerificationKind.Build,
        requirement: VerificationRequirement.Required,
        command: {
          executable: "pnpm",
          args: ["build"],
          workingDirectory: "",
          allowedEnvironmentKeys: [],
        },
        timeoutMs: 1_000,
        retryable: false,
      },
    ]);
    const result = await runWithOutcomes(
      new Map([
        ["advisory-lint", { status: VerificationStatus.Failed }],
        ["build", { status: VerificationStatus.Passed }],
      ]),
      plan,
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(VerificationStatus.Passed);
  });

  it("Executor 抛出异常时转换为 Blocked", async () => {
    const throwingExecutor: VerificationExecutorPort = {
      execute: () => Promise.reject(new Error("executor failure")),
    };
    const useCase = new RunVerificationUseCase(
      throwingExecutor,
      new Rfc8785Sha256DigestAdapter(),
      new FixedClock(FIXED_TIME),
    );

    const result = await useCase.execute({
      verificationRunId: "run-1",
      plan: createPlan(),
      worktreeRoot: WORKTREE_ROOT,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.status).toBe(VerificationStatus.Blocked);
    expect(result.value.checks[0]?.failureKind).toBe("unavailable");
  });

  it("Composition Root 默认装配 fail-closed Mock Executor", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "liushi-verification-root-"));
    try {
      const result = await createHarnessApplication({
        storeRoot,
        clock: new FixedClock(FIXED_TIME),
      }).runVerification.execute({
        verificationRunId: "run-1",
        plan: createPlan(),
        worktreeRoot: WORKTREE_ROOT,
      });

      expect(result.status).toBe(ResultStatus.Success);
      if (result.status === ResultStatus.Failure) return;
      expect(result.value.status).toBe(VerificationStatus.Blocked);
      expect(result.value.checks[0]?.failureKind).toBe("unconfigured");
    } finally {
      await rm(storeRoot, { recursive: true, force: true });
    }
  });
});
