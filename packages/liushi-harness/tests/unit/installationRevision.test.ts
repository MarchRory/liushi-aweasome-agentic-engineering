import { describe, expect, it } from "vitest";

import {
  ResultStatus,
  parseContentDigest,
  success,
  type ContentDigest,
} from "../../src/common/index.js";
import {
  FileInstallAction,
  INSTALLATION_REVISION_SCHEMA_VERSION,
  InstallationRecoveryDisposition,
  InstallationRevisionEventType,
  InstallationRevisionStatus,
  InstallationTarget,
  ManagedFileActualKind,
  ManagedFileGateId,
  ManagedManifestState,
  calculateInstallationRevisionRecordDigest,
  classifyInstallationRecovery,
  replayInstallationRevision,
  type DesiredManagedFile,
  type InstallationRevisionEvent,
  type InstallationRevisionIntent,
  type InstallationRevisionRecord,
  type InstallPlan,
  type ManagedFileContentSnapshot,
  type ManagedManifestSnapshot,
} from "../../src/domain/installation/index.js";

describe("安装修订重放", () => {
  it.each([
    [[], InstallationRevisionStatus.IntentPersisted],
    [[fileApplied(".codex/a.json")], InstallationRevisionStatus.FilesApplying],
    [
      [
        fileApplied(".codex/a.json"),
        fileApplied(".codex/b.json"),
        event(InstallationRevisionEventType.ManifestApplied),
      ],
      InstallationRevisionStatus.ManifestApplied,
    ],
    [completedEvents().slice(0, -1), InstallationRevisionStatus.PostconditionsVerified],
    [completedEvents(), InstallationRevisionStatus.Committed],
  ] as const)("按合法阶段重放为 %s", (events, status) => {
    const replayed = replayInstallationRevision(record([...events]));
    expect(replayed).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status,
        appliedPaths: events.flatMap((value) =>
          value.type === InstallationRevisionEventType.FileApplied ? [value.path] : [],
        ),
        manifestApplied: events.some(
          (value) => value.type === InstallationRevisionEventType.ManifestApplied,
        ),
        postconditionsVerified: events.some(
          (value) => value.type === InstallationRevisionEventType.PostconditionsVerified,
        ),
      },
    });
  });

  it.each([
    [
      "文件未全部完成就应用清单",
      [fileApplied(".codex/a.json"), event(InstallationRevisionEventType.ManifestApplied)],
    ],
    ["跳过项不能记录文件检查点", [fileApplied(".codex/skip.json")]],
    ["同一路径不能重复记录", [fileApplied(".codex/a.json"), fileApplied(".codex/a.json")]],
    [
      "清单之后不能再记录文件",
      [
        ...completedFileEvents(),
        event(InstallationRevisionEventType.ManifestApplied),
        fileApplied(".codex/a.json"),
      ],
    ],
    ["清单之前不能验证后置条件", [event(InstallationRevisionEventType.PostconditionsVerified)]],
    ["后置条件之前不能提交", [event(InstallationRevisionEventType.Committed)]],
    [
      "终态之后不能追加事件",
      [...completedEvents(), event(InstallationRevisionEventType.Committed)],
    ],
  ] as const)("拒绝非法顺序：%s", (_name, events) => {
    expect(replayInstallationRevision(record([...events]))).toMatchObject({
      status: ResultStatus.Failure,
    });
  });

  it("计算记录摘要时排除摘要字段自身", () => {
    const value = record([]);
    const input = {
      schemaVersion: value.schemaVersion,
      revisionId: value.revisionId,
      intent: value.intent,
      events: value.events,
    };
    let received: unknown;
    const calculated = calculateInstallationRevisionRecordDigest((candidate) => {
      received = candidate;
      return success(digest("e"));
    }, input);

    expect(calculated).toEqual(success(digest("e")));
    expect(received).toEqual(input);
  });
});

describe("安装修订恢复分类", () => {
  it.each([
    [
      "全部保持前置状态",
      beforeFiles(),
      missingManifest(),
      InstallationRecoveryDisposition.RestartPermitted,
    ],
    ["全部达到目标状态", desiredFiles(), afterManifest(), InstallationRecoveryDisposition.Complete],
    [
      "清单已应用但文件未完成",
      [beforeFile(".codex/a.json"), desiredFile(".codex/b.json")],
      afterManifest(),
      InstallationRecoveryDisposition.HumanRequired,
    ],
    [
      "清单未应用且文件处于前置或目标状态",
      [beforeFile(".codex/a.json"), desiredFile(".codex/b.json")],
      missingManifest(),
      InstallationRecoveryDisposition.RollbackPermitted,
    ],
    [
      "文件出现未知漂移",
      [
        {
          path: ".codex/a.json",
          kind: ManagedFileActualKind.RegularFile,
          content: "漂移",
          digest: digest("f"),
        },
        beforeFile(".codex/b.json"),
      ],
      missingManifest(),
      InstallationRecoveryDisposition.HumanRequired,
    ],
  ] as const)("分类为预期处置：%s", (_name, files, manifest, disposition) => {
    expect(classifyInstallationRecovery(intent(), files, manifest)).toBe(disposition);
  });

  it("恢复分类不把 Skip 项当作写入项", () => {
    const skippedDrift: ManagedFileContentSnapshot = {
      path: ".codex/skip.json",
      kind: ManagedFileActualKind.RegularFile,
      content: "人工修改",
      digest: digest("f"),
    };
    expect(
      classifyInstallationRecovery(intent(), [...desiredFiles(), skippedDrift], afterManifest()),
    ).toBe(InstallationRecoveryDisposition.Complete);
  });
});

function record(events: readonly InstallationRevisionEvent[]): InstallationRevisionRecord {
  return {
    schemaVersion: INSTALLATION_REVISION_SCHEMA_VERSION,
    revisionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" as InstallationRevisionRecord["revisionId"],
    intent: intent(),
    events,
    recordDigest: digest("d"),
  };
}

function intent(): InstallationRevisionIntent {
  const value = plan();
  return {
    revisionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" as InstallationRevisionIntent["revisionId"],
    plan: value,
    approval: {
      gate: ManagedFileGateId.G0ManagedFiles,
      actorId: "human-1",
      idempotencyKey: "apply-1",
      approvedAt: "2026-07-15T00:00:00.000Z",
      planId: value.planId,
      planDigest: value.planDigest,
    },
    preimages: beforeFiles(),
    manifestAfter: { content: "{}\n", digest: digest("c"), entries: [] },
    createdDirectories: [".codex", ".liushi-harness"],
  };
}

function plan(): InstallPlan {
  const files = [writableFile(".codex/a.json", "a"), writableFile(".codex/b.json", "b")];
  const skipped = writableFile(".codex/skip.json", "c");
  return {
    schemaVersion: 1,
    planId: "01ARZ3NDEKTSV4RRFFQ69G5FAA" as InstallPlan["planId"],
    planDigest: digest("b"),
    workspaceId: "workspace-1" as InstallPlan["workspaceId"],
    repositoryId: "repository-1" as InstallPlan["repositoryId"],
    root: "C:/repository",
    target: InstallationTarget.Codex,
    createdAt: "2026-07-15T00:00:00.000Z",
    createdBy: "human-1",
    requiredGate: ManagedFileGateId.G0ManagedFiles,
    manifest: missingManifest(),
    files: [...files, { ...skipped, action: FileInstallAction.Skip }],
  };
}

function writableFile(path: string, marker: string) {
  const desired: DesiredManagedFile = {
    path,
    content: `目标-${marker}`,
    digest: digest(marker),
    metadata: {
      ownerPackage: "liushi-harness",
      profile: "codex",
      packageVersion: "test",
      template: path,
      source: "test",
      sourceDigest: digest("9"),
    },
  };
  return {
    path,
    action: FileInstallAction.Create,
    desired,
    actual: { path, kind: ManagedFileActualKind.Missing },
  } as const;
}

function completedFileEvents(): InstallationRevisionEvent[] {
  return [fileApplied(".codex/a.json"), fileApplied(".codex/b.json")];
}

function completedEvents(): InstallationRevisionEvent[] {
  return [
    ...completedFileEvents(),
    event(InstallationRevisionEventType.ManifestApplied),
    event(InstallationRevisionEventType.PostconditionsVerified),
    event(InstallationRevisionEventType.Committed),
  ];
}

function fileApplied(path: string): InstallationRevisionEvent {
  return {
    type: InstallationRevisionEventType.FileApplied,
    path,
    recordedAt: "2026-07-15T00:00:01.000Z",
  };
}

function event(
  type: Exclude<InstallationRevisionEventType, InstallationRevisionEventType.FileApplied>,
): InstallationRevisionEvent {
  return { type, recordedAt: "2026-07-15T00:00:02.000Z" };
}

function beforeFiles(): ManagedFileContentSnapshot[] {
  return [beforeFile(".codex/a.json"), beforeFile(".codex/b.json")];
}

function desiredFiles(): ManagedFileContentSnapshot[] {
  return [desiredFile(".codex/a.json"), desiredFile(".codex/b.json")];
}

function beforeFile(path: string): ManagedFileContentSnapshot {
  return { path, kind: ManagedFileActualKind.Missing };
}

function desiredFile(path: string): ManagedFileContentSnapshot {
  const marker = path.includes("a.json") ? "a" : "b";
  return {
    path,
    kind: ManagedFileActualKind.RegularFile,
    content: `目标-${marker}`,
    digest: digest(marker),
  };
}

function missingManifest(): ManagedManifestSnapshot {
  return { state: ManagedManifestState.Missing, entries: [] };
}

function afterManifest(): ManagedManifestSnapshot {
  return { state: ManagedManifestState.Present, content: "{}\n", digest: digest("c"), entries: [] };
}

function digest(marker: string): ContentDigest {
  const parsed = parseContentDigest(`sha256:${marker.repeat(64)}`);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}
