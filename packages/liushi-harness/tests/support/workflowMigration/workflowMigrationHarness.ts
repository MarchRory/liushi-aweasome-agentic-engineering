import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
  FileSnapshotStore,
  FileTaskRepository,
} from "../../../src/infrastructure/index.js";
import {
  createHarnessApplication,
  parseTaskId,
  parseWorkspaceId,
  ResultStatus,
  type HarnessApplication,
  type TaskLocator,
  type TaskRepository,
  type TaskRunEventRecord,
} from "../../../src/index.js";
import { FixedClock, FixedSequenceIdGenerator } from "../runtime/index.js";
import { workflowMigrationContext, workflowMigrationIds } from "./goldenStreams.js";

// 所有 Golden Replay 都使用测试临时目录，避免依赖本机固定路径。
export function createWorkflowMigrationApplication(
  storeRoot: string,
  options: {
    eventIds?: readonly string[];
    artifactIds?: readonly string[];
    decisionRequestIds?: readonly string[];
    approvalIds?: readonly string[];
  } = {},
): HarnessApplication {
  return createHarnessApplication({
    storeRoot,
    clock: new FixedClock(workflowMigrationContext.occurredAt),
    taskIdGenerator: new FixedSequenceIdGenerator([workflowMigrationIds.taskId]),
    eventIdGenerator: new FixedSequenceIdGenerator(
      options.eventIds ?? workflowMigrationIds.eventIds,
    ),
    artifactIdGenerator: new FixedSequenceIdGenerator(
      options.artifactIds ?? workflowMigrationIds.artifactIds,
    ),
    decisionRequestIdGenerator: new FixedSequenceIdGenerator(
      options.decisionRequestIds ?? workflowMigrationIds.decisionRequestIds,
    ),
    approvalIdGenerator: new FixedSequenceIdGenerator(
      options.approvalIds ?? workflowMigrationIds.approvalIds,
    ),
  });
}

export function createWorkflowMigrationRepository(storeRoot: string): TaskRepository {
  return new FileTaskRepository(storeRoot, {
    eventIdGenerator: new FixedSequenceIdGenerator(workflowMigrationIds.eventIds),
    snapshotStore: new FileSnapshotStore(),
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
}

export function createWorkflowMigrationLocator(): TaskLocator {
  const workspaceId = parseWorkspaceId(workflowMigrationContext.workspaceId);
  const taskId = parseTaskId(workflowMigrationIds.taskId);
  if (workspaceId.status === ResultStatus.Failure || taskId.status === ResultStatus.Failure) {
    throw new Error("Golden Workflow locator 必须使用有效的 WorkspaceId 和 TaskId。");
  }

  return { workspaceId: workspaceId.value, taskId: taskId.value };
}

export async function readWorkflowMigrationEvents(
  storeRoot: string,
): Promise<readonly TaskRunEventRecord[]> {
  const contents = await readFile(eventsFile(storeRoot), "utf8");
  return contents
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as TaskRunEventRecord);
}

export async function removeWorkflowMigrationSnapshot(storeRoot: string): Promise<void> {
  await rm(snapshotFile(storeRoot));
}

function taskDirectory(storeRoot: string): string {
  return resolve(
    storeRoot,
    "workspaces",
    workflowMigrationContext.workspaceId,
    "tasks",
    workflowMigrationIds.taskId,
  );
}

function eventsFile(storeRoot: string): string {
  return resolve(taskDirectory(storeRoot), "events.jsonl");
}

function snapshotFile(storeRoot: string): string {
  return resolve(taskDirectory(storeRoot), "snapshot.json");
}
