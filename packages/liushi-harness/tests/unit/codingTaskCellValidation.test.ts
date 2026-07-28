import { describe, expect, it } from "vitest";

import {
  CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
  CodingTaskCellRevisionBinding,
  CodingTaskCellStage,
  CodingTaskCommandType,
  FailureTaxonomy,
  IMPLEMENTATION_APPLY_COMMAND_TYPE,
  IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
  ResultStatus,
  VERIFICATION_RUN_COMMAND_TYPE,
  VERIFICATION_PLAN_SCHEMA_VERSION,
  VerificationKind,
  VerificationRequirement,
  WORKTREE_PROVISION_COMMAND_TYPE,
  parseCodingTaskCellManifest,
} from "../../src/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";

const digest = new Rfc8785Sha256DigestAdapter();

describe("CodingTask Cell Manifest 校验", () => {
  it("接受严格版本、固定命令类型与多个 Implementation", () => {
    const result = parseCodingTaskCellManifest(createManifest(3), digest);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.implementations).toHaveLength(3);
    }
  });

  it.each([
    ["版本错误", (manifest: Record<string, unknown>) => ({ ...manifest, schemaVersion: "v2" })],
    ["顶层多余字段", (manifest: Record<string, unknown>) => ({ ...manifest, extra: true })],
    [
      "调用方注入 EvidenceBundle",
      (manifest: Record<string, unknown>) => ({
        ...manifest,
        evidenceBundle: { status: "passed" },
      }),
    ],
    [
      "nested step 多余字段",
      (manifest: Record<string, unknown>) => ({
        ...manifest,
        provision: { ...(manifest["provision"] as object), extra: true },
      }),
    ],
    [
      "Implementation 为空",
      (manifest: Record<string, unknown>) => ({ ...manifest, implementations: [] }),
    ],
  ])("拒绝%s", (_name, mutate) => {
    expect(parseCodingTaskCellManifest(mutate(createManifest()), digest).status).toBe(
      ResultStatus.Failure,
    );
  });

  it("拒绝任一阶段的错误 Command Type", () => {
    const manifest = createManifest();
    manifest.provision.command["commandType"] = CodingTaskCommandType.StartAttempt;

    const result = parseCodingTaskCellManifest(manifest, digest);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["field"]).toBe("commandType");
    }
  });

  it.each(["aggregateId", "correlationId"])("拒绝不一致的 %s", (field) => {
    const manifest = createManifest();
    manifest.submission.command[field] = `different-${field}`;

    const result = parseCodingTaskCellManifest(manifest, digest);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) expect(result.error.details["field"]).toBe(field);
  });

  it("拒绝非 CodingTask Aggregate", () => {
    const manifest = createManifest();
    manifest.implementations[0]!.command["aggregateType"] = "task";

    const result = parseCodingTaskCellManifest(manifest, digest);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["field"]).toBe("aggregateType");
    }
  });

  it("拒绝重复 commandId", () => {
    const manifest = createManifest();
    manifest.verification.command["commandId"] = manifest.createCommand["commandId"];

    const result = parseCodingTaskCellManifest(manifest, digest);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["field"]).toBe("commandId");
    }
  });

  it("Implementation 数量不设置上限预算", () => {
    expect(parseCodingTaskCellManifest(createManifest(128), digest).status).toBe(
      ResultStatus.Success,
    );
  });

  it("拒绝 Template requestDigest 不匹配", () => {
    const manifest = createManifest();
    manifest.verification.command["requestDigest"] = `sha256:${"f".repeat(64)}`;

    const result = parseCodingTaskCellManifest(manifest, digest);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["stage"]).toBe(CodingTaskCellStage.VerificationBinding);
    }
  });

  it.each(["missing", "extra"])("拒绝 %s targetRevision", (kind) => {
    const manifest = createManifest();
    const payload = manifest.verification.command["payload"] as Record<string, unknown>;
    const plan = payload["plan"] as Record<string, unknown>;
    if (kind === "extra") plan["targetRevision"] = "caller-revision";
    else delete plan["baseRevision"];
    manifest.verification.command["requestDigest"] = calculateDigest(payload);

    expect(parseCodingTaskCellManifest(manifest, digest).status).toBe(ResultStatus.Failure);
  });

  it("拒绝未知 binding enum", () => {
    const manifest = createManifest();
    manifest.verification.binding = "latest" as CodingTaskCellRevisionBinding;

    expect(parseCodingTaskCellManifest(manifest, digest).status).toBe(ResultStatus.Failure);
  });
});

function createManifest(implementationCount = 1) {
  const aggregateId = "coding-task-cell-1";
  const correlationId = "cell-correlation-1";
  return {
    schemaVersion: CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
    createCommand: command("create", CodingTaskCommandType.Create, aggregateId, correlationId),
    provision: {
      command: command("provision", WORKTREE_PROVISION_COMMAND_TYPE, aggregateId, correlationId),
      runtime: { repositoryRoot: "C:\\repository" },
    },
    startAttemptCommand: command(
      "start",
      CodingTaskCommandType.StartAttempt,
      aggregateId,
      correlationId,
    ),
    implementations: Array.from({ length: implementationCount }, (_, index) => ({
      command: command(
        `implementation-${index}`,
        IMPLEMENTATION_APPLY_COMMAND_TYPE,
        aggregateId,
        correlationId,
      ),
      runtime: { repositoryRoot: "C:\\repository" },
    })),
    submission: {
      command: command(
        "submission",
        IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
        aggregateId,
        correlationId,
      ),
      runtime: { repositoryRoot: "C:\\repository" },
    },
    verification: {
      command: command(
        "verification",
        VERIFICATION_RUN_COMMAND_TYPE,
        aggregateId,
        correlationId,
        verificationPayload(),
      ),
      binding: CodingTaskCellRevisionBinding.LatestImplementationCheckpoint,
      runtime: { worktreeRoot: "C:\\repository\\worktrees\\task" },
    },
  };
}

function command(
  commandId: string,
  commandType: string,
  aggregateId: string,
  correlationId: string,
  payload: unknown = {},
): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    commandId,
    commandType,
    aggregateType: "coding_task",
    aggregateId,
    expectedVersion: 0,
    idempotencyKey: commandId,
    requestDigest: calculateDigest(payload),
    actor: { kind: "agent", actorId: "agent-1" },
    authorizationContext: {},
    correlationId,
    submittedAt: "2026-07-14T00:00:00.000Z",
    payload,
  };
}

function verificationPayload() {
  return {
    workspaceId: "workspace-1",
    actionId: "01ARZ3NDEKTSV4RRFFQ69G5FB1",
    verificationRunId: "verification-run-1",
    attemptNumber: 1,
    worktreeRootDigest: `sha256:${"b".repeat(64)}`,
    plan: {
      schemaVersion: VERIFICATION_PLAN_SCHEMA_VERSION,
      planId: "plan-1",
      repositoryId: "repository-1",
      worktreeId: "worktree-1",
      expectedBranchName: "feature/cell",
      baseRevision: "base-revision-1",
      sourceRefs: verificationPlanSourceRefs(),
      checks: [
        {
          checkId: "check-1",
          kind: VerificationKind.Typecheck,
          requirement: VerificationRequirement.Required,
          command: {
            executable: "node",
            args: ["--version"],
            workingDirectory: "",
            allowedEnvironmentKeys: [],
          },
          timeoutMs: 1_000,
          retryable: false,
        },
      ],
    },
    failedVerificationTaxonomy: FailureTaxonomy.ImplementationDefect,
  };
}

function verificationPlanSourceRefs() {
  return {
    projectProfileBundleDigest: `sha256:${"1".repeat(64)}`,
    projectProfileDigest: `sha256:${"2".repeat(64)}`,
    proposalArtifactDigest: `sha256:${"3".repeat(64)}`,
    profileApprovalId: "01ARZ3NDEKTSV4RRFFQ69G5HBP",
    applicableRuleBundleDigest: `sha256:${"4".repeat(64)}`,
  };
}

function calculateDigest(value: unknown): string {
  const result = digest.calculate(value);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
