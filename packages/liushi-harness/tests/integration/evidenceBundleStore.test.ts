import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  EvidenceBundleWriteDisposition,
  EvidenceKind,
  HarnessErrorCode,
  ResultStatus,
  VerificationKind,
  VerificationRequirement,
  VerificationStatus,
  createHarnessApplication,
  parseCodingTaskId,
  parseContentDigest,
  parseRepositoryId,
  parseWorkspaceId,
  type EvidenceBundle,
  type EvidenceBundleLocator,
} from "../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileEvidenceBundleStore,
  Rfc8785Sha256DigestAdapter,
  resolveCodingTaskStorePaths,
  resolveEvidenceBundleStorePaths,
} from "../../src/infrastructure/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("File EvidenceBundle Store", () => {
  it("跨实例不可变写入、幂等复用并重新校验读取", async () => {
    const setup = await createSetup("liushi-evidence-bundle-");
    const first = await setup.application.evidenceBundleStore.persist(setup.locator, bundle());
    const duplicate = await createHarnessApplication({
      storeRoot: setup.storeRoot,
    }).evidenceBundleStore.persist(setup.locator, bundle());
    const loaded = await createHarnessApplication({
      storeRoot: setup.storeRoot,
    }).evidenceBundleStore.load(setup.locator);

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: EvidenceBundleWriteDisposition.Persisted },
    });
    expect(duplicate).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: EvidenceBundleWriteDisposition.IdempotentReuse },
    });
    expect(loaded).toMatchObject({
      status: ResultStatus.Success,
      value: { verificationRunId: "run-1", status: VerificationStatus.Passed },
    });
  });

  it("同一 Verification Run 的不同 Bundle 固定返回冲突", async () => {
    const setup = await createSetup("liushi-evidence-conflict-");
    await setup.application.evidenceBundleStore.persist(setup.locator, bundle());

    const conflict = await setup.application.evidenceBundleStore.persist(
      setup.locator,
      bundle({ generatedAt: "2026-07-12T00:00:03.000Z" }),
    );

    expect(conflict).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.EvidenceBundleConflict },
    });
  });

  it("读取时拒绝被篡改的 Bundle 内容", async () => {
    const setup = await createSetup("liushi-evidence-tamper-");
    await setup.application.evidenceBundleStore.persist(setup.locator, bundle());
    const paths = resolveEvidenceBundleStorePaths(setup.storeRoot, setup.locator);
    const record = JSON.parse(await readFile(paths.recordFile, "utf8")) as Record<string, unknown>;
    record["verificationRunId"] = "run-tampered";
    await writeFile(paths.recordFile, `${JSON.stringify(record)}\n`, "utf8");

    const loaded = await setup.application.evidenceBundleStore.load(setup.locator);

    expect(loaded).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("原子写入后父目录持久化失败返回提交结果未知", async () => {
    const setup = await createSetup("liushi-evidence-unknown-");
    const store = new FileEvidenceBundleStore(setup.storeRoot, {
      lockManager: new ExclusiveFileLockManager(),
      digest: new Rfc8785Sha256DigestAdapter(),
      parentDirectoryDurability: {
        syncParentDirectory: () => Promise.reject(new Error("fsync failed")),
      },
    });

    const result = await store.persist(setup.locator, bundle());

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.EvidenceBundleCommitOutcomeUnknown },
    });
  });
});

async function createSetup(prefix: string) {
  const storeRoot = await runtimeStores.create(prefix);
  const workspaceId = unwrap(parseWorkspaceId("evidence-workspace"));
  const codingTaskId = unwrap(parseCodingTaskId("evidence-coding-task"));
  const locator: EvidenceBundleLocator = {
    workspaceId,
    codingTaskId,
    verificationRunId: "run-1",
  };
  const codingTaskPaths = resolveCodingTaskStorePaths(storeRoot, workspaceId, codingTaskId);
  await mkdir(dirname(codingTaskPaths.eventsFile), { recursive: true });
  await writeFile(codingTaskPaths.eventsFile, "coding-task-anchor\n", "utf8");
  return { storeRoot, locator, application: createHarnessApplication({ storeRoot }) };
}

function bundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  const outputDigest = unwrap(parseContentDigest(`sha256:${"1".repeat(64)}`));
  return {
    schemaVersion: 1,
    verificationRunId: "run-1",
    planId: "plan-1",
    repositoryId: unwrap(parseRepositoryId("verification-repository")),
    worktreeId: "worktree-1",
    baseRevision: "base-revision",
    targetRevision: "target-revision",
    planDigest: unwrap(parseContentDigest(`sha256:${"a".repeat(64)}`)),
    status: VerificationStatus.Passed,
    generatedAt: "2026-07-12T00:00:02.000Z",
    checks: [
      {
        checkId: "build",
        kind: VerificationKind.Build,
        requirement: VerificationRequirement.Required,
        status: VerificationStatus.Passed,
        exitCode: 0,
        outputDigest,
        startedAt: "2026-07-12T00:00:00.000Z",
        completedAt: "2026-07-12T00:00:01.000Z",
        evidence: {
          evidenceId: "run-1.build",
          kind: EvidenceKind.Test,
          source: "liushi-harness.verification",
          title: "Verification check build",
          locator: "plan-1/build",
          revision: "target-revision",
          observedAt: "2026-07-12T00:00:01.000Z",
          contentDigest: outputDigest,
        },
      },
    ],
    ...overrides,
  };
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "测试标识解析失败。");
  }
  return result.value;
}
