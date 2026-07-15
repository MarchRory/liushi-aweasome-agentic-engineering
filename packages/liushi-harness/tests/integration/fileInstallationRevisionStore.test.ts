import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { InstallationRevisionReservationDisposition } from "../../src/application/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  FileInstallAction,
  InstallationRevisionEventType,
  InstallationRevisionStatus,
  InstallationTarget,
  ManagedFileActualKind,
  ManagedFileGateId,
  ManagedManifestState,
  ManagedOwnershipProvenance,
  parseInstallationRevisionId,
  parseInstallPlanId,
  serializeManagedManifest,
  type InstallationRevisionEvent,
  type InstallationRevisionId,
  type InstallationRevisionIntent,
  type InstallationRevisionState,
  type InstallPlan,
  type PersistedManagedFileState,
} from "../../src/domain/installation/index.js";
import { parseRepositoryId, parseWorkspaceId } from "../../src/domain/workspace/index.js";
import {
  FileInstallationRevisionStore,
  type InstallationRevisionRecordWriter,
} from "../../src/infrastructure/installationRevisionStore/index.js";
import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
  type ExclusiveFileLockHandle,
  type FileLockManager,
  type TaskLockContext,
} from "../../src/infrastructure/persistence/fileEventStore/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/serialization/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();
const digest = new Rfc8785Sha256DigestAdapter();
const workspaceId = parseRequiredWorkspaceId("workspace-1");
const repositoryId = parseRequiredRepositoryId("repository-1");
const planId = parseRequiredPlanId("01ARZ3NDEKTSV4RRFFQ69G5FAA");
const otherPlanId = parseRequiredPlanId("01ARZ3NDEKTSV4RRFFQ69G5FAB");
const revisionId = parseRequiredRevisionId("01ARZ3NDEKTSV4RRFFQ69G5FAV");
const retryRevisionId = parseRequiredRevisionId("01ARZ3NDEKTSV4RRFFQ69G5FAW");

describe("File Installation Revision Store", () => {
  afterEach(async () => runtimeStores.cleanup());

  it("首次 reserve 只写入一条完整权威记录，并可按 Revision ID 加载", async () => {
    const setup = await createSetup();
    const reserved = await setup.store.reserveIntent({ intent: setup.intent });

    expect(reserved).toMatchObject({
      status: ResultStatus.Success,
      value: {
        disposition: InstallationRevisionReservationDisposition.Acquired,
        state: { status: InstallationRevisionStatus.IntentPersisted },
      },
    });
    const files = await recordFiles(setup.storeRoot);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(new RegExp(`^${revisionId}\\.[a-f0-9]{64}\\.json$`, "u"));
    expect(await setup.store.load({ workspaceId, repositoryId, revisionId })).toMatchObject({
      status: ResultStatus.Success,
      value: { record: { revisionId, intent: setup.intent } },
    });
  });

  it("同 key 重试可携带新 revisionId 与 approvedAt，但复用原始记录", async () => {
    const setup = await createSetup();
    const first = await setup.store.reserveIntent({ intent: setup.intent });
    expect(first.status).toBe(ResultStatus.Success);
    const retriedIntent = createIntent(setup.repositoryRoot, {
      revisionId: retryRevisionId,
      approvedAt: "2026-07-15T01:00:00.000Z",
    });

    expect(await setup.store.reserveIntent({ intent: retriedIntent })).toMatchObject({
      status: ResultStatus.Success,
      value: {
        disposition: InstallationRevisionReservationDisposition.Existing,
        state: { record: { revisionId } },
      },
    });
    expect(await recordFiles(setup.storeRoot)).toHaveLength(1);
  });

  it("同 key 但不同批准语义返回 VersionConflict", async () => {
    const setup = await createSetup();
    expect(await setup.store.reserveIntent({ intent: setup.intent })).toMatchObject({
      status: ResultStatus.Success,
    });
    const conflicting = createIntent(setup.repositoryRoot, { actorId: "human-2" });

    expect(await setup.store.reserveIntent({ intent: conflicting })).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.VersionConflict },
    });
    expect(await recordFiles(setup.storeRoot)).toHaveLength(1);
  });

  it("findByApproval 缺失返回 undefined，存在时返回状态并拒绝 plan 或 actor scope 冲突", async () => {
    const setup = await createSetup();
    const lookup = approvalLookup(setup.intent);
    expect(await setup.store.findByApproval(lookup)).toEqual({
      status: ResultStatus.Success,
      value: undefined,
    });
    expect(await setup.store.reserveIntent({ intent: setup.intent })).toMatchObject({
      status: ResultStatus.Success,
    });
    expect(await setup.store.findByApproval(lookup)).toMatchObject({
      status: ResultStatus.Success,
      value: { record: { revisionId } },
    });

    for (const conflict of [
      { ...lookup, actorId: "human-2" },
      { ...lookup, planId: otherPlanId },
    ])
      expect(await setup.store.findByApproval(conflict)).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.VersionConflict },
      });
  });

  it("appendEvent 使用 recordDigest CAS，并拒绝陈旧摘要", async () => {
    const setup = await createSetup();
    const initial = await reserveRequired(setup.store, setup.intent);
    const appended = await setup.store.appendEvent({
      workspaceId,
      repositoryId,
      revisionId,
      expectedRecordDigest: initial.record.recordDigest,
      event: fileApplied(),
    });
    expect(appended).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: InstallationRevisionStatus.FilesApplying,
        appliedPaths: [".codex/hooks.json"],
      },
    });

    expect(
      await setup.store.appendEvent({
        workspaceId,
        repositoryId,
        revisionId,
        expectedRecordDigest: initial.record.recordDigest,
        event: event(InstallationRevisionEventType.ManifestApplied),
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.VersionConflict },
    });
  });

  it("非法阶段事件在写入前返回 InvalidStateTransition", async () => {
    const setup = await createSetup();
    const initial = await reserveRequired(setup.store, setup.intent);

    expect(
      await setup.store.appendEvent({
        workspaceId,
        repositoryId,
        revisionId,
        expectedRecordDigest: initial.record.recordDigest,
        event: event(InstallationRevisionEventType.ManifestApplied),
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidStateTransition },
    });
    expect((await loadRequired(setup.store)).record.events).toHaveLength(0);
  });

  it("加载时拒绝被篡改的 recordDigest", async () => {
    const setup = await createSetup();
    await reserveRequired(setup.store, setup.intent);
    const recordFile = await onlyRecordFile(setup.storeRoot);
    const record: unknown = JSON.parse(await readFile(recordFile, "utf8"));
    if (!isJsonObject(record)) throw new Error("Expected a JSON object record.");
    record["recordDigest"] = `sha256:${"0".repeat(64)}`;
    await writeFile(recordFile, `${JSON.stringify(record)}\n`, "utf8");

    expect(await setup.store.load({ workspaceId, repositoryId, revisionId })).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("只有 Committed Revision 的逐字段一致 claim 才通过 ownership 验证", async () => {
    const setup = await createSetup();
    const committed = await commitRevision(setup.store, setup.intent);
    const claim = committed.record.intent.manifestAfter.entries[0]!;

    expect(await setup.store.verify({ workspaceId, claim })).toEqual({
      status: ResultStatus.Success,
      value: true,
    });
    const forgedDigest = calculateRequiredDigest("forged-content");
    expect(
      await setup.store.verify({
        workspaceId,
        claim: { ...claim, lastAppliedDigest: forgedDigest },
      }),
    ).toEqual({ status: ResultStatus.Success, value: false });
    expect(
      await setup.store.verify({
        workspaceId,
        claim: {
          ...claim,
          metadata: { ...claim.metadata, packageVersion: "forged" },
        },
      }),
    ).toEqual({ status: ResultStatus.Success, value: false });
  });

  it("不存在的 Revision ownership claim 返回 false", async () => {
    const setup = await createSetup();
    const claim = setup.intent.manifestAfter.entries[0]!;

    expect(
      await setup.store.verify({
        workspaceId,
        claim: { ...claim, installationRevisionId: retryRevisionId },
      }),
    ).toEqual({ status: ResultStatus.Success, value: false });
  });

  it("拒绝未验证的当前 Revision ownership 条目", async () => {
    const setup = await createSetup();
    const entry = setup.intent.manifestAfter.entries[0]!;
    const intent = withManifestEntries(setup.intent, [
      { ...entry, provenance: ManagedOwnershipProvenance.UnverifiedClaim },
    ]);

    expect(await setup.store.reserveIntent({ intent })).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("拒绝投影凭空增加非写入 ownership 条目", async () => {
    const setup = await createSetup();
    const entry = setup.intent.manifestAfter.entries[0]!;
    const extra = {
      ...entry,
      path: ".codex/extra.json",
      installationRevisionId: retryRevisionId,
      metadata: { ...entry.metadata, template: ".codex/extra.json" },
    };
    const intent = withManifestEntries(setup.intent, [extra, entry]);

    expect(await setup.store.reserveIntent({ intent })).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("拒绝记录与写入目标无关的待创建目录", async () => {
    const setup = await createSetup();
    const intent = {
      ...setup.intent,
      createdDirectories: [...setup.intent.createdDirectories, "unrelated"],
    };

    expect(await setup.store.reserveIntent({ intent })).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("并发 reserve 同一 key 最多只产生一条权威记录", async () => {
    const setup = await createSetup();
    const results = await Promise.all([
      setup.store.reserveIntent({ intent: setup.intent }),
      setup.store.reserveIntent({ intent: setup.intent }),
    ]);

    expect(await recordFiles(setup.storeRoot)).toHaveLength(1);
    const successful = results.filter((result) => result.status === ResultStatus.Success);
    expect(successful.length).toBeGreaterThanOrEqual(1);
    expect(
      successful.filter(
        (result) =>
          result.value.disposition === InstallationRevisionReservationDisposition.Acquired,
      ),
    ).toHaveLength(1);
    for (const failed of results.filter((result) => result.status === ResultStatus.Failure))
      expect(failed.error.code).toBe(HarnessErrorCode.LockUnavailable);
  });

  it("原子写入开始后失败返回 InstallationCommitOutcomeUnknown", async () => {
    const setup = await createSetup();
    const initial = await reserveRequired(setup.store, setup.intent);
    const failingStore = createStore(setup.storeRoot, {
      write: () => Promise.reject(new Error("injected atomic write failure")),
    });

    expect(
      await failingStore.appendEvent({
        workspaceId,
        repositoryId,
        revisionId,
        expectedRecordDigest: initial.record.recordDigest,
        event: fileApplied(),
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InstallationCommitOutcomeUnknown },
    });
    expect((await loadRequired(setup.store)).record.events).toHaveLength(0);
  });

  it("写入完成但锁释放失败仍返回 InstallationCommitOutcomeUnknown，且不谎报成功", async () => {
    const setup = await createSetup();
    const initial = await reserveRequired(setup.store, setup.intent);
    const releaseFailureStore = createStore(
      setup.storeRoot,
      undefined,
      new ReleaseFailureLockManager(),
    );

    expect(
      await releaseFailureStore.appendEvent({
        workspaceId,
        repositoryId,
        revisionId,
        expectedRecordDigest: initial.record.recordDigest,
        event: fileApplied(),
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InstallationCommitOutcomeUnknown },
    });
    expect((await loadRequired(setup.store)).record.events).toEqual([fileApplied()]);
  });
});

async function createSetup() {
  const storeRoot = await runtimeStores.create("liushi-installation-revision-store-");
  const repositoryRoot = await runtimeStores.create("liushi-installation-repository-");
  return {
    storeRoot,
    repositoryRoot,
    store: createStore(storeRoot),
    intent: createIntent(repositoryRoot),
  };
}

function createStore(
  storeRoot: string,
  recordWriter?: InstallationRevisionRecordWriter,
  lockManager: FileLockManager = new ExclusiveFileLockManager(),
): FileInstallationRevisionStore {
  return new FileInstallationRevisionStore(storeRoot, {
    lockManager,
    parentDirectoryDurability: new FileParentDirectoryDurability(),
    digest,
    ...(recordWriter === undefined ? {} : { recordWriter }),
  });
}

function createIntent(
  repositoryRoot: string,
  options: {
    readonly revisionId?: InstallationRevisionId;
    readonly approvedAt?: string;
    readonly actorId?: string;
  } = {},
): InstallationRevisionIntent {
  const selectedRevisionId = options.revisionId ?? revisionId;
  const desiredContent = '{"hooks":[]}\n';
  const metadata = {
    ownerPackage: "liushi-harness",
    profile: "codex",
    packageVersion: "test",
    template: ".codex/hooks.json",
    source: "integration-test",
    sourceDigest: calculateRequiredDigest("integration-source"),
  };
  const planBase = {
    schemaVersion: 1,
    planId,
    workspaceId,
    repositoryId,
    root: repositoryRoot,
    target: InstallationTarget.Codex,
    createdAt: "2026-07-15T00:00:00.000Z",
    createdBy: "planner",
    requiredGate: ManagedFileGateId.G0ManagedFiles,
    manifest: { state: ManagedManifestState.Missing, entries: [] } as const,
    files: [
      {
        path: ".codex/hooks.json",
        action: FileInstallAction.Create,
        desired: {
          path: ".codex/hooks.json",
          content: desiredContent,
          digest: calculateRequiredDigest(desiredContent),
          metadata,
        },
        actual: {
          path: ".codex/hooks.json",
          kind: ManagedFileActualKind.Missing,
        },
      },
    ],
  };
  const plan: InstallPlan = { ...planBase, planDigest: calculateRequiredDigest(planBase) };
  const entry: PersistedManagedFileState = {
    path: ".codex/hooks.json",
    lastAppliedDigest: plan.files[0]!.desired.digest,
    repositoryId,
    installationRevisionId: selectedRevisionId,
    installPlanDigest: plan.planDigest,
    original: { kind: ManagedFileActualKind.Missing },
    provenance: ManagedOwnershipProvenance.VerifiedRevision,
    metadata,
  };
  const manifestContent = serializeManagedManifest([entry]);
  return {
    revisionId: selectedRevisionId,
    plan,
    approval: {
      gate: ManagedFileGateId.G0ManagedFiles,
      actorId: options.actorId ?? "human-1",
      idempotencyKey: "apply-workspace-1-repository-1",
      approvedAt: options.approvedAt ?? "2026-07-15T00:10:00.000Z",
      planId,
      planDigest: plan.planDigest,
    },
    preimages: [{ path: ".codex/hooks.json", kind: ManagedFileActualKind.Missing }],
    manifestAfter: {
      content: manifestContent,
      digest: calculateRequiredDigest(manifestContent),
      entries: [entry],
    },
    createdDirectories: [".codex", ".liushi-harness"],
  };
}

function approvalLookup(intent: InstallationRevisionIntent) {
  return {
    workspaceId: intent.plan.workspaceId,
    repositoryId: intent.plan.repositoryId,
    planId: intent.approval.planId,
    planDigest: intent.approval.planDigest,
    actorId: intent.approval.actorId,
    idempotencyKey: intent.approval.idempotencyKey,
  };
}

function withManifestEntries(
  intent: InstallationRevisionIntent,
  entries: readonly PersistedManagedFileState[],
): InstallationRevisionIntent {
  const content = serializeManagedManifest(entries);
  return {
    ...intent,
    manifestAfter: {
      content,
      digest: calculateRequiredDigest(content),
      entries,
    },
  };
}

async function reserveRequired(
  store: FileInstallationRevisionStore,
  intent: InstallationRevisionIntent,
): Promise<InstallationRevisionState> {
  const result = await store.reserveIntent({ intent });
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value.state;
}

async function loadRequired(
  store: FileInstallationRevisionStore,
): Promise<InstallationRevisionState> {
  const result = await store.load({ workspaceId, repositoryId, revisionId });
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

async function commitRevision(
  store: FileInstallationRevisionStore,
  intent: InstallationRevisionIntent,
): Promise<InstallationRevisionState> {
  let state = await reserveRequired(store, intent);
  for (const nextEvent of [
    fileApplied(),
    event(InstallationRevisionEventType.ManifestApplied),
    event(InstallationRevisionEventType.PostconditionsVerified),
    event(InstallationRevisionEventType.Committed),
  ]) {
    const appended = await store.appendEvent({
      workspaceId,
      repositoryId,
      revisionId,
      expectedRecordDigest: state.record.recordDigest,
      event: nextEvent,
    });
    if (appended.status === ResultStatus.Failure) throw appended.error;
    state = appended.value;
  }
  return state;
}

function fileApplied(): InstallationRevisionEvent {
  return {
    type: InstallationRevisionEventType.FileApplied,
    path: ".codex/hooks.json",
    recordedAt: "2026-07-15T00:20:00.000Z",
  };
}

function event(
  type: Exclude<InstallationRevisionEventType, InstallationRevisionEventType.FileApplied>,
): InstallationRevisionEvent {
  return { type, recordedAt: "2026-07-15T00:21:00.000Z" };
}

async function recordFiles(storeRoot: string): Promise<readonly string[]> {
  return readdir(join(storeRoot, "installation-revisions", workspaceId, repositoryId, "records"));
}

async function onlyRecordFile(storeRoot: string): Promise<string> {
  const files = await recordFiles(storeRoot);
  if (files.length !== 1 || files[0] === undefined) throw new Error("Expected one record file.");
  return join(storeRoot, "installation-revisions", workspaceId, repositoryId, "records", files[0]);
}

function calculateRequiredDigest(input: unknown) {
  const calculated = digest.calculate(input);
  if (calculated.status === ResultStatus.Failure) throw calculated.error;
  return calculated.value;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequiredWorkspaceId(value: string) {
  const parsed = parseWorkspaceId(value);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

function parseRequiredRepositoryId(value: string) {
  const parsed = parseRepositoryId(value);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

function parseRequiredPlanId(value: string) {
  const parsed = parseInstallPlanId(value);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

function parseRequiredRevisionId(value: string) {
  const parsed = parseInstallationRevisionId(value);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

/** 在真实锁完成清理后注入释放失败，模拟 post-commit 不确定性。 */
class ReleaseFailureLockManager implements FileLockManager {
  private readonly delegate = new ExclusiveFileLockManager();

  public async acquire(
    lockFile: string,
    context: TaskLockContext,
  ): Promise<ExclusiveFileLockHandle> {
    const handle = await this.delegate.acquire(lockFile, context);
    return {
      release: async (): Promise<void> => {
        await handle.release();
        throw new Error("injected lock release failure");
      },
    };
  }
}
