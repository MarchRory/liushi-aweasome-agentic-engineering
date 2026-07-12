import { readFile, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  ActorKind,
  CommandStatus,
  HarnessErrorCode,
  ResultStatus,
  WorkflowCellKind,
  WorkflowCommandType,
  WorkflowControlAction,
  WorkflowEventType,
  WorkflowRouteKind,
  WORKFLOW_EVENT_SCHEMA_VERSION,
  WorkflowRunState,
  createHarnessApplication,
  parseWorkflowEventId,
  parseWorkflowId,
  parseWorkspaceId,
} from "../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
  FileWorkflowRepository,
  resolveWorkflowStorePaths,
} from "../../src/infrastructure/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const WORKSPACE_ID = "workflow-kernel-workspace";
const WORKFLOW_ID = "workflow-kernel-demo";
const CREATED_AT = "2026-07-12T00:00:00.000Z";
const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("RequirementWorkflow S2 Kernel", () => {
  it("经 Command Gateway 创建并可在重启后 Replay", async () => {
    const storeRoot = await runtimeStores.create("liushi-workflow-kernel-");
    const application = createHarnessApplication({ storeRoot });
    const created = await application.workflowCommands.execute(
      command(WorkflowCommandType.Create, "create-1", 0, ActorKind.Human, createPayload()),
    );

    expect(created).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 1 },
    });

    const routed = await createHarnessApplication({ storeRoot }).workflowCommands.execute(
      command(WorkflowCommandType.RouteCell, "route-1", 1, ActorKind.Agent, {
        workspaceId: WORKSPACE_ID,
        targetCell: WorkflowCellKind.ContextAssembly,
      }),
    );
    expect(routed).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: 2 },
    });

    const loaded = await createRepository(storeRoot).load(locator());
    expect(loaded).toMatchObject({
      status: ResultStatus.Success,
      value: {
        aggregate: {
          currentCell: WorkflowCellKind.ContextAssembly,
          runState: WorkflowRunState.Active,
          version: 2,
        },
      },
    });
  });

  it("相同幂等键复用 Receipt，过期版本返回 Conflict", async () => {
    const storeRoot = await runtimeStores.create("liushi-workflow-idempotency-");
    const application = createHarnessApplication({ storeRoot });
    const create = command(
      WorkflowCommandType.Create,
      "create-1",
      0,
      ActorKind.Human,
      createPayload(),
    );
    const first = await application.workflowCommands.execute(create);
    const exact = await application.workflowCommands.execute(create);
    const stale = await application.workflowCommands.execute(
      command(WorkflowCommandType.RouteCell, "route-stale", 0, ActorKind.Agent, {
        workspaceId: WORKSPACE_ID,
        targetCell: WorkflowCellKind.ContextAssembly,
      }),
    );

    expect(exact).toEqual(first);
    expect(stale).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Conflict },
    });
  });

  it("Pause、Resume、Cancel 只能由 Human 控制，并拒绝暂停态路由", async () => {
    const storeRoot = await runtimeStores.create("liushi-workflow-control-");
    const application = createHarnessApplication({ storeRoot });
    await application.workflowCommands.execute(
      command(WorkflowCommandType.Create, "create-1", 0, ActorKind.Human, createPayload()),
    );

    const paused = await application.workflowCommands.execute(
      command(WorkflowCommandType.Control, "pause-1", 1, ActorKind.Human, {
        workspaceId: WORKSPACE_ID,
        action: WorkflowControlAction.Pause,
      }),
    );
    const blockedRoute = await application.workflowCommands.execute(
      command(WorkflowCommandType.RouteCell, "route-paused", 2, ActorKind.Agent, {
        workspaceId: WORKSPACE_ID,
        targetCell: WorkflowCellKind.ContextAssembly,
      }),
    );
    const resumed = await application.workflowCommands.execute(
      command(WorkflowCommandType.Control, "resume-1", 2, ActorKind.Human, {
        workspaceId: WORKSPACE_ID,
        action: WorkflowControlAction.Resume,
      }),
    );
    const cancelled = await application.workflowCommands.execute(
      command(WorkflowCommandType.Control, "cancel-1", 3, ActorKind.Human, {
        workspaceId: WORKSPACE_ID,
        action: WorkflowControlAction.Cancel,
      }),
    );

    expect(paused).toMatchObject({
      value: { status: CommandStatus.Committed, committedVersion: 2 },
    });
    expect(blockedRoute).toMatchObject({ value: { status: CommandStatus.Rejected } });
    expect(resumed).toMatchObject({
      value: { status: CommandStatus.Committed, committedVersion: 3 },
    });
    expect(cancelled).toMatchObject({
      value: { status: CommandStatus.Committed, committedVersion: 4 },
    });
    const loaded = await createRepository(storeRoot).load(locator());
    expect(loaded).toMatchObject({
      value: { aggregate: { runState: WorkflowRunState.Cancelled } },
    });
  });

  it("Hash Chain 损坏时 fail closed", async () => {
    const storeRoot = await runtimeStores.create("liushi-workflow-corrupt-");
    const application = createHarnessApplication({ storeRoot });
    await application.workflowCommands.execute(
      command(WorkflowCommandType.Create, "create-1", 0, ActorKind.Human, createPayload()),
    );
    const paths = resolveWorkflowStorePaths(
      storeRoot,
      parseWorkspace(WORKSPACE_ID),
      parseWorkflow(WORKFLOW_ID),
    );
    const content = await readFile(paths.eventsFile, "utf8");
    await writeFile(
      paths.eventsFile,
      content.replace(/"hash":"[a-f0-9]+"/, `"hash":"${"0".repeat(64)}"`),
      "utf8",
    );

    const corrupted = await createRepository(storeRoot).load(locator());
    expect(corrupted).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("非法首个 Event 在 Replay 校验前失败，Event Log 保持不存在", async () => {
    const storeRoot = await runtimeStores.create("liushi-workflow-invalid-first-");
    const repository = createRepository(storeRoot);
    const invalid = await repository.append({
      locator: locator(),
      expectedVersion: 0,
      event: {
        schemaVersion: WORKFLOW_EVENT_SCHEMA_VERSION,
        eventId: parseEvent("01ARZ3NDEKTSV4RRFFQ69G5FAV"),
        workflowId: parseWorkflow(WORKFLOW_ID),
        workspaceId: parseWorkspace(WORKSPACE_ID),
        commandId: "invalid-first",
        correlationId: "workflow-correlation",
        occurredAt: CREATED_AT,
        actor: { kind: ActorKind.Agent, actorId: "agent" },
        type: WorkflowEventType.CellRouted,
        payload: {
          fromCell: WorkflowCellKind.PrdIntake,
          toCell: WorkflowCellKind.ContextAssembly,
          routeKind: WorkflowRouteKind.Forward,
          requiresHuman: false,
        },
      },
    });

    expect(invalid).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidStateTransition },
    });
    const loaded = await repository.load(locator());
    expect(loaded).toMatchObject({ status: ResultStatus.Failure });
  });
});

function createRepository(storeRoot: string): FileWorkflowRepository {
  return new FileWorkflowRepository(storeRoot, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
}

function locator() {
  return { workspaceId: parseWorkspace(WORKSPACE_ID), workflowId: parseWorkflow(WORKFLOW_ID) };
}

function parseWorkspace(value: string) {
  const result = parseWorkspaceId(value);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function parseWorkflow(value: string) {
  const result = parseWorkflowId(value);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function parseEvent(value: string) {
  const result = parseWorkflowEventId(value);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function createPayload() {
  return {
    workspaceId: WORKSPACE_ID,
    workflowKind: "requirement",
    effectiveRevisionSet: { revisions: [] },
    inputBindingSet: { bindings: [] },
    contextManifest: { sources: [] },
  };
}

function command(
  commandType: WorkflowCommandType,
  commandId: string,
  expectedVersion: number,
  actorKind: ActorKind,
  payload: unknown,
) {
  return {
    schemaVersion: "1.0.0",
    commandId,
    commandType,
    aggregateType: "requirement_workflow",
    aggregateId: WORKFLOW_ID,
    expectedVersion,
    idempotencyKey: commandId,
    requestDigest: `sha256:${"a".repeat(64)}`,
    actor: { kind: actorKind, actorId: actorKind === ActorKind.Human ? "human" : "agent" },
    authorizationContext: {},
    correlationId: "workflow-correlation",
    submittedAt: CREATED_AT,
    payload,
  };
}
