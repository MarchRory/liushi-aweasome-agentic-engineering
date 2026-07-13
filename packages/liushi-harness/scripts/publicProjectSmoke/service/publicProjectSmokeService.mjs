import { isDeepStrictEqual } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import {
  EXPECTED_TEST_CONTENT,
  ORIGINAL_TEST_CONTENT,
  PUBLIC_PACKAGE_MANAGER,
  PUBLIC_REPOSITORY_ID,
  PUBLIC_REPOSITORY_REVISION,
  PUBLIC_REPOSITORY_URL,
  SMOKE_HUMAN_ACTOR_ID,
  TEMP_DIRECTORY_PREFIX,
  VERIFICATION_PLAN_ID,
  VERIFICATION_RUN_ID,
  WORKSPACE_ID,
  WORKTREE_BRANCH,
  WORKTREE_ID,
  WRITE_SET,
} from "../constants/index.mjs";
import { calculateDigest } from "../digest/index.mjs";
import {
  createHarnessConsumer,
  establishGateProtocol,
  runCellWithCli,
} from "../harnessClient/index.mjs";
import { clonePublicProject, inspectCompletedWorktree, runBaseline } from "../project/index.mjs";
import { writeCodingTaskCellManifest } from "../workflow/index.mjs";

export async function runPublicProjectSmoke(packageRoot) {
  const startedAt = performance.now();
  const temporaryRoot = await mkdtemp(join(tmpdir(), TEMP_DIRECTORY_PREFIX));
  const keep = process.env.LIUSHI_PUBLIC_SMOKE_KEEP === "1";
  try {
    const storeRoot = join(temporaryRoot, "runtime");
    await mkdir(storeRoot);
    const repositoryRoot = await clonePublicProject(temporaryRoot);
    assertEqual(
      await readFile(join(repositoryRoot, ...WRITE_SET[0].split("/")), "utf8"),
      ORIGINAL_TEST_CONTENT,
      "固定 Revision 的原始测试文件",
    );
    const baselineChecks = runBaseline(repositoryRoot);
    const consumer = await createHarnessConsumer(packageRoot, temporaryRoot);
    const gate = await establishGateProtocol({ consumerRoot: consumer.consumerRoot, storeRoot });
    const cell = await writeCodingTaskCellManifest({
      repositoryRoot,
      storeRoot,
      sourceTaskId: gate.sourceTaskId,
      executionAuthorization: gate.executionAuthorization,
    });
    const cliInput = {
      consumerRoot: consumer.consumerRoot,
      manifestFile: cell.manifestFile,
      repositoryId: PUBLIC_REPOSITORY_ID,
      repositoryRoot,
      storeRoot,
    };
    const first = runCellWithCli(cliInput);
    const second = runCellWithCli(cliInput);
    if (!isDeepStrictEqual(second, first)) {
      throw new Error("第二个 CLI 进程未深度复用完全相同的 Cell 结果。");
    }
    const report = first.data;
    assertEqual(report?.status, "review_ready", "Cell 状态");
    assertEqual(report?.evidenceBundle?.status, "passed", "EvidenceBundle 状态");
    const finalContent = await readFile(
      join(cell.worktreeRoot, ...WRITE_SET[0].split("/")),
      "utf8",
    );
    assertEqual(finalContent, EXPECTED_TEST_CONTENT, "受管 Worktree 最终文件内容");
    const worktree = inspectCompletedWorktree({ worktreeRoot: cell.worktreeRoot });
    assertEqual(worktree.commitCount, 1, "Base..HEAD Commit 数量");
    assertDeepEqual(worktree.changedPaths, WRITE_SET, "Base..HEAD Changed Paths");
    assertEqual(worktree.worktreeClean, true, "最终 Worktree 洁净状态");
    assertReportBindings(report, worktree.headRevision);

    const summary = createSummary({
      baselineChecks,
      consumer,
      report,
      worktree,
      machineDurationMs: Math.round(performance.now() - startedAt),
      kept: keep,
      finalContent,
    });
    await writeEvidenceFile(summary);
    return summary;
  } finally {
    if (!keep) await removeOwnedTemporaryRoot(temporaryRoot);
  }
}

function assertReportBindings(report, headRevision) {
  const evidence = report.evidenceBundle;
  const artifact = report.prReadyArtifact;
  if (artifact === undefined) throw new Error("review_ready 未携带 PRReadyArtifact。");
  assertEqual(evidence.repositoryId, PUBLIC_REPOSITORY_ID, "Evidence Repository ID");
  assertEqual(evidence.worktreeId, WORKTREE_ID, "Evidence Worktree ID");
  assertEqual(evidence.baseRevision, PUBLIC_REPOSITORY_REVISION, "Evidence Base Revision");
  assertEqual(evidence.targetRevision, headRevision, "Evidence Target Revision");
  assertEqual(evidence.verificationRunId, VERIFICATION_RUN_ID, "Evidence Verification Run ID");
  assertEqual(evidence.planId, VERIFICATION_PLAN_ID, "Evidence Plan ID");
  assertDeepEqual(
    evidence.checks.map(({ checkId, requirement, status, exitCode }) => ({
      checkId,
      requirement,
      status,
      exitCode,
    })),
    [
      {
        checkId: "worktree-offline-install",
        requirement: "required",
        status: "passed",
        exitCode: 0,
      },
      { checkId: "worktree-test", requirement: "required", status: "passed", exitCode: 0 },
    ],
    "Verification Checks",
  );
  assertEqual(artifact.workspaceId, WORKSPACE_ID, "PRReadyArtifact Workspace ID");
  assertEqual(artifact.repositoryId, PUBLIC_REPOSITORY_ID, "PRReadyArtifact Repository ID");
  assertEqual(artifact.baseRevision, PUBLIC_REPOSITORY_REVISION, "PRReadyArtifact Base Revision");
  assertEqual(artifact.headRevision, headRevision, "PRReadyArtifact Head Revision");
  assertEqual(artifact.worktreeId, WORKTREE_ID, "PRReadyArtifact Worktree ID");
  assertEqual(artifact.branchName, WORKTREE_BRANCH, "PRReadyArtifact Branch");
  assertDeepEqual(artifact.writeSet, WRITE_SET, "PRReadyArtifact Write Set");
  assertDeepEqual(artifact.changedPaths, WRITE_SET, "PRReadyArtifact Changed Paths");
  assertEqual(artifact.verification.status, "passed", "PRReadyArtifact Evidence 状态");
  assertEqual(
    artifact.verification.evidenceBundleDigest,
    calculateDigest(evidence),
    "PRReadyArtifact Evidence 摘要",
  );
  assertEqual(artifact.verification.planDigest, evidence.planDigest, "PRReadyArtifact Plan 摘要");
}

function createSummary(input) {
  return {
    schemaVersion: "liushi.public-project-smoke.evidence.v2",
    status: "passed",
    generatedAt: new Date().toISOString(),
    repository: {
      repositoryId: PUBLIC_REPOSITORY_ID,
      url: PUBLIC_REPOSITORY_URL,
      revision: PUBLIC_REPOSITORY_REVISION,
      packageManager: PUBLIC_PACKAGE_MANAGER,
    },
    package: {
      name: "liushi-harness",
      version: input.consumer.packageVersion,
      artifact: input.consumer.packageArtifact,
    },
    executionEnvironment: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    gateProtocol: {
      actorId: SMOKE_HUMAN_ACTOR_ID,
      mode: "automated_simulation",
      simulatedApprovalCount: 2,
      statement: "自动化模拟审批仅证明 Gate 协议，不代表真实 Human 审批。",
    },
    cell: {
      status: input.report.status,
      baseRevision: PUBLIC_REPOSITORY_REVISION,
      headRevision: input.worktree.headRevision,
      repositoryId: input.report.prReadyArtifact.repositoryId,
      writeSet: input.report.prReadyArtifact.writeSet,
      evidenceStatus: input.report.evidenceBundle.status,
      evidenceBundleDigest: calculateDigest(input.report.evidenceBundle),
      prReadyArtifactDigest: input.report.prReadyArtifact.artifactDigest,
    },
    checks: [
      ...input.baselineChecks,
      ...input.report.evidenceBundle.checks.map((check) => ({
        checkId: check.checkId,
        requirement: check.requirement,
        status: check.status,
        exitCode: check.exitCode,
      })),
    ],
    idempotency: {
      sameManifest: true,
      sameStore: true,
      separateCliProcesses: true,
      deeplyEqual: true,
    },
    worktree: {
      managed: true,
      commitCount: input.worktree.commitCount,
      changedPaths: input.worktree.changedPaths,
      clean: input.worktree.worktreeClean,
      finalContentDigest: calculateDigest(input.finalContent),
    },
    metrics: {
      machineDurationMs: input.machineDurationMs,
      humanTouchTime: {
        status: "not_measured",
        reason: "本 Smoke 的审批由自动化模拟，未建立真实 Human 计时区间。",
      },
      simulatedApprovalCount: 2,
    },
    temporaryRootRetained: input.kept,
  };
}

async function writeEvidenceFile(summary) {
  const configuredPath = process.env.LIUSHI_PUBLIC_SMOKE_EVIDENCE_FILE;
  if (configuredPath === undefined || configuredPath.length === 0) return;
  const evidencePath = resolve(configuredPath);
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

async function removeOwnedTemporaryRoot(temporaryRoot) {
  const expectedParent = resolve(tmpdir());
  if (
    dirname(resolve(temporaryRoot)) !== expectedParent ||
    !basename(temporaryRoot).startsWith(TEMP_DIRECTORY_PREFIX)
  ) {
    throw new Error("拒绝清理不属于本脚本的临时目录。");
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} 不符合固定 smoke 断言。`);
}

function assertDeepEqual(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(`${label} 不符合固定 smoke 断言。`);
}
