import { appendFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  HarnessErrorCode,
  ResultStatus,
  TRACE_OBSERVATION_SCHEMA_VERSION,
  TraceDropReason,
  TraceOperationKind,
  TraceSpanKind,
  TraceStatusCode,
  TraceWriteDisposition,
  parseTaskId,
  parseWorkspaceId,
} from "../../src/index.js";
import { ExclusiveFileLockManager } from "../../src/infrastructure/persistence/fileEventStore/index.js";
import { FileTraceObservationStore } from "../../src/infrastructure/observability/fileTraceStore/index.js";
import { resolveTaskStorePaths } from "../../src/infrastructure/persistence/fileEventStore/taskStore/index.js";
import {
  createWorkflowMigrationApplication,
  workflowMigrationContext,
  workflowMigrationIds,
} from "../support/workflowMigration/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("File Trace Observation Store", () => {
  it("跨实例记录、过滤并容忍单条损坏 Trace，且不影响 Task Replay", async () => {
    const storeRoot = await runtimeStores.create("liushi-trace-");
    const app = createWorkflowMigrationApplication(storeRoot);
    await createTask(app);

    const recorded = await app.recordTraceObservation.execute({ observation: toolSpan() });
    expect(recorded).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: TraceWriteDisposition.Persisted },
    });

    const paths = tracePaths(storeRoot);
    await appendFile(paths.tracesFile, "{invalid-json}\n", "utf8");
    const restarted = createWorkflowMigrationApplication(storeRoot);
    const queried = await restarted.listTraceObservations.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      taskId: workflowMigrationIds.taskId,
      correlationId: "correlation-trace",
    });
    expect(queried.status).toBe(ResultStatus.Success);
    if (queried.status === ResultStatus.Success) {
      expect(queried.value.observations).toHaveLength(1);
      expect(queried.value.observations[0]?.tool?.toolCallId).toBe("call-1");
      expect(queried.value.skippedRecordCount).toBe(1);
    }

    const task = await restarted.getTaskStatus.execute({
      workspaceId: workflowMigrationContext.workspaceId,
      taskId: workflowMigrationIds.taskId,
    });
    expect(task.status).toBe(ResultStatus.Success);
  });

  it("Trace Lock 冲突只丢弃观测，不让调用方进入失败状态", async () => {
    const storeRoot = await runtimeStores.create("liushi-trace-lock-");
    const app = createWorkflowMigrationApplication(storeRoot);
    await createTask(app);
    const paths = tracePaths(storeRoot);
    const lock = await new ExclusiveFileLockManager().acquire(paths.tracesLockFile, {
      workspaceId: paths.workspaceId,
      taskId: paths.taskId,
    });

    try {
      const result = await app.recordTraceObservation.execute({ observation: toolSpan() });
      expect(result).toEqual({
        status: ResultStatus.Success,
        value: {
          disposition: TraceWriteDisposition.Dropped,
          reason: TraceDropReason.Contended,
          recoveryPaths: [],
        },
      });
    } finally {
      await lock.release();
    }
  });

  it("Task 不存在时只返回可分类 Dropped 结果", async () => {
    const storeRoot = await runtimeStores.create("liushi-trace-missing-task-");
    const result = await createWorkflowMigrationApplication(
      storeRoot,
    ).recordTraceObservation.execute({ observation: toolSpan() });

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: {
        disposition: TraceWriteDisposition.Dropped,
        reason: TraceDropReason.TaskUnavailable,
        recoveryPaths: [],
      },
    });
  });
  it("pathExists 发生非 ENOENT I/O 异常时查询返回 IoFailure 而不是 reject", async () => {
    const storeRoot = await runtimeStores.create("liushi-trace-query-io-");
    const paths = tracePaths(storeRoot);
    const missingTask = await new FileTraceObservationStore(storeRoot, {
      lockManager: new ExclusiveFileLockManager(),
    }).query({
      workspaceId: paths.workspaceId,
      taskId: paths.taskId,
    });
    expect(missingTask).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.TaskNotFound },
    });

    const pathExistsError = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const store = new FileTraceObservationStore(storeRoot, {
      lockManager: new ExclusiveFileLockManager(),
      pathExists: (path) => {
        expect(path).toBe(paths.eventsFile);
        return Promise.reject(pathExistsError);
      },
    });

    const result = await store.query({
      workspaceId: paths.workspaceId,
      taskId: paths.taskId,
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.IoFailure },
    });
  });
});

async function createTask(
  app: ReturnType<typeof createWorkflowMigrationApplication>,
): Promise<void> {
  const created = await app.createTask.execute({
    workspaceId: workflowMigrationContext.workspaceId,
    source: "ticket-trace",
    actor: workflowMigrationContext.actor,
  });
  expect(created.status).toBe(ResultStatus.Success);
}

function tracePaths(storeRoot: string) {
  const workspaceId = parseWorkspaceId(workflowMigrationContext.workspaceId);
  const taskId = parseTaskId(workflowMigrationIds.taskId);
  if (workspaceId.status === ResultStatus.Failure || taskId.status === ResultStatus.Failure) {
    throw new Error("Trace 测试必须使用有效 Locator。");
  }
  return resolveTaskStorePaths(storeRoot, workspaceId.value, taskId.value);
}

function toolSpan() {
  return {
    schemaVersion: TRACE_OBSERVATION_SCHEMA_VERSION,
    traceId: "11111111111111111111111111111111",
    spanId: "2222222222222222",
    workspaceId: workflowMigrationContext.workspaceId,
    taskId: workflowMigrationIds.taskId,
    commandId: "command-trace",
    correlationId: "correlation-trace",
    actor: workflowMigrationContext.actor,
    operationKind: TraceOperationKind.Tool,
    operationName: "workspace.writeFile",
    spanKind: TraceSpanKind.Client,
    status: TraceStatusCode.Ok,
    startedAt: "2026-07-12T00:00:01.000Z",
    endedAt: "2026-07-12T00:00:02.000Z",
    tool: { toolName: "workspace.writeFile", toolCallId: "call-1" },
  };
}
