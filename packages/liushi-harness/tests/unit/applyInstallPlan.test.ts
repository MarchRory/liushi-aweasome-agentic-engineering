import { describe, expect, it } from "vitest";

import {
  ApplyInstallPlanUseCase,
  InstallationRevisionReservationDisposition,
  createManagedManifestProjection,
  type ApplyInstallPlanInput,
  type InstallationRevisionStore,
  type InstallPlanStore,
  type ManagedFileMutationPort,
  type ManagedFileStateReader,
  type RepositoryLockPort,
  type ReplaceManagedFileInput,
} from "../../src/application/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Clock,
  type ContentDigest,
  type HarnessError as HarnessErrorType,
  type IdGenerator,
  type Result,
} from "../../src/common/index.js";
import {
  FileInstallAction,
  INSTALLATION_REVISION_SCHEMA_VERSION,
  INSTALL_PLAN_SCHEMA_VERSION,
  InstallationApplyDisposition,
  InstallationRevisionEventType,
  InstallationRevisionStatus,
  InstallationTarget,
  MANAGED_FILES_MANIFEST_PATH,
  ManagedFileActualKind,
  ManagedFileGateId,
  ManagedManifestState,
  calculateInstallationRevisionRecordDigest,
  calculateInstallPlanDigest,
  replayInstallationRevision,
  type ActualManagedFileState,
  type DesiredManagedFile,
  type InstallationRevisionEvent,
  type InstallationRevisionIntent,
  type InstallationRevisionRecord,
  type InstallationRevisionState,
  type InstallPlan,
  type ManagedFileContentSnapshot,
  type ManagedManifestSnapshot,
} from "../../src/domain/installation/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";

const ROOT = "C:/repository";
const WORKSPACE_ID = "workspace-1" as InstallPlan["workspaceId"];
const REPOSITORY_ID = "repository-1" as InstallPlan["repositoryId"];
const OTHER_REPOSITORY_ID = "repository-2" as InstallPlan["repositoryId"];
const PLAN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAA" as InstallPlan["planId"];
const OTHER_PLAN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAB" as InstallPlan["planId"];
const REVISION_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV" as InstallationRevisionIntent["revisionId"];
const ACTOR_ID = "human-1";
const IDEMPOTENCY_KEY = "apply-1";
const CREATED_AT = "2026-07-15T00:00:00.000Z";
const BEFORE_B_CONTENT = "应用前-b";
const digestAdapter = new Rfc8785Sha256DigestAdapter();

describe("ApplyInstallPlanUseCase", () => {
  it.each([
    {
      name: "planId 不匹配",
      plan: buildPlan({ planId: OTHER_PLAN_ID }),
      input: { planId: PLAN_ID },
    },
    {
      name: "planDigest 不匹配",
      plan: buildPlan(),
      input: { planDigest: digestOf("未批准的计划摘要") },
    },
    {
      name: "repository 不匹配",
      plan: buildPlan(),
      input: { repositoryId: OTHER_REPOSITORY_ID },
    },
  ])("G0 $name 时不获取副作用执行权", async ({ plan, input }) => {
    const fixture = createFixture(plan);

    const result = await fixture.useCase.execute(approvalFor(plan, input));

    expectFailureCode(result, HarnessErrorCode.PreconditionNotMet);
    expect(fixture.trace).toEqual(["plan.load"]);
    expect(fixture.lock.acquireInputs).toHaveLength(0);
    expect(fixture.revisions.reserveInputs).toHaveLength(0);
    expect(fixture.mutation.inputs).toHaveLength(0);
  });

  it("fresh apply 严格按锁、前检、Intent、Repository 写入、checkpoint 和释放顺序执行", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);

    const result = await fixture.useCase.execute(approvalFor(plan));

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        disposition: InstallationApplyDisposition.Applied,
        status: InstallationRevisionStatus.Committed,
        repositoryMutated: true,
      },
    });
    expect(fixture.trace).toEqual([
      "plan.load",
      "lock.acquire",
      "revision.find",
      ...preflightTrace(),
      "revision.reserve",
      "mutation.replace:.codex/a.json",
      "revision.append:file_applied:.codex/a.json",
      "mutation.replace:.codex/b.json",
      "revision.append:file_applied:.codex/b.json",
      `mutation.replace:${MANAGED_FILES_MANIFEST_PATH}`,
      "revision.append:manifest_applied",
      "reader.readActual:.codex/a.json",
      "reader.readActual:.codex/b.json",
      "reader.readActual:.codex/skip.json",
      "reader.readManifest",
      "revision.append:postconditions_verified",
      "revision.append:committed",
      "lock.release",
    ]);
    const reserved = fixture.revisions.reserveInputs.at(0)?.intent;
    expect(reserved?.preimages).toEqual([
      { path: ".codex/a.json", kind: ManagedFileActualKind.Missing },
      {
        path: ".codex/b.json",
        kind: ManagedFileActualKind.RegularFile,
        content: BEFORE_B_CONTENT,
        digest: digestOf(BEFORE_B_CONTENT),
      },
    ]);
    expect(reserved?.createdDirectories).toEqual([".codex", ".liushi-harness"]);
    expect(fixture.trace.indexOf("revision.reserve")).toBeLessThan(
      fixture.trace.indexOf("mutation.replace:.codex/a.json"),
    );
    expect(fixture.revisions.state?.status).toBe(InstallationRevisionStatus.Committed);
  });

  it("已提交的同幂等批准返回 Reused 且不读取或修改 Repository", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    const intent = buildIntent(plan);
    fixture.revisions.existing = buildRevisionState(intent, completedEvents(plan));

    const result = await fixture.useCase.execute(approvalFor(plan));

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        disposition: InstallationApplyDisposition.Reused,
        repositoryMutated: false,
      },
    });
    expect(fixture.trace).toEqual(["plan.load", "lock.acquire", "revision.find", "lock.release"]);
    expect(fixture.revisions.reserveInputs).toHaveLength(0);
    expect(fixture.revisions.appendInputs).toHaveLength(0);
    expect(fixture.mutation.inputs).toHaveLength(0);
  });

  it("未完成但现场已全部达到 after 状态时只补 checkpoint 并返回 Reused", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    const intent = buildIntent(plan);
    fixture.revisions.existing = buildRevisionState(intent, [fileAppliedEvent(".codex/a.json")]);
    fixture.reader.setDesiredState(intent);

    const result = await fixture.useCase.execute(approvalFor(plan));

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        disposition: InstallationApplyDisposition.Reused,
        repositoryMutated: false,
      },
    });
    expect(fixture.mutation.inputs).toHaveLength(0);
    expect(fixture.revisions.reserveInputs).toHaveLength(0);
    expect(fixture.revisions.appendInputs.map(({ event }) => event)).toEqual([
      fileAppliedEvent(".codex/b.json"),
      revisionEvent(InstallationRevisionEventType.ManifestApplied),
      revisionEvent(InstallationRevisionEventType.PostconditionsVerified),
      revisionEvent(InstallationRevisionEventType.Committed),
    ]);
    expect(fixture.trace).toEqual([
      "plan.load",
      "lock.acquire",
      "revision.find",
      "reader.readContentSnapshot:.codex/a.json",
      "reader.readContentSnapshot:.codex/b.json",
      "reader.readManifest",
      "reader.readActual:.codex/a.json",
      "reader.readActual:.codex/b.json",
      "reader.readActual:.codex/skip.json",
      "reader.readManifest",
      "revision.append:file_applied:.codex/b.json",
      "revision.append:manifest_applied",
      "revision.append:postconditions_verified",
      "revision.append:committed",
      "lock.release",
    ]);
  });

  it("partial 或 mixed 现场要求显式恢复且不自动继续", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    const intent = buildIntent(plan);
    fixture.revisions.existing = buildRevisionState(intent, []);
    fixture.reader.setDesiredFile(plan.files[0]);

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.InstallationRecoveryRequired);
    expectNoAutomaticContinuation(fixture);
  });

  it("event-free 重启前复核 Skip 漂移且不产生任何副作用", async () => {
    const files = defaultFiles();
    const writable = files.find((file) => file.action === FileInstallAction.Create);
    const skipped = files.find((file) => file.action === FileInstallAction.Skip);
    if (writable === undefined || skipped === undefined) throw new Error("测试计划缺少文件");
    const plan = buildPlan({ files: [writable, skipped] });
    const fixture = createFixture(plan);
    fixture.revisions.existing = buildRevisionState(buildIntent(plan), []);
    fixture.reader.setSnapshot({
      path: skipped.path,
      kind: ManagedFileActualKind.RegularFile,
      content: "Skip 漂移",
      digest: digestOf("Skip 漂移"),
    });

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.PreconditionNotMet);
    expect(fixture.mutation.inputs).toHaveLength(0);
    expect(fixture.revisions.appendInputs).toHaveLength(0);
  });

  it("未知漂移要求显式恢复且不自动继续", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.revisions.existing = buildRevisionState(buildIntent(plan), []);
    fixture.reader.setSnapshot({
      path: ".codex/a.json",
      kind: ManagedFileActualKind.RegularFile,
      content: "未知漂移",
      digest: digestOf("未知漂移"),
    });

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.InstallationRecoveryRequired);
    expectNoAutomaticContinuation(fixture);
  });

  it("已有 events 却回到 before 现场时要求显式恢复且不重放写入", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.revisions.existing = buildRevisionState(buildIntent(plan), [
      fileAppliedEvent(".codex/a.json"),
    ]);

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.InstallationRecoveryRequired);
    expectNoAutomaticContinuation(fixture);
  });

  it("stale preflight fail closed 且不保留 Intent", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.reader.setSnapshot({
      path: ".codex/a.json",
      kind: ManagedFileActualKind.RegularFile,
      content: "前检时已漂移",
      digest: digestOf("前检时已漂移"),
    });

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.PreconditionNotMet);
    expect(fixture.trace).toEqual([
      "plan.load",
      "lock.acquire",
      "revision.find",
      "reader.resolveRoot",
      "reader.readManifest",
      "reader.readActual:.codex/a.json",
      "lock.release",
    ]);
    expect(fixture.revisions.reserveInputs).toHaveLength(0);
    expect(fixture.mutation.inputs).toHaveLength(0);
  });

  it("reserve 失败时 fail closed 且不执行任何 Repository mutation", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.revisions.reserveError = testError(HarnessErrorCode.IoFailure, "Intent 保留失败");

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.IoFailure);
    expect(fixture.trace).toEqual([
      "plan.load",
      "lock.acquire",
      "revision.find",
      ...preflightTrace(),
      "revision.reserve",
      "lock.release",
    ]);
    expect(fixture.mutation.inputs).toHaveLength(0);
    expect(fixture.revisions.appendInputs).toHaveLength(0);
  });

  it("首个文件 mutation 失败时 fail closed 且不执行 checkpoint 或后续写入", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.mutation.failOnPath = ".codex/a.json";

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.IoFailure);
    expect(fixture.mutation.inputs.map(({ path }) => path)).toEqual([".codex/a.json"]);
    expect(fixture.revisions.appendInputs).toHaveLength(0);
    expect(fixture.trace.at(-1)).toBe("lock.release");
  });

  it("FileApplied checkpoint CAS 失败时 fail closed 且不执行后续写入", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.revisions.failOnEventType = InstallationRevisionEventType.FileApplied;

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.VersionConflict);
    expect(fixture.mutation.inputs.map(({ path }) => path)).toEqual([".codex/a.json"]);
    expect(fixture.revisions.appendInputs).toHaveLength(1);
    expect(fixture.trace.slice(-3)).toEqual([
      "mutation.replace:.codex/a.json",
      "revision.append:file_applied:.codex/a.json",
      "lock.release",
    ]);
  });

  it("manifest mutation 失败后不追加 ManifestApplied 或后置事件", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.mutation.failOnPath = MANAGED_FILES_MANIFEST_PATH;

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.IoFailure);
    expect(fixture.mutation.inputs.map(({ path }) => path)).toEqual([
      ".codex/a.json",
      ".codex/b.json",
      MANAGED_FILES_MANIFEST_PATH,
    ]);
    expect(fixture.revisions.appendInputs.map(({ event }) => event)).toEqual([
      fileAppliedEvent(".codex/a.json"),
      fileAppliedEvent(".codex/b.json"),
    ]);
    expect(fixture.trace.slice(-2)).toEqual([
      `mutation.replace:${MANAGED_FILES_MANIFEST_PATH}`,
      "lock.release",
    ]);
  });

  it("ManifestApplied checkpoint 失败后不执行后置事件或二次 Repository 写入", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.revisions.failOnEventType = InstallationRevisionEventType.ManifestApplied;

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.VersionConflict);
    expect(fixture.mutation.inputs.map(({ path }) => path)).toEqual([
      ".codex/a.json",
      ".codex/b.json",
      MANAGED_FILES_MANIFEST_PATH,
    ]);
    expect(fixture.revisions.appendInputs.map(({ event }) => event)).toEqual([
      fileAppliedEvent(".codex/a.json"),
      fileAppliedEvent(".codex/b.json"),
      revisionEvent(InstallationRevisionEventType.ManifestApplied),
    ]);
    expect(fixture.revisions.state?.status).toBe(InstallationRevisionStatus.FilesApplying);
    expect(fixture.trace.slice(-3)).toEqual([
      `mutation.replace:${MANAGED_FILES_MANIFEST_PATH}`,
      "revision.append:manifest_applied",
      "lock.release",
    ]);
  });

  it("后置条件不满足时不持久化 PostconditionsVerified 或 Committed", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.mutation.succeedWithoutApplyingOnPath = MANAGED_FILES_MANIFEST_PATH;

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.InstallationRecoveryRequired);
    expect(fixture.mutation.inputs.map(({ path }) => path)).toEqual([
      ".codex/a.json",
      ".codex/b.json",
      MANAGED_FILES_MANIFEST_PATH,
    ]);
    expect(fixture.revisions.appendInputs.map(({ event }) => event)).toEqual([
      fileAppliedEvent(".codex/a.json"),
      fileAppliedEvent(".codex/b.json"),
      revisionEvent(InstallationRevisionEventType.ManifestApplied),
    ]);
    expect(fixture.revisions.state?.status).toBe(InstallationRevisionStatus.ManifestApplied);
    expect(fixture.trace.slice(-2)).toEqual(["reader.readManifest", "lock.release"]);
  });

  it("Committed checkpoint 失败时返回失败且不谎报提交成功", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.revisions.failOnEventType = InstallationRevisionEventType.Committed;

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.VersionConflict);
    expect(fixture.mutation.inputs.map(({ path }) => path)).toEqual([
      ".codex/a.json",
      ".codex/b.json",
      MANAGED_FILES_MANIFEST_PATH,
    ]);
    expect(fixture.revisions.appendInputs.map(({ event }) => event)).toEqual([
      fileAppliedEvent(".codex/a.json"),
      fileAppliedEvent(".codex/b.json"),
      revisionEvent(InstallationRevisionEventType.ManifestApplied),
      revisionEvent(InstallationRevisionEventType.PostconditionsVerified),
      revisionEvent(InstallationRevisionEventType.Committed),
    ]);
    expect(fixture.revisions.state?.status).toBe(InstallationRevisionStatus.PostconditionsVerified);
    expect(fixture.trace.slice(-3)).toEqual([
      "revision.append:postconditions_verified",
      "revision.append:committed",
      "lock.release",
    ]);
  });

  it("持锁服务意外 throw 时返回未知结果并且只释放一次锁", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.revisions.findError = new Error("测试 revision find 意外 throw");

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.InstallationCommitOutcomeUnknown);
    expect(fixture.trace).toEqual(["plan.load", "lock.acquire", "revision.find", "lock.release"]);
    expect(fixture.trace.filter((entry) => entry === "lock.release")).toHaveLength(1);
    expect(fixture.revisions.reserveInputs).toHaveLength(0);
    expect(fixture.mutation.inputs).toHaveLength(0);
  });

  it("Repository lock 释放失败映射为 InstallationCommitOutcomeUnknown", async () => {
    const plan = buildPlan();
    const fixture = createFixture(plan);
    fixture.revisions.existing = buildRevisionState(buildIntent(plan), completedEvents(plan));
    fixture.lock.releaseError = testError(HarnessErrorCode.IoFailure, "锁释放失败");

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.InstallationCommitOutcomeUnknown);
    expect(fixture.trace).toEqual(["plan.load", "lock.acquire", "revision.find", "lock.release"]);
    expect(fixture.mutation.inputs).toHaveLength(0);
  });

  it("包含 Conflict 项的计划不 reserve 且不 mutation", async () => {
    const [first, ...rest] = defaultFiles();
    if (first === undefined) throw new Error("测试计划缺少文件");
    const plan = buildPlan({
      files: [{ ...first, action: FileInstallAction.Conflict }, ...rest],
    });
    const fixture = createFixture(plan);

    const result = await fixture.useCase.execute(approvalFor(plan));

    expectFailureCode(result, HarnessErrorCode.OperationForbidden);
    expect(fixture.trace).toEqual([
      "plan.load",
      "lock.acquire",
      "revision.find",
      "reader.resolveRoot",
      "lock.release",
    ]);
    expect(fixture.revisions.reserveInputs).toHaveLength(0);
    expect(fixture.mutation.inputs).toHaveLength(0);
  });

  it("manifest mutation 使用计划记录的 manifest 前置状态", async () => {
    const manifestBefore = presentManifest('{"schemaVersion":1,"entries":[]}\n');
    const plan = buildPlan({ manifest: manifestBefore });
    const fixture = createFixture(plan);

    const result = await fixture.useCase.execute(approvalFor(plan));

    expect(result.status).toBe(ResultStatus.Success);
    const manifestWrite = fixture.mutation.inputs.find(
      ({ path }) => path === MANAGED_FILES_MANIFEST_PATH,
    );
    expect(manifestWrite?.expected).toEqual({
      path: MANAGED_FILES_MANIFEST_PATH,
      kind: ManagedFileActualKind.RegularFile,
      digest: manifestBefore.digest,
    });
  });
});

class FakeInstallPlanStore implements InstallPlanStore {
  public readonly loadInputs: Array<Parameters<InstallPlanStore["load"]>> = [];

  public constructor(
    private readonly plan: InstallPlan,
    private readonly trace: string[],
  ) {}

  public validateRepositoryIsolation(): ReturnType<
    InstallPlanStore["validateRepositoryIsolation"]
  > {
    return Promise.reject(new Error("测试不允许调用 validateRepositoryIsolation"));
  }

  public save(): ReturnType<InstallPlanStore["save"]> {
    return Promise.reject(new Error("测试不允许调用 save"));
  }

  public load(
    ...input: Parameters<InstallPlanStore["load"]>
  ): ReturnType<InstallPlanStore["load"]> {
    this.trace.push("plan.load");
    this.loadInputs.push(input);
    return Promise.resolve(success(this.plan));
  }
}

class FakeManagedFileStateReader implements ManagedFileStateReader {
  public manifest: ManagedManifestSnapshot;
  public missingDirectories: readonly string[] = [".codex", ".liushi-harness"];
  private readonly snapshots = new Map<string, ManagedFileContentSnapshot>();

  public constructor(
    private readonly plan: InstallPlan,
    private readonly trace: string[],
  ) {
    this.manifest = plan.manifest;
    for (const snapshot of initialSnapshots(plan)) this.setSnapshot(snapshot);
  }

  public identifyPath(path: string): string {
    return path;
  }

  public resolveRoot(root: string): ReturnType<ManagedFileStateReader["resolveRoot"]> {
    this.trace.push("reader.resolveRoot");
    return Promise.resolve(success(root));
  }

  public readActual(_root: string, path: string): ReturnType<ManagedFileStateReader["readActual"]> {
    this.trace.push(`reader.readActual:${path}`);
    const actual = this.actualFor(path);
    return Promise.resolve(
      actual ?? failure(testError(HarnessErrorCode.IoFailure, `未知测试路径：${path}`)),
    );
  }

  public readContentSnapshot(
    _root: string,
    path: string,
  ): ReturnType<ManagedFileStateReader["readContentSnapshot"]> {
    this.trace.push(`reader.readContentSnapshot:${path}`);
    const snapshot = this.snapshots.get(path);
    return Promise.resolve(
      snapshot === undefined
        ? failure(testError(HarnessErrorCode.IoFailure, `未知测试路径：${path}`))
        : success(snapshot),
    );
  }

  public findMissingParentDirectories(
    root: string,
    paths: readonly string[],
  ): ReturnType<ManagedFileStateReader["findMissingParentDirectories"]> {
    void root;
    void paths;
    this.trace.push("reader.findMissingParentDirectories");
    return Promise.resolve(success(this.missingDirectories));
  }

  public readManifest(): ReturnType<ManagedFileStateReader["readManifest"]> {
    this.trace.push("reader.readManifest");
    return Promise.resolve(success(this.manifest));
  }

  public setSnapshot(snapshot: ManagedFileContentSnapshot): void {
    this.snapshots.set(snapshot.path, snapshot);
  }

  public setDesiredFile(file: InstallPlan["files"][number] | undefined): void {
    if (file === undefined) throw new Error("测试计划缺少目标文件");
    this.setSnapshot({
      path: file.path,
      kind: ManagedFileActualKind.RegularFile,
      content: file.desired.content,
      digest: file.desired.digest,
    });
  }

  public setDesiredState(intent: InstallationRevisionIntent): void {
    for (const file of intent.plan.files) this.setDesiredFile(file);
    this.manifest = {
      state: ManagedManifestState.Present,
      content: intent.manifestAfter.content,
      digest: intent.manifestAfter.digest,
      entries: intent.manifestAfter.entries,
    };
  }

  public actualFor(path: string): Result<ActualManagedFileState, HarnessErrorType> | undefined {
    if (path === MANAGED_FILES_MANIFEST_PATH) {
      return this.manifest.state === ManagedManifestState.Missing
        ? success({ path, kind: ManagedFileActualKind.Missing })
        : success({
            path,
            kind: ManagedFileActualKind.RegularFile,
            digest: this.manifest.digest,
          });
    }
    const snapshot = this.snapshots.get(path);
    if (snapshot === undefined) return undefined;
    return success(
      snapshot.kind === ManagedFileActualKind.Missing
        ? { path, kind: ManagedFileActualKind.Missing }
        : { path, kind: ManagedFileActualKind.RegularFile, digest: snapshot.digest },
    );
  }
}

class FakeManagedFileMutation implements ManagedFileMutationPort {
  public readonly inputs: ReplaceManagedFileInput[] = [];
  public failOnPath: string | undefined;
  public succeedWithoutApplyingOnPath: string | undefined;

  public constructor(
    private readonly reader: FakeManagedFileStateReader,
    private readonly trace: string[],
  ) {}

  public replace(input: ReplaceManagedFileInput): ReturnType<ManagedFileMutationPort["replace"]> {
    this.trace.push(`mutation.replace:${input.path}`);
    this.inputs.push(input);
    if (input.path === this.failOnPath)
      return Promise.resolve(failure(testError(HarnessErrorCode.IoFailure, "测试 mutation 失败")));
    const current = this.reader.actualFor(input.path);
    if (
      current === undefined ||
      current.status === ResultStatus.Failure ||
      !sameActual(current.value, input.expected)
    )
      return Promise.resolve(
        failure(testError(HarnessErrorCode.PreconditionNotMet, "mutation 前置状态不匹配")),
      );
    if (input.path === this.succeedWithoutApplyingOnPath) {
      return Promise.resolve(
        success({
          path: input.path,
          kind: ManagedFileActualKind.RegularFile,
          digest: input.digest,
        }),
      );
    }
    if (input.path === MANAGED_FILES_MANIFEST_PATH) {
      this.reader.manifest = {
        state: ManagedManifestState.Present,
        content: input.content,
        digest: input.digest,
        entries: [],
      };
    } else {
      this.reader.setSnapshot({
        path: input.path,
        kind: ManagedFileActualKind.RegularFile,
        content: input.content,
        digest: input.digest,
      });
    }
    return Promise.resolve(
      success({
        path: input.path,
        kind: ManagedFileActualKind.RegularFile,
        digest: input.digest,
      }),
    );
  }
}

class FakeInstallationRevisionStore implements InstallationRevisionStore {
  public existing: InstallationRevisionState | undefined;
  public state: InstallationRevisionState | undefined;
  public findError: Error | undefined;
  public reserveError: HarnessError | undefined;
  public failOnEventType: InstallationRevisionEventType | undefined;
  public readonly reserveInputs: Array<Parameters<InstallationRevisionStore["reserveIntent"]>[0]> =
    [];
  public readonly appendInputs: Array<Parameters<InstallationRevisionStore["appendEvent"]>[0]> = [];

  public constructor(private readonly trace: string[]) {}

  public findByApproval(
    input: Parameters<InstallationRevisionStore["findByApproval"]>[0],
  ): ReturnType<InstallationRevisionStore["findByApproval"]> {
    this.trace.push("revision.find");
    if (this.findError !== undefined) throw this.findError;
    if (this.existing === undefined) return Promise.resolve(success(undefined));
    const intent = this.existing.record.intent;
    const matches =
      input.workspaceId === intent.plan.workspaceId &&
      input.repositoryId === intent.plan.repositoryId &&
      input.planId === intent.approval.planId &&
      input.planDigest === intent.approval.planDigest &&
      input.actorId === intent.approval.actorId &&
      input.idempotencyKey === intent.approval.idempotencyKey;
    return Promise.resolve(success(matches ? this.existing : undefined));
  }

  public reserveIntent(
    input: Parameters<InstallationRevisionStore["reserveIntent"]>[0],
  ): ReturnType<InstallationRevisionStore["reserveIntent"]> {
    this.trace.push("revision.reserve");
    this.reserveInputs.push(input);
    if (this.reserveError !== undefined) return Promise.resolve(failure(this.reserveError));
    this.state = buildRevisionState(input.intent, []);
    return Promise.resolve(
      success({
        disposition: InstallationRevisionReservationDisposition.Acquired,
        state: this.state,
      }),
    );
  }

  public appendEvent(
    input: Parameters<InstallationRevisionStore["appendEvent"]>[0],
  ): ReturnType<InstallationRevisionStore["appendEvent"]> {
    this.trace.push(eventTrace(input.event));
    this.appendInputs.push(input);
    if (input.event.type === this.failOnEventType)
      return Promise.resolve(
        failure(testError(HarnessErrorCode.VersionConflict, "checkpoint CAS 失败")),
      );
    const current = this.state ?? this.existing;
    if (
      current === undefined ||
      current.record.recordDigest !== input.expectedRecordDigest ||
      current.record.revisionId !== input.revisionId
    )
      return Promise.resolve(
        failure(testError(HarnessErrorCode.VersionConflict, "checkpoint CAS 前置摘要不匹配")),
      );
    const next = buildRevisionState(current.record.intent, [...current.record.events, input.event]);
    this.state = next;
    this.existing = next;
    return Promise.resolve(success(next));
  }

  public load(): ReturnType<InstallationRevisionStore["load"]> {
    return Promise.reject(new Error("测试不允许调用 revision load"));
  }
}

class FakeRepositoryLock implements RepositoryLockPort {
  public readonly acquireInputs: Array<Parameters<RepositoryLockPort["acquire"]>[0]> = [];
  public releaseError: HarnessError | undefined;

  public constructor(private readonly trace: string[]) {}

  public acquire(
    input: Parameters<RepositoryLockPort["acquire"]>[0],
  ): ReturnType<RepositoryLockPort["acquire"]> {
    this.trace.push("lock.acquire");
    this.acquireInputs.push(input);
    return Promise.resolve(
      success({
        lockId: "lock-1",
        workspaceId: input.workspaceId,
        repositoryId: input.repositoryId,
        acquiredAt: CREATED_AT,
        release: () => {
          this.trace.push("lock.release");
          return Promise.resolve(
            this.releaseError === undefined ? success(undefined) : failure(this.releaseError),
          );
        },
      }),
    );
  }
}

class FixedClock implements Clock {
  public now(): Date {
    return new Date(CREATED_AT);
  }
}

class FixedRevisionIdGenerator implements IdGenerator {
  public next(): string {
    return REVISION_ID;
  }
}

function createFixture(plan: InstallPlan) {
  const trace: string[] = [];
  const plans = new FakeInstallPlanStore(plan, trace);
  const revisions = new FakeInstallationRevisionStore(trace);
  const reader = new FakeManagedFileStateReader(plan, trace);
  const mutation = new FakeManagedFileMutation(reader, trace);
  const lock = new FakeRepositoryLock(trace);
  const useCase = new ApplyInstallPlanUseCase(
    plans,
    revisions,
    reader,
    mutation,
    lock,
    digestAdapter,
    new FixedClock(),
    new FixedRevisionIdGenerator(),
  );
  return { trace, plans, revisions, reader, mutation, lock, useCase };
}

function buildPlan(
  options: {
    readonly planId?: InstallPlan["planId"];
    readonly repositoryId?: InstallPlan["repositoryId"];
    readonly manifest?: ManagedManifestSnapshot;
    readonly files?: InstallPlan["files"];
  } = {},
): InstallPlan {
  const withoutDigest: Omit<InstallPlan, "planDigest"> = {
    schemaVersion: INSTALL_PLAN_SCHEMA_VERSION,
    planId: options.planId ?? PLAN_ID,
    workspaceId: WORKSPACE_ID,
    repositoryId: options.repositoryId ?? REPOSITORY_ID,
    root: ROOT,
    target: InstallationTarget.Codex,
    createdAt: CREATED_AT,
    createdBy: ACTOR_ID,
    requiredGate: ManagedFileGateId.G0ManagedFiles,
    manifest: options.manifest ?? missingManifest(),
    files: options.files ?? defaultFiles(),
  };
  const calculated = calculateInstallPlanDigest(
    (value) => digestAdapter.calculate(value),
    withoutDigest,
  );
  if (calculated.status === ResultStatus.Failure) throw calculated.error;
  return { ...withoutDigest, planDigest: calculated.value };
}

function defaultFiles(): InstallPlan["files"] {
  const created = desiredFile(".codex/a.json", "目标-a");
  const updated = desiredFile(".codex/b.json", "目标-b");
  const skipped = desiredFile(".codex/skip.json", "目标-skip");
  return [
    {
      path: created.path,
      action: FileInstallAction.Create,
      desired: created,
      actual: { path: created.path, kind: ManagedFileActualKind.Missing },
    },
    {
      path: updated.path,
      action: FileInstallAction.Update,
      desired: updated,
      actual: {
        path: updated.path,
        kind: ManagedFileActualKind.RegularFile,
        digest: digestOf(BEFORE_B_CONTENT),
      },
    },
    {
      path: skipped.path,
      action: FileInstallAction.Skip,
      desired: skipped,
      actual: {
        path: skipped.path,
        kind: ManagedFileActualKind.RegularFile,
        digest: skipped.digest,
      },
    },
  ];
}

function desiredFile(path: string, content: string): DesiredManagedFile {
  return {
    path,
    content,
    digest: digestOf(content),
    metadata: {
      ownerPackage: "liushi-harness",
      profile: "codex",
      packageVersion: "test",
      template: path,
      source: "test",
      sourceDigest: digestOf(`source:${path}`),
    },
  };
}

function initialSnapshots(plan: InstallPlan): ManagedFileContentSnapshot[] {
  return plan.files.map((file) => {
    if (file.actual.kind === ManagedFileActualKind.Missing)
      return { path: file.path, kind: ManagedFileActualKind.Missing };
    const content =
      file.actual.digest === file.desired.digest ? file.desired.content : BEFORE_B_CONTENT;
    return {
      path: file.path,
      kind: ManagedFileActualKind.RegularFile,
      content,
      digest: file.actual.digest as ContentDigest,
    };
  });
}

function buildIntent(plan: InstallPlan): InstallationRevisionIntent {
  const projection = createManagedManifestProjection(plan, REVISION_ID, digestAdapter);
  if (projection.status === ResultStatus.Failure) throw projection.error;
  return {
    revisionId: REVISION_ID,
    plan,
    approval: {
      gate: ManagedFileGateId.G0ManagedFiles,
      actorId: ACTOR_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      approvedAt: CREATED_AT,
      planId: plan.planId,
      planDigest: plan.planDigest,
    },
    preimages: initialSnapshots(plan).filter((snapshot) =>
      plan.files.some(
        (file) =>
          file.path === snapshot.path &&
          (file.action === FileInstallAction.Create || file.action === FileInstallAction.Update),
      ),
    ),
    manifestAfter: projection.value,
    createdDirectories: [".codex", ".liushi-harness"],
  };
}

function buildRevisionState(
  intent: InstallationRevisionIntent,
  events: readonly InstallationRevisionEvent[],
): InstallationRevisionState {
  const withoutDigest: Omit<InstallationRevisionRecord, "recordDigest"> = {
    schemaVersion: INSTALLATION_REVISION_SCHEMA_VERSION,
    revisionId: intent.revisionId,
    intent,
    events,
  };
  const calculated = calculateInstallationRevisionRecordDigest(
    (value) => digestAdapter.calculate(value),
    withoutDigest,
  );
  if (calculated.status === ResultStatus.Failure) throw calculated.error;
  const replayed = replayInstallationRevision({ ...withoutDigest, recordDigest: calculated.value });
  if (replayed.status === ResultStatus.Failure) throw replayed.error;
  return replayed.value;
}

function approvalFor(
  plan: InstallPlan,
  overrides: Partial<ApplyInstallPlanInput> = {},
): ApplyInstallPlanInput {
  return {
    workspaceId: plan.workspaceId,
    repositoryId: plan.repositoryId,
    planId: plan.planId,
    planDigest: plan.planDigest,
    actorId: ACTOR_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    ...overrides,
  };
}

function completedEvents(plan: InstallPlan): InstallationRevisionEvent[] {
  return [
    ...plan.files
      .filter(
        ({ action }) => action === FileInstallAction.Create || action === FileInstallAction.Update,
      )
      .map(({ path }) => fileAppliedEvent(path)),
    revisionEvent(InstallationRevisionEventType.ManifestApplied),
    revisionEvent(InstallationRevisionEventType.PostconditionsVerified),
    revisionEvent(InstallationRevisionEventType.Committed),
  ];
}

function fileAppliedEvent(path: string): InstallationRevisionEvent {
  return { type: InstallationRevisionEventType.FileApplied, path, recordedAt: CREATED_AT };
}

function revisionEvent(
  type: Exclude<InstallationRevisionEventType, InstallationRevisionEventType.FileApplied>,
): InstallationRevisionEvent {
  return { type, recordedAt: CREATED_AT };
}

function missingManifest(): ManagedManifestSnapshot {
  return { state: ManagedManifestState.Missing, entries: [] };
}

function presentManifest(content: string): ManagedManifestSnapshot {
  return {
    state: ManagedManifestState.Present,
    content,
    digest: digestOf(content),
    entries: [],
  };
}

function digestOf(input: unknown): ContentDigest {
  const result = digestAdapter.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function preflightTrace(): string[] {
  return [
    "reader.resolveRoot",
    "reader.readManifest",
    "reader.readActual:.codex/a.json",
    "reader.readContentSnapshot:.codex/a.json",
    "reader.readActual:.codex/b.json",
    "reader.readContentSnapshot:.codex/b.json",
    "reader.readActual:.codex/skip.json",
    "reader.findMissingParentDirectories",
  ];
}

function eventTrace(event: InstallationRevisionEvent): string {
  return event.type === InstallationRevisionEventType.FileApplied
    ? `revision.append:${event.type}:${event.path}`
    : `revision.append:${event.type}`;
}

function sameActual(left: ActualManagedFileState, right: ActualManagedFileState): boolean {
  return (
    left.path === right.path &&
    left.kind === right.kind &&
    (left.kind !== ManagedFileActualKind.RegularFile || left.digest === right.digest)
  );
}

function testError(code: HarnessErrorCode, message: string): HarnessError {
  return new HarnessError(code, message);
}

function expectFailureCode(
  result: Result<unknown, HarnessErrorType>,
  code: HarnessErrorCode,
): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Success) throw new Error("预期测试结果失败");
  expect(result.error.code).toBe(code);
}

function expectNoAutomaticContinuation(fixture: ReturnType<typeof createFixture>): void {
  expect(fixture.revisions.reserveInputs).toHaveLength(0);
  expect(fixture.revisions.appendInputs).toHaveLength(0);
  expect(fixture.mutation.inputs).toHaveLength(0);
  expect(fixture.trace.at(-1)).toBe("lock.release");
}
