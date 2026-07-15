import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { ParentDirectorySyncStatus } from "../../src/application/index.js";
import {
  FileInstallAction,
  InstallationTarget,
  ManagedFileActualKind,
  ManagedFileGateId,
  ManagedManifestState,
  ManagedOwnershipProvenance,
  parseInstallationRevisionId,
  parseRepositoryId,
  parseWorkspaceId,
  type InstallPlan,
} from "../../src/domain/index.js";
import {
  FileInstallPlanStore,
  FileParentDirectoryDurability,
  ExclusiveFileLockManager,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";
import { verifyInstallPlanIntegrity } from "../../src/infrastructure/fileInstallPlanStore/validation/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();
const planId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("File InstallPlan Store", () => {
  afterEach(async () => runtimeStores.cleanup());

  it("保存、加载、幂等复用并拒绝同 ID 的不同内容", async () => {
    const root = await runtimeStores.create("liushi-install-plan-");
    const store = createStore(root);
    const plan = createPlan();
    expect(await store.save(plan)).toMatchObject({
      status: ResultStatus.Success,
      value: { planId },
    });
    expect(await store.save(plan)).toMatchObject({
      status: ResultStatus.Success,
      value: { planId },
    });
    const workspace = parseWorkspaceId("workspace-1");
    const identifier = plan.planId;
    if (workspace.status === ResultStatus.Failure) throw workspace.error;
    expect(await store.load(workspace.value, identifier)).toMatchObject({
      status: ResultStatus.Success,
      value: { planDigest: plan.planDigest },
    });
    const changed = createPlan("C:\\different");
    expect(await store.save(changed)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.VersionConflict },
    });
  });

  it("对损坏计划 fail closed", async () => {
    const root = await runtimeStores.create("liushi-install-plan-corrupt-");
    const record = join(root, "install-plans", "workspace-1", `${planId}.json`);
    await mkdir(join(root, "install-plans", "workspace-1"), { recursive: true });
    await writeFile(record, "{invalid", "utf8");
    const workspace = parseWorkspaceId("workspace-1");
    if (workspace.status === ResultStatus.Failure) throw workspace.error;
    expect(await createStore(root).load(workspace.value, createPlan().planId)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("保存时拒绝 Desired Content 摘要与计划动作不一致", async () => {
    const root = await runtimeStores.create("liushi-install-plan-semantics-");
    const store = createStore(root);
    const plan = createPlan();
    const invalidContent = recalculatePlan({
      ...plan,
      files: [
        {
          ...plan.files[0]!,
          desired: { ...plan.files[0]!.desired, content: "tampered\n" },
        },
      ],
    });
    expect(await store.save(invalidContent)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });

    const invalidAction = recalculatePlan({
      ...plan,
      files: [{ ...plan.files[0]!, action: FileInstallAction.Skip }],
    });
    expect(await store.save(invalidAction)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("幂等保存前重新验证已存在记录的真实内容", async () => {
    const root = await runtimeStores.create("liushi-install-plan-existing-tamper-");
    const store = createStore(root);
    const plan = createPlan();
    expect(await store.save(plan)).toMatchObject({ status: ResultStatus.Success });
    const record = join(root, "install-plans", "workspace-1", `${planId}.json`);
    await writeFile(record, `${JSON.stringify({ ...plan, createdBy: "tampered" })}\n`, "utf8");
    expect(await store.save(plan)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("首次目录同步失败后幂等重试会重新建立目录耐久性", async () => {
    const root = await runtimeStores.create("liushi-install-plan-durability-retry-");
    let syncAttempts = 0;
    const store = new FileInstallPlanStore(root, {
      lockManager: new ExclusiveFileLockManager(),
      parentDirectoryDurability: {
        syncParentDirectory: () => {
          syncAttempts += 1;
          return syncAttempts === 1
            ? Promise.reject(new Error("injected durability failure"))
            : Promise.resolve({ status: ParentDirectorySyncStatus.Synced });
        },
      },
      digest: new Rfc8785Sha256DigestAdapter(),
    });
    const plan = createPlan();
    expect(await store.save(plan)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.IoFailure },
    });
    expect(await store.save(plan)).toMatchObject({ status: ResultStatus.Success });
    expect(syncAttempts).toBe(2);
  });

  it("即使调用方绕过应用层，Store 也拒绝向 Repository 内写入计划", async () => {
    const repositoryRoot = await runtimeStores.create("liushi-install-plan-repository-");
    const storeRoot = join(repositoryRoot, ".liushi-runtime");
    const store = createStore(storeRoot);

    expect(await store.save(createPlan(repositoryRoot))).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
  });

  it.each(["repository-1", "foreign-repository"])(
    "拒绝从原始计划数据伪造 Verified Revision 所有权：%s",
    async (repositoryId) => {
      const root = await runtimeStores.create("liushi-install-plan-forged-owner-");
      const plan = createPlan();
      const entry = plan.files[0]!;
      const persistedRepository = parseRepositoryId(repositoryId);
      const revision = parseInstallationRevisionId("01ARZ3NDEKTSV4RRFFQ69G5FAV");
      if (
        persistedRepository.status === ResultStatus.Failure ||
        revision.status === ResultStatus.Failure
      )
        throw new Error("fixture identity failed");
      const forged = recalculatePlan({
        ...plan,
        files: [
          {
            ...entry,
            persisted: {
              path: entry.path,
              lastAppliedDigest: entry.desired.digest,
              repositoryId: persistedRepository.value,
              installationRevisionId: revision.value,
              installPlanDigest: plan.planDigest,
              original: { kind: ManagedFileActualKind.Missing },
              provenance: ManagedOwnershipProvenance.VerifiedRevision,
              metadata: entry.desired.metadata,
            },
          },
        ],
      });

      expect(await createStore(root).save(forged)).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
    },
  );

  it("按 Windows 身份拒绝大小写别名，并按 POSIX 身份保留两个独立路径", () => {
    const plan = createCaseAliasPlan();
    const digest = new Rfc8785Sha256DigestAdapter();
    expect(verifyInstallPlanIntegrity(plan, digest, "win32")).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
    expect(verifyInstallPlanIntegrity(plan, digest, "linux")).toMatchObject({
      status: ResultStatus.Success,
    });
  });
});

function createStore(root: string): FileInstallPlanStore {
  return new FileInstallPlanStore(root, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
    digest: new Rfc8785Sha256DigestAdapter(),
  });
}

function createPlan(root = "C:\\repository") {
  const digest = new Rfc8785Sha256DigestAdapter();
  const content = "{}\n";
  const contentDigest = digest.calculate(content);
  const workspace = parseWorkspaceId("workspace-1");
  const repository = parseRepositoryId("repository-1");
  if (
    contentDigest.status === ResultStatus.Failure ||
    workspace.status === ResultStatus.Failure ||
    repository.status === ResultStatus.Failure
  )
    throw new Error("fixture error");
  const base = {
    schemaVersion: 1,
    planId: planId as never,
    workspaceId: workspace.value,
    repositoryId: repository.value,
    root,
    target: InstallationTarget.Codex,
    createdAt: "2026-07-15T00:00:00.000Z",
    createdBy: "actor",
    requiredGate: ManagedFileGateId.G0ManagedFiles,
    manifest: { state: ManagedManifestState.Missing, entries: [] } as const,
    files: [
      {
        path: ".codex/hooks.json",
        action: FileInstallAction.Create,
        desired: {
          path: ".codex/hooks.json",
          content,
          digest: contentDigest.value,
          metadata: metadata(),
        },
        actual: { path: ".codex/hooks.json", kind: ManagedFileActualKind.Missing },
      },
    ],
  };
  const planDigest = digest.calculate(base);
  if (planDigest.status === ResultStatus.Failure) throw planDigest.error;
  return { ...base, planDigest: planDigest.value };
}

function recalculatePlan(plan: InstallPlan): InstallPlan {
  const base = {
    schemaVersion: plan.schemaVersion,
    planId: plan.planId,
    workspaceId: plan.workspaceId,
    repositoryId: plan.repositoryId,
    root: plan.root,
    target: plan.target,
    createdAt: plan.createdAt,
    createdBy: plan.createdBy,
    requiredGate: plan.requiredGate,
    manifest: plan.manifest,
    files: plan.files,
  };
  const digest = new Rfc8785Sha256DigestAdapter().calculate(base);
  if (digest.status === ResultStatus.Failure) throw digest.error;
  return { ...base, planDigest: digest.value };
}

function createCaseAliasPlan(): InstallPlan {
  const plan = createPlan();
  const entry = plan.files[0]!;
  const aliasPath = ".CODEX/hooks.json";
  return recalculatePlan({
    ...plan,
    files: [
      {
        ...entry,
        path: aliasPath,
        desired: {
          ...entry.desired,
          path: aliasPath,
          metadata: { ...entry.desired.metadata, template: aliasPath },
        },
        actual: { ...entry.actual, path: aliasPath },
      },
      entry,
    ],
  });
}

function metadata() {
  const sourceDigest = new Rfc8785Sha256DigestAdapter().calculate("source");
  if (sourceDigest.status === ResultStatus.Failure) throw sourceDigest.error;
  return {
    ownerPackage: "liushi-harness",
    profile: "codex",
    packageVersion: "test",
    template: ".codex/hooks.json",
    source: "test",
    sourceDigest: sourceDigest.value,
  };
}
