import { describe, expect, it } from "vitest";

import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";
import { ResultStatus } from "../../src/common/index.js";
import {
  FileInstallAction,
  ManagedFileActualKind,
  ManagedOwnershipProvenance,
  planManagedFile,
  type DesiredManagedFile,
  type PersistedManagedFileState,
} from "../../src/domain/installation/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const desired = file("desired");
const applied = file("applied").digest;

describe("Managed File InstallPlan policy", () => {
  it.each([
    [
      "missing without ownership creates",
      { kind: ManagedFileActualKind.Missing },
      undefined,
      FileInstallAction.Create,
    ],
    [
      "human file conflicts even when content matches",
      { kind: ManagedFileActualKind.RegularFile, digest: desired.digest },
      undefined,
      FileInstallAction.Conflict,
    ],
    [
      "owned missing conflicts",
      { kind: ManagedFileActualKind.Missing },
      persisted(applied),
      FileInstallAction.Conflict,
    ],
    [
      "owned drift conflicts",
      { kind: ManagedFileActualKind.RegularFile, digest: file("drift").digest },
      persisted(applied),
      FileInstallAction.Conflict,
    ],
    [
      "owned older content updates",
      { kind: ManagedFileActualKind.RegularFile, digest: applied },
      persisted(applied),
      FileInstallAction.Update,
    ],
    [
      "owned desired content skips",
      { kind: ManagedFileActualKind.RegularFile, digest: desired.digest },
      persisted(desired.digest),
      FileInstallAction.Skip,
    ],
    [
      "unsupported conflicts",
      { kind: ManagedFileActualKind.Unsupported },
      persisted(applied),
      FileInstallAction.Conflict,
    ],
  ] as const)("%s", (_name, actual, state, action) => {
    const result = planManagedFile(desired, { path: desired.path, ...actual }, state);
    expect(result).toMatchObject({ status: "success", value: { action } });
  });

  it("同路径由其他所有者登记时保持冲突", () => {
    const state = persisted(applied);
    const result = planManagedFile(
      desired,
      { path: desired.path, kind: ManagedFileActualKind.Missing },
      { ...state, metadata: { ...state.metadata, ownerPackage: "other-owner" } },
    );
    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { action: FileInstallAction.Conflict },
    });
  });

  it("同一所有者的包版本和来源摘要升级不会制造所有权冲突", () => {
    const state = persisted(applied);
    const result = planManagedFile(
      desired,
      { path: desired.path, kind: ManagedFileActualKind.RegularFile, digest: applied },
      {
        ...state,
        metadata: {
          ...state.metadata,
          packageVersion: "older",
          sourceDigest: calculateDigest("older-source"),
        },
      },
    );
    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { action: FileInstallAction.Update },
    });
  });
});

function file(content: string): DesiredManagedFile {
  const calculated = digest.calculate(content);
  if (calculated.status === ResultStatus.Failure) throw calculated.error;
  return { path: ".codex/hooks.json", content, digest: calculated.value, metadata: metadata() };
}

function persisted(lastAppliedDigest: DesiredManagedFile["digest"]): PersistedManagedFileState {
  return {
    path: ".codex/hooks.json",
    lastAppliedDigest,
    repositoryId: "repository-1" as PersistedManagedFileState["repositoryId"],
    installationRevisionId:
      "01ARZ3NDEKTSV4RRFFQ69G5FAV" as PersistedManagedFileState["installationRevisionId"],
    installPlanDigest: calculateDigest("plan"),
    original: { kind: ManagedFileActualKind.Missing },
    provenance: ManagedOwnershipProvenance.VerifiedRevision,
    metadata: metadata(),
  };
}

function metadata() {
  return {
    ownerPackage: "liushi-harness",
    profile: "codex",
    packageVersion: "test",
    template: ".codex/hooks.json",
    source: "test",
    sourceDigest: calculateDigest("source"),
  };
}

function calculateDigest(value: string) {
  const result = digest.calculate(value);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
