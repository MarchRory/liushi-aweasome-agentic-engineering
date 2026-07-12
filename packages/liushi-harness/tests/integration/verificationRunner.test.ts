import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { RunVerificationUseCase } from "../../src/application/useCases/runVerification/index.js";
import { ResultStatus } from "../../src/common/index.js";
import type { VerificationExecutorPort } from "../../src/application/ports/verification/index.js";
import {
  EvidenceBundleWriteDisposition,
  VerificationExecutionMode,
  createHarnessApplication,
  parseCodingTaskId,
  parseWorkspaceId,
} from "../../src/index.js";
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
import { NodeCommandRunnerAdapter } from "../../src/infrastructure/system/index.js";
import { resolveCodingTaskStorePaths } from "../../src/infrastructure/index.js";
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
    expectedBranchName: "main",
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

  it("执行后强一致持久化 EvidenceBundle 并支持跨实例读取", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "liushi-verification-persist-"));
    try {
      const workspaceId = unwrapResult(parseWorkspaceId("verification-workspace"));
      const codingTaskId = unwrapResult(parseCodingTaskId("verification-coding-task"));
      const paths = resolveCodingTaskStorePaths(storeRoot, workspaceId, codingTaskId);
      await mkdir(dirname(paths.eventsFile), { recursive: true });
      await writeFile(paths.eventsFile, "coding-task-anchor\n", "utf8");
      const locator = { workspaceId, codingTaskId, verificationRunId: "run-persisted" };
      const result = await createHarnessApplication({
        storeRoot,
        clock: new FixedClock(FIXED_TIME),
      }).runAndPersistVerification.execute({
        locator,
        verificationRunId: "run-persisted",
        plan: createPlan(),
        worktreeRoot: WORKTREE_ROOT,
      });
      const loaded = await createHarnessApplication({ storeRoot }).evidenceBundleStore.load(
        locator,
      );

      expect(result).toMatchObject({
        status: ResultStatus.Success,
        value: {
          bundle: { status: VerificationStatus.Blocked },
          persistence: { disposition: EvidenceBundleWriteDisposition.Persisted },
        },
      });
      expect(loaded).toMatchObject({
        status: ResultStatus.Success,
        value: { verificationRunId: "run-persisted", status: VerificationStatus.Blocked },
      });
    } finally {
      await rm(storeRoot, { recursive: true, force: true });
    }
  });

  it("显式 LocalCommand 模式执行真实命令并只保留输出摘要", async () => {
    const worktreeRoot = await mkdtemp(join(tmpdir(), "liushi-verification-command-"));
    const storeRoot = await mkdtemp(join(tmpdir(), "liushi-verification-store-"));
    try {
      const revision = await initializeGit(worktreeRoot);
      const result = await createHarnessApplication({
        storeRoot,
        clock: new FixedClock(FIXED_TIME),
        verificationExecutionMode: VerificationExecutionMode.LocalCommand,
      }).runVerification.execute({
        verificationRunId: "run-local",
        plan: createLocalCommandPlan(
          ["-e", "process.stdout.write('verification-secret')"],
          revision,
        ),
        worktreeRoot,
      });

      expect(result.status).toBe(ResultStatus.Success);
      if (result.status === ResultStatus.Failure) return;
      expect(result.value.status).toBe(VerificationStatus.Passed);
      expect(result.value.checks[0]).toMatchObject({
        status: VerificationStatus.Passed,
        exitCode: 0,
      });
      expect(JSON.stringify(result.value)).not.toContain("verification-secret");

      const mismatchedPlan = createLocalCommandPlan(["-e", "process.exit(0)"], revision);
      const mismatched = await createHarnessApplication({
        storeRoot,
        clock: new FixedClock(FIXED_TIME),
        verificationExecutionMode: VerificationExecutionMode.LocalCommand,
      }).runVerification.execute({
        verificationRunId: "run-mismatched",
        plan: {
          ...mismatchedPlan,
          targetRevision: `${revision.slice(0, -1)}${revision.endsWith("0") ? "1" : "0"}`,
        },
        worktreeRoot,
      });
      expect(mismatched).toMatchObject({
        status: ResultStatus.Success,
        value: {
          status: VerificationStatus.Blocked,
          checks: [{ failureKind: "revision_mismatch" }],
        },
      });
    } finally {
      await Promise.all([
        rm(worktreeRoot, { recursive: true, force: true }),
        rm(storeRoot, { recursive: true, force: true }),
      ]);
    }
  });

  it("真实命令非零退出映射为 Failed，输出超限映射为 Blocked", async () => {
    const worktreeRoot = await mkdtemp(join(tmpdir(), "liushi-verification-limits-"));
    const storeRoot = await mkdtemp(join(tmpdir(), "liushi-verification-limit-store-"));
    try {
      const revision = await initializeGit(worktreeRoot);
      const application = createHarnessApplication({
        storeRoot,
        clock: new FixedClock(FIXED_TIME),
        verificationExecutionMode: VerificationExecutionMode.LocalCommand,
      });
      const failed = await application.runVerification.execute({
        verificationRunId: "run-failed",
        plan: createLocalCommandPlan(["-e", "process.exit(7)"], revision),
        worktreeRoot,
      });
      const limited = await application.runVerification.execute({
        verificationRunId: "run-limited",
        plan: createLocalCommandPlan(["-e", "process.stdout.write('x'.repeat(1100000))"], revision),
        worktreeRoot,
      });

      expect(failed).toMatchObject({
        status: ResultStatus.Success,
        value: {
          status: VerificationStatus.Failed,
          checks: [{ exitCode: 7, failureKind: "command_failed" }],
        },
      });
      expect(limited).toMatchObject({
        status: ResultStatus.Success,
        value: {
          status: VerificationStatus.Blocked,
          checks: [{ exitCode: null, failureKind: "output_limit" }],
        },
      });
    } finally {
      await Promise.all([
        rm(worktreeRoot, { recursive: true, force: true }),
        rm(storeRoot, { recursive: true, force: true }),
      ]);
    }
  });

  it("拒绝验证未提交变化，并阻断会修改 Worktree 的 Check", async () => {
    const dirtyRoot = await mkdtemp(join(tmpdir(), "liushi-verification-dirty-"));
    const modifyingRoot = await mkdtemp(join(tmpdir(), "liushi-verification-modifying-"));
    const storeRoot = await mkdtemp(join(tmpdir(), "liushi-verification-stability-store-"));
    try {
      const dirtyRevision = await initializeGit(dirtyRoot);
      const modifyingRevision = await initializeGit(modifyingRoot);
      await writeFile(join(dirtyRoot, "uncommitted.txt"), "dirty\n", "utf8");
      const application = createHarnessApplication({
        storeRoot,
        clock: new FixedClock(FIXED_TIME),
        verificationExecutionMode: VerificationExecutionMode.LocalCommand,
      });
      const dirty = await application.runVerification.execute({
        verificationRunId: "run-dirty",
        plan: createLocalCommandPlan(["-e", "process.exit(0)"], dirtyRevision),
        worktreeRoot: dirtyRoot,
      });
      const modified = await application.runVerification.execute({
        verificationRunId: "run-modified",
        plan: createLocalCommandPlan(
          ["-e", "require('fs').writeFileSync('generated.txt', 'changed')"],
          modifyingRevision,
        ),
        worktreeRoot: modifyingRoot,
      });

      expect(dirty).toMatchObject({
        status: ResultStatus.Success,
        value: {
          status: VerificationStatus.Blocked,
          checks: [{ failureKind: "worktree_dirty" }],
        },
      });
      expect(modified).toMatchObject({
        status: ResultStatus.Success,
        value: {
          status: VerificationStatus.Blocked,
          checks: [{ failureKind: "worktree_modified" }],
        },
      });
    } finally {
      await Promise.all([
        rm(dirtyRoot, { recursive: true, force: true }),
        rm(modifyingRoot, { recursive: true, force: true }),
        rm(storeRoot, { recursive: true, force: true }),
      ]);
    }
  });
});

function createLocalCommandPlan(args: readonly string[], revision: string): VerificationPlan {
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH");
  if (pathKey === undefined) throw new Error("测试环境缺少 PATH。");
  return {
    ...createPlan([
      {
        checkId: "local-command",
        kind: VerificationKind.Custom,
        requirement: VerificationRequirement.Required,
        command: {
          executable: "node",
          args,
          workingDirectory: "",
          allowedEnvironmentKeys: [pathKey],
        },
        timeoutMs: 10_000,
        retryable: false,
      },
    ]),
    baseRevision: revision,
    targetRevision: revision,
  };
}

async function initializeGit(worktreeRoot: string): Promise<string> {
  await runGit(worktreeRoot, ["init", "-b", "main"]);
  await runGit(worktreeRoot, [
    "-c",
    "user.name=liushi-test",
    "-c",
    "user.email=liushi-test@example.com",
    "commit",
    "--allow-empty",
    "-m",
    "base",
  ]);
  return runGit(worktreeRoot, ["rev-parse", "HEAD"]);
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await new NodeCommandRunnerAdapter().run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  if (result.status === ResultStatus.Failure) throw result.error;
  if (result.value.exitCode !== 0) throw new Error(`Git command failed: ${args[0] ?? "unknown"}`);
  return result.value.stdout.trim();
}

function unwrapResult<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "测试标识解析失败。");
  }
  return result.value;
}
