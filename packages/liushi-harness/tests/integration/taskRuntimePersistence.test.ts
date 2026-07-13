import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ActorKind,
  HarnessErrorCode,
  ResultStatus,
  TaskPhase,
  TaskRunState,
  createHarnessApplication,
  parseTaskId,
  parseWorkspaceId,
} from "../../src/index.js";
import {
  FixedClock,
  FixedSequenceIdGenerator,
  TemporaryRuntimeStore,
} from "../support/runtime/index.js";
import { ACTION_EXECUTION_LOCKS_DIRECTORY_NAME } from "../../src/infrastructure/persistence/fileEventStore/constants/index.js";
import { assertNewTaskStore } from "../../src/infrastructure/persistence/fileEventStore/taskCreation/taskCreationGuards.js";
import { resolveTaskStorePaths } from "../../src/infrastructure/persistence/fileEventStore/taskStore/index.js";

const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const EVENT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const WORKSPACE_ID = "workspace-a";
const ACTOR = { kind: ActorKind.Human, actorId: "tester" };
const CREATED_AT = "2026-07-11T00:00:00.000Z";
const ONE_MIB = 1_048_576;
const UNKNOWN_TASK_ENTRY_NAME = "foreign-state.txt";
const UNKNOWN_TASK_ENTRY_CONTENT = "owned by another runtime\n";
const CHILD_SIGNAL_WATCHDOG_MS = 5_000;
const runtimeStores = new TemporaryRuntimeStore();
const CHILD_LOCK_HOLDER_SCRIPT = String.raw`
import { open, rm } from "node:fs/promises";

const lockFile = process.argv[1];
if (lockFile === undefined) {
  throw new Error("Lock file argument is required.");
}

const lockHandle = await open(lockFile, "wx");
let released = false;
async function releaseLock() {
  if (released) return;
  released = true;
  await lockHandle.close();
  await rm(lockFile, { force: true });
}

try {
  process.stdout.write("ready\n");
  let command = "";
  for await (const chunk of process.stdin) {
    command += chunk.toString();
    if (command.includes("\n")) break;
  }
  if (command.trim() !== "release") {
    throw new Error("Expected release command.");
  }
  await releaseLock();
  process.stdout.write("released\n");
} finally {
  await releaseLock();
}
`;

afterEach(async () => runtimeStores.cleanup());

describe("Task runtime 持久化纵向切片", () => {
  it("create -> event/snapshot -> 新 Application 实例重启 -> status", async () => {
    const storeRoot = await makeStoreRoot("liushi-task-restart-");
    const app = makeApp(storeRoot);

    const created = await app.createTask.execute({
      workspaceId: WORKSPACE_ID,
      source: "ticket-123",
      actor: ACTOR,
    });

    expect(created.status).toBe(ResultStatus.Success);
    await expect(stat(eventsFile(storeRoot)).then((fileStat) => fileStat.isFile())).resolves.toBe(
      true,
    );
    await expect(stat(snapshotFile(storeRoot)).then((fileStat) => fileStat.isFile())).resolves.toBe(
      true,
    );

    const restarted = createHarnessApplication({ storeRoot });
    const status = await restarted.getTaskStatus.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
    });

    expect(status.status).toBe(ResultStatus.Success);
    if (status.status === ResultStatus.Success) {
      expect(status.value).toEqual({
        schemaVersion: "1.0.0",
        taskId: TASK_ID,
        workspaceId: WORKSPACE_ID,
        source: "ticket-123",
        phase: TaskPhase.Context,
        runState: TaskRunState.Running,
        createdBy: ACTOR,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
    }
  });

  it("删除 snapshot 后从 event replay 恢复 status", async () => {
    const storeRoot = await makeStoreRoot("liushi-task-replay-");
    await createTask(storeRoot);
    await rm(snapshotFile(storeRoot));

    const restarted = createHarnessApplication({ storeRoot });
    const status = await restarted.getTaskStatus.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
    });

    expect(status.status).toBe(ResultStatus.Success);
    if (status.status === ResultStatus.Success) {
      expect(status.value.taskId).toBe(TASK_ID);
      expect(status.value.phase).toBe(TaskPhase.Context);
    }
    await expect(stat(snapshotFile(storeRoot))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("Action 执行锁目录存在时仍可重启加载 Task", async () => {
    const storeRoot = await makeStoreRoot("liushi-task-action-lock-directory-");
    await createTask(storeRoot);
    await mkdir(actionExecutionLocksDirectory(storeRoot));

    const status = await createHarnessApplication({ storeRoot }).getTaskStatus.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
    });

    expect(status.status).toBe(ResultStatus.Success);
  });

  it("空 Action 执行锁目录表示既有 Runtime，但新 Task 守卫仍拒绝复用", async () => {
    const storeRoot = await makeStoreRoot("liushi-task-empty-action-lock-directory-");
    await mkdir(actionExecutionLocksDirectory(storeRoot), { recursive: true });
    const paths = resolveTaskStorePaths(
      storeRoot,
      parseWorkspace(WORKSPACE_ID),
      parseTask(TASK_ID),
    );

    await expect(assertNewTaskStore(paths)).rejects.toMatchObject({
      code: HarnessErrorCode.CorruptStore,
    });

    const result = await makeApp(storeRoot).createTask.execute({
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
    });
    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.TaskAlreadyExists);
    }
  });

  it.each([
    ["event hash 被改", corruptEventHash],
    ["snapshot 与 event 不一致", corruptSnapshotSource],
    ["只有 snapshot 无 event", removeEventLog],
  ])("%s 时 fail closed 为 CorruptStore", async (_caseName, corrupt) => {
    const storeRoot = await makeStoreRoot("liushi-task-corrupt-");
    await createTask(storeRoot);
    await corrupt(storeRoot);

    const app = createHarnessApplication({ storeRoot });
    const status = await app.getTaskStatus.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
    });

    expect(status.status).toBe(ResultStatus.Failure);
    if (status.status === ResultStatus.Failure) {
      expect(status.error.code).toBe(HarnessErrorCode.CorruptStore);
    }
  });

  it.each([
    ["events.jsonl", eventsFile],
    ["snapshot.json", snapshotFile],
  ])("%s 超过 1 MiB 时 status 返回 CorruptStore", async (_fileName, targetFile) => {
    const storeRoot = await makeStoreRoot("liushi-task-oversized-file-");
    await createTask(storeRoot);
    await writeFile(targetFile(storeRoot), Buffer.alloc(ONE_MIB + 1, 0x20));

    const status = await createHarnessApplication({ storeRoot }).getTaskStatus.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
    });

    expect(status.status).toBe(ResultStatus.Failure);
    if (status.status === ResultStatus.Failure) {
      expect(status.error.code).toBe(HarnessErrorCode.CorruptStore);
    }
  });

  it("已有 lock 返回 LockUnavailable 且不改业务文件", async () => {
    const storeRoot = await makeStoreRoot("liushi-task-locked-");
    await mkdir(taskDirectory(storeRoot), { recursive: true });
    await writeFile(lockFile(storeRoot), "held by another process\n", "utf8");
    const before = await readdir(taskDirectory(storeRoot));

    const result = await makeApp(storeRoot).createTask.execute({
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.LockUnavailable);
    }
    expect(await readdir(taskDirectory(storeRoot))).toEqual(before);
    await expect(stat(eventsFile(storeRoot))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(snapshotFile(storeRoot))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("独立 Node 进程持有 lock 时 create 返回 LockUnavailable 并完成跨进程清理", async () => {
    const storeRoot = await makeStoreRoot("liushi-task-child-lock-");
    await mkdir(taskDirectory(storeRoot), { recursive: true });
    const child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", CHILD_LOCK_HOLDER_SCRIPT, lockFile(storeRoot)],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const childStderr: string[] = [];
    child.stderr.on("data", (chunk: Buffer) => childStderr.push(chunk.toString("utf8")));
    child.stdin.on("error", () => undefined);

    try {
      await waitForChildSignal(child, "ready", childStderr);
      await expect(stat(lockFile(storeRoot)).then((fileStat) => fileStat.isFile())).resolves.toBe(
        true,
      );

      const result = await makeApp(storeRoot).createTask.execute({
        workspaceId: WORKSPACE_ID,
        actor: ACTOR,
      });

      expect(result.status).toBe(ResultStatus.Failure);
      if (result.status === ResultStatus.Failure) {
        expect(result.error.code).toBe(HarnessErrorCode.LockUnavailable);
      }
      await expect(stat(eventsFile(storeRoot))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(snapshotFile(storeRoot))).rejects.toMatchObject({ code: "ENOENT" });

      const releasedSignal = waitForChildSignal(child, "released", childStderr);
      const childExit = waitForChildExit(child);
      child.stdin.end("release\n");
      await releasedSignal;
      await expect(childExit).resolves.toEqual({ code: 0, signal: null });
      await expect(stat(lockFile(storeRoot))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readdir(taskDirectory(storeRoot))).resolves.toEqual([]);
    } finally {
      await ensureLockHolderStopped(child, lockFile(storeRoot));
    }
  }, 10_000);

  it("Task 目录存在未知文件时 create fail closed 且不修改未知文件", async () => {
    const storeRoot = await makeStoreRoot("liushi-task-unknown-entry-");
    const unknownFile = await writeUnknownTaskEntry(storeRoot);
    const entriesBeforeCreate = await readdir(taskDirectory(storeRoot));

    const result = await makeApp(storeRoot).createTask.execute({
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.CorruptStore);
    }
    await expect(readFile(unknownFile, "utf8")).resolves.toBe(UNKNOWN_TASK_ENTRY_CONTENT);
    await expect(readdir(taskDirectory(storeRoot))).resolves.toEqual(entriesBeforeCreate);
    await expect(stat(eventsFile(storeRoot))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(snapshotFile(storeRoot))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("status 遇到 Task 目录未知文件时返回 CorruptStore", async () => {
    const storeRoot = await makeStoreRoot("liushi-task-status-unknown-entry-");
    await createTask(storeRoot);
    const unknownFile = await writeUnknownTaskEntry(storeRoot);

    const status = await createHarnessApplication({ storeRoot }).getTaskStatus.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
    });

    expect(status.status).toBe(ResultStatus.Failure);
    if (status.status === ResultStatus.Failure) {
      expect(status.error.code).toBe(HarnessErrorCode.CorruptStore);
    }
    await expect(readFile(unknownFile, "utf8")).resolves.toBe(UNKNOWN_TASK_ENTRY_CONTENT);
  });

  it("status 遇到其他未知目录时仍 fail closed", async () => {
    const storeRoot = await makeStoreRoot("liushi-task-status-unknown-directory-");
    await createTask(storeRoot);
    await mkdir(resolve(taskDirectory(storeRoot), "foreignRuntime"));

    const status = await createHarnessApplication({ storeRoot }).getTaskStatus.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
    });

    expect(status.status).toBe(ResultStatus.Failure);
    if (status.status === ResultStatus.Failure) {
      expect(status.error.code).toBe(HarnessErrorCode.CorruptStore);
    }
  });
});

async function makeStoreRoot(prefix: string): Promise<string> {
  return runtimeStores.create(prefix);
}

function makeApp(storeRoot: string) {
  return createHarnessApplication({
    storeRoot,
    clock: new FixedClock(CREATED_AT),
    taskIdGenerator: new FixedSequenceIdGenerator([TASK_ID]),
    eventIdGenerator: new FixedSequenceIdGenerator([EVENT_ID]),
  });
}

async function createTask(storeRoot: string): Promise<void> {
  const result = await makeApp(storeRoot).createTask.execute({
    workspaceId: WORKSPACE_ID,
    source: "ticket-123",
    actor: ACTOR,
  });
  expect(result.status).toBe(ResultStatus.Success);
}

function taskDirectory(storeRoot: string): string {
  return resolve(storeRoot, "workspaces", WORKSPACE_ID, "tasks", TASK_ID);
}

function eventsFile(storeRoot: string): string {
  return resolve(taskDirectory(storeRoot), "events.jsonl");
}

function snapshotFile(storeRoot: string): string {
  return resolve(taskDirectory(storeRoot), "snapshot.json");
}

function lockFile(storeRoot: string): string {
  return resolve(taskDirectory(storeRoot), ".task.lock");
}

function actionExecutionLocksDirectory(storeRoot: string): string {
  return resolve(taskDirectory(storeRoot), ACTION_EXECUTION_LOCKS_DIRECTORY_NAME);
}

function parseTask(value: string) {
  const result = parseTaskId(value);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function parseWorkspace(value: string) {
  const result = parseWorkspaceId(value);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

async function writeUnknownTaskEntry(storeRoot: string): Promise<string> {
  await mkdir(taskDirectory(storeRoot), { recursive: true });
  const unknownFile = resolve(taskDirectory(storeRoot), UNKNOWN_TASK_ENTRY_NAME);
  await writeFile(unknownFile, UNKNOWN_TASK_ENTRY_CONTENT, "utf8");
  return unknownFile;
}

async function readEvent(storeRoot: string): Promise<Record<string, unknown>> {
  const line = (await readFile(eventsFile(storeRoot), "utf8")).trim();
  return JSON.parse(line) as Record<string, unknown>;
}

async function readSnapshot(storeRoot: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(snapshotFile(storeRoot), "utf8")) as Record<string, unknown>;
}

async function corruptEventHash(storeRoot: string): Promise<void> {
  const event = await readEvent(storeRoot);
  event["hash"] = "0".repeat(64);
  await writeFile(eventsFile(storeRoot), `${JSON.stringify(event)}\n`, "utf8");
}

async function corruptSnapshotSource(storeRoot: string): Promise<void> {
  const snapshot = await readSnapshot(storeRoot);
  const task = snapshot["task"] as Record<string, unknown>;
  task["source"] = "changed-after-snapshot";
  await writeFile(snapshotFile(storeRoot), `${JSON.stringify(snapshot)}\n`, "utf8");
}

async function removeEventLog(storeRoot: string): Promise<void> {
  await rm(eventsFile(storeRoot));
}

function waitForChildSignal(
  child: ChildProcessWithoutNullStreams,
  expectedSignal: string,
  stderr: readonly string[],
): Promise<void> {
  return new Promise((resolveSignal, rejectSignal) => {
    let stdout = "";
    const watchdog = AbortSignal.timeout(CHILD_SIGNAL_WATCHDOG_MS);
    const onData = (chunk: Buffer): void => {
      stdout += chunk.toString("utf8");
      if (stdout.split(/\r?\n/).includes(expectedSignal)) {
        cleanupListeners();
        resolveSignal();
      }
    };
    const onError = (error: Error): void => {
      cleanupListeners();
      rejectSignal(error);
    };
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanupListeners();
      rejectSignal(
        new Error(
          `Lock holder closed before '${expectedSignal}' (code=${String(code)}, signal=${String(signal)}): ${stderr.join("")}`,
        ),
      );
    };
    const onAbort = (): void => {
      cleanupListeners();
      rejectSignal(new Error(`Timed out waiting for lock holder signal '${expectedSignal}'.`));
    };
    const cleanupListeners = (): void => {
      child.stdout.off("data", onData);
      child.off("error", onError);
      child.off("close", onClose);
      watchdog.removeEventListener("abort", onAbort);
    };

    child.stdout.on("data", onData);
    child.once("error", onError);
    child.once("close", onClose);
    watchdog.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
}

async function ensureLockHolderStopped(
  child: ChildProcessWithoutNullStreams,
  childLockFile: string,
): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const childExit = waitForChildExit(child);
    child.kill();
    await childExit;
  }
  await rm(childLockFile, { force: true });
}
