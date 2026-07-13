import { describe, expect, it } from "vitest";

import {
  CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
  CodingTaskCommandType,
  IMPLEMENTATION_APPLY_COMMAND_TYPE,
  IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
  ResultStatus,
  VERIFICATION_RUN_COMMAND_TYPE,
  WORKTREE_PROVISION_COMMAND_TYPE,
  parseCodingTaskCellManifest,
} from "../../src/index.js";

describe("CodingTask Cell Manifest 校验", () => {
  it("接受严格版本、固定命令类型与多个 Implementation", () => {
    const result = parseCodingTaskCellManifest(createManifest(3));

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.implementations).toHaveLength(3);
    }
  });

  it.each([
    ["版本错误", (manifest: Record<string, unknown>) => ({ ...manifest, schemaVersion: "v2" })],
    ["顶层多余字段", (manifest: Record<string, unknown>) => ({ ...manifest, extra: true })],
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
    expect(parseCodingTaskCellManifest(mutate(createManifest())).status).toBe(ResultStatus.Failure);
  });

  it("拒绝任一阶段的错误 Command Type", () => {
    const manifest = createManifest();
    manifest.provision.command["commandType"] = CodingTaskCommandType.StartAttempt;

    const result = parseCodingTaskCellManifest(manifest);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["field"]).toBe("commandType");
    }
  });

  it.each(["aggregateId", "correlationId"])("拒绝不一致的 %s", (field) => {
    const manifest = createManifest();
    manifest.submission.command[field] = `different-${field}`;

    const result = parseCodingTaskCellManifest(manifest);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) expect(result.error.details["field"]).toBe(field);
  });

  it("拒绝非 CodingTask Aggregate", () => {
    const manifest = createManifest();
    manifest.implementations[0]!.command["aggregateType"] = "task";

    const result = parseCodingTaskCellManifest(manifest);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["field"]).toBe("aggregateType");
    }
  });

  it("拒绝重复 commandId", () => {
    const manifest = createManifest();
    manifest.verification.command["commandId"] = manifest.createCommand["commandId"];

    const result = parseCodingTaskCellManifest(manifest);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["field"]).toBe("commandId");
    }
  });

  it("Implementation 数量不设置上限预算", () => {
    expect(parseCodingTaskCellManifest(createManifest(128)).status).toBe(ResultStatus.Success);
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
      command: command("verification", VERIFICATION_RUN_COMMAND_TYPE, aggregateId, correlationId),
      runtime: { worktreeRoot: "C:\\repository\\worktrees\\task" },
    },
  };
}

function command(
  commandId: string,
  commandType: string,
  aggregateId: string,
  correlationId: string,
): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    commandId,
    commandType,
    aggregateType: "coding_task",
    aggregateId,
    expectedVersion: 0,
    idempotencyKey: commandId,
    requestDigest: `sha256:${"a".repeat(64)}`,
    actor: { kind: "agent", actorId: "agent-1" },
    authorizationContext: {},
    correlationId,
    submittedAt: "2026-07-14T00:00:00.000Z",
    payload: {},
  };
}
