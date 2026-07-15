import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createHarnessApplication } from "../../src/bootstrap/index.js";
import { ResultStatus } from "../../src/common/index.js";
import {
  FileInstallAction,
  InstallationApplyDisposition,
  InstallationRevisionStatus,
  InstallationTarget,
  ManagedOwnershipProvenance,
} from "../../src/domain/index.js";
import { FixedClock, FixedSequenceIdGenerator } from "../support/runtime/index.js";

const planIds = [
  "01ARZ3NDEKTSV4RRFFQ69G5FA1",
  "01ARZ3NDEKTSV4RRFFQ69G5FA2",
  "01ARZ3NDEKTSV4RRFFQ69G5FA3",
] as const;
const revisionId = "01ARZ3NDEKTSV4RRFFQ69G5FB1";
const createdRoots: string[] = [];

describe("Installation lifecycle", () => {
  afterEach(async () => {
    await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true })));
  });

  it("跨进程闭合首次安装、可信复用和漂移拒绝", async () => {
    const root = await mkdtemp(join(tmpdir(), "liushi-installation-lifecycle-"));
    createdRoots.push(root);
    const repositoryRoot = join(root, "repository");
    const storeRoot = join(root, "runtime-store");
    await mkdir(repositoryRoot);

    const firstApplication = createApplication(storeRoot, [planIds[0]], [revisionId]);
    const firstPlanResult = await firstApplication.createInstallPlan.execute({
      target: InstallationTarget.Codex,
      root: repositoryRoot,
      workspaceId: "workspace-1",
      repositoryId: "repository-1",
      actorId: "planner-1",
    });
    if (firstPlanResult.status === ResultStatus.Failure) throw firstPlanResult.error;
    expect(firstPlanResult.value.plan.files.map((file) => file.action)).toEqual([
      FileInstallAction.Create,
    ]);
    await expect(readFile(join(repositoryRoot, ".codex", "hooks.json"), "utf8")).rejects.toThrow();

    const applied = await firstApplication.applyInstallPlan.execute({
      workspaceId: "workspace-1",
      repositoryId: "repository-1",
      planId: firstPlanResult.value.plan.planId,
      planDigest: firstPlanResult.value.plan.planDigest,
      actorId: "human-1",
      idempotencyKey: "apply-installation-1",
    });
    expect(applied).toMatchObject({
      status: ResultStatus.Success,
      value: {
        disposition: InstallationApplyDisposition.Applied,
        revisionId,
        status: InstallationRevisionStatus.Committed,
        repositoryMutated: true,
      },
    });
    const hookContent = await readFile(join(repositoryRoot, ".codex", "hooks.json"), "utf8");
    const manifestContent = await readFile(
      join(repositoryRoot, ".liushi-harness", "managed-files.json"),
      "utf8",
    );
    expect(JSON.parse(hookContent)).toBeTypeOf("object");
    expect(JSON.parse(manifestContent)).toMatchObject({
      schemaVersion: 1,
      entries: [{ path: ".codex/hooks.json", installationRevisionId: revisionId }],
    });

    const reused = await firstApplication.applyInstallPlan.execute({
      workspaceId: "workspace-1",
      repositoryId: "repository-1",
      planId: firstPlanResult.value.plan.planId,
      planDigest: firstPlanResult.value.plan.planDigest,
      actorId: "human-1",
      idempotencyKey: "apply-installation-1",
    });
    expect(reused).toMatchObject({
      status: ResultStatus.Success,
      value: {
        disposition: InstallationApplyDisposition.Reused,
        repositoryMutated: false,
      },
    });

    const restartedApplication = createApplication(storeRoot, [planIds[1]], []);
    const secondPlanResult = await restartedApplication.createInstallPlan.execute({
      target: InstallationTarget.Codex,
      root: repositoryRoot,
      workspaceId: "workspace-1",
      repositoryId: "repository-1",
      actorId: "planner-2",
    });
    if (secondPlanResult.status === ResultStatus.Failure) throw secondPlanResult.error;
    expect(secondPlanResult.value.plan.files[0]).toMatchObject({
      action: FileInstallAction.Skip,
      persisted: { provenance: ManagedOwnershipProvenance.VerifiedRevision },
    });

    await writeFile(join(repositoryRoot, ".codex", "hooks.json"), "human-change\n", "utf8");
    const driftApplication = createApplication(storeRoot, [planIds[2]], []);
    const driftPlanResult = await driftApplication.createInstallPlan.execute({
      target: InstallationTarget.Codex,
      root: repositoryRoot,
      workspaceId: "workspace-1",
      repositoryId: "repository-1",
      actorId: "planner-3",
    });
    if (driftPlanResult.status === ResultStatus.Failure) throw driftPlanResult.error;
    expect(driftPlanResult.value.plan.files[0]?.action).toBe(FileInstallAction.Conflict);
    const rejected = await driftApplication.applyInstallPlan.execute({
      workspaceId: "workspace-1",
      repositoryId: "repository-1",
      planId: driftPlanResult.value.plan.planId,
      planDigest: driftPlanResult.value.plan.planDigest,
      actorId: "human-1",
      idempotencyKey: "apply-installation-drift",
    });
    expect(rejected).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: "operation_forbidden" },
    });
    expect(await readFile(join(repositoryRoot, ".codex", "hooks.json"), "utf8")).toBe(
      "human-change\n",
    );
  });
});

function createApplication(
  storeRoot: string,
  selectedPlanIds: readonly string[],
  revisionIds: readonly string[],
) {
  return createHarnessApplication({
    storeRoot,
    packageVersion: "test",
    clock: new FixedClock("2026-07-15T00:00:00.000Z"),
    installPlanIdGenerator: new FixedSequenceIdGenerator(selectedPlanIds),
    installationRevisionIdGenerator: new FixedSequenceIdGenerator(revisionIds),
    repositoryLockIdGenerator: new FixedSequenceIdGenerator([
      "installation-lock-1",
      "installation-lock-2",
    ]),
  });
}
