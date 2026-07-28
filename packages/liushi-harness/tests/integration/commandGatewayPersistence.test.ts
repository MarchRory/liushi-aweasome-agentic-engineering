import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  ApplicationCommandGateway,
  COMMAND_INVOCATION_PROVENANCE_SCHEMA_VERSION,
  CommandErrorCode,
  CommandStatus,
  createCommandEnvelope,
  createCommandReceipt,
  type CommandEnvelope,
  type CommandHandler,
  type CommandInvocationProvenance,
} from "../../src/application/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
} from "../../src/common/index.js";
import { createHarnessApplication } from "../../src/bootstrap/index.js";
import {
  ExclusiveFileLockManager,
  FileCommandReservationStore,
  FileParentDirectoryDurability,
  resolveCommandReservationPaths,
} from "../../src/infrastructure/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("File Command Gateway", () => {
  it("跨实例复用原 Receipt，并区分 Duplicate 与幂等冲突", async () => {
    const storeRoot = await runtimeStores.create("liushi-command-gateway-");
    let calls = 0;
    const handler = countingHandler(() => {
      calls += 1;
    });
    const first = await createHarnessApplication({ storeRoot }).applicationCommandGateway.execute(
      command("command-1", digest("a")),
      handler,
    );
    const exact = await createHarnessApplication({ storeRoot }).applicationCommandGateway.execute(
      command("command-1", digest("a")),
      handler,
    );
    const duplicate = await createHarnessApplication({
      storeRoot,
    }).applicationCommandGateway.execute(command("command-2", digest("a")), handler);
    const conflict = await createHarnessApplication({
      storeRoot,
    }).applicationCommandGateway.execute(command("command-3", digest("b")), handler);

    expect(first).toMatchObject({ value: { status: CommandStatus.Committed } });
    expect(exact).toEqual(first);
    expect(duplicate).toMatchObject({
      value: { status: CommandStatus.Duplicate, duplicateOfCommandId: "command-1" },
    });
    expect(conflict).toMatchObject({
      value: {
        status: CommandStatus.Conflict,
        errorCode: CommandErrorCode.IdempotencyConflict,
      },
    });
    expect(calls).toBe(1);
  });

  it.each([
    {
      name: "Rejected",
      error: new HarnessError(HarnessErrorCode.OperationForbidden, "测试拒绝。"),
      expectedStatus: CommandStatus.Rejected,
      expectedCode: CommandErrorCode.AuthorizationDenied,
    },
    {
      name: "OutcomeUnknown",
      error: new HarnessError(HarnessErrorCode.IoFailure, "测试结果未知。"),
      expectedStatus: CommandStatus.OutcomeUnknown,
      expectedCode: CommandErrorCode.OutcomeUnknown,
    },
  ])("不同 Command ID 重放时保留首次 $name Receipt", async (fixture) => {
    const storeRoot = await runtimeStores.create("liushi-command-terminal-replay-");
    let calls = 0;
    const handler: CommandHandler = {
      execute: () => {
        calls += 1;
        return Promise.resolve(failure(fixture.error));
      },
    };
    const first = await createHarnessApplication({ storeRoot }).applicationCommandGateway.execute(
      command("command-terminal-1", digest("a")),
      handler,
    );
    const replay = await createHarnessApplication({ storeRoot }).applicationCommandGateway.execute(
      command("command-terminal-2", digest("a")),
      handler,
    );

    expect(first).toMatchObject({
      value: { status: fixture.expectedStatus, errorCode: fixture.expectedCode },
    });
    expect(replay).toMatchObject({
      value: { status: fixture.expectedStatus, errorCode: fixture.expectedCode },
    });
    expect(replay).not.toMatchObject({ value: { status: CommandStatus.Duplicate } });
    expect(calls).toBe(1);
  });

  it("并发相同请求只执行一次 Handler", async () => {
    const storeRoot = await runtimeStores.create("liushi-command-concurrent-");
    const gateway = createHarnessApplication({ storeRoot }).applicationCommandGateway;
    let calls = 0;
    const handler: CommandHandler = {
      execute: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return success({ committedVersion: 1 });
      },
    };
    const results = await Promise.all([
      gateway.execute(command("command-a", digest("a")), handler),
      gateway.execute(command("command-b", digest("a")), handler),
    ]);

    expect(calls).toBe(1);
    expect(
      results
        .map((result) => (result.status === ResultStatus.Success ? result.value.status : "failure"))
        .sort(),
    ).toEqual([CommandStatus.Committed, CommandStatus.Duplicate].sort());
  });

  it("重启后遇到 Pending Reservation 只返回 OutcomeUnknown", async () => {
    const storeRoot = await runtimeStores.create("liushi-command-pending-");
    const store = fileStore(storeRoot);
    const pending = command("command-pending", digest("a"));
    const reserved = await store.reserve(pending);
    expect(reserved.status).toBe(ResultStatus.Success);
    let calls = 0;
    const gateway = new ApplicationCommandGateway(store, immediateDelay);
    const result = await gateway.execute(
      pending,
      countingHandler(() => {
        calls += 1;
      }),
    );

    expect(result).toMatchObject({
      value: {
        status: CommandStatus.OutcomeUnknown,
        errorCode: CommandErrorCode.OutcomeUnknown,
      },
    });
    expect(calls).toBe(0);
  });

  it("首次 Reserve 原子落盘 Invocation Provenance 且不保存原始调用标识", async () => {
    const storeRoot = await runtimeStores.create("liushi-command-provenance-");
    const rawSessionId = "session-sensitive-1";
    const rawTurnId = "turn-sensitive-1";
    const rawToolCallId = "tool-call-sensitive-1";
    const invocationProvenance = provenance({
      sessionIdDigest: digestText(rawSessionId),
      turnIdDigest: digestText(rawTurnId),
      toolCallIdDigest: digestText(rawToolCallId),
    });
    const input = command("command-provenance", digest("a"), invocationProvenance);
    const reserved = await fileStore(storeRoot).reserve(input);

    expect(reserved.status).toBe(ResultStatus.Success);
    const persistedText = await readFile(
      resolveCommandReservationPaths(storeRoot, input).recordFile,
      "utf8",
    );
    const persisted = JSON.parse(persistedText) as Record<string, unknown>;
    expect(persisted).toMatchObject({ invocationProvenance });
    expect(persisted).not.toHaveProperty("payload");
    expect(persistedText).not.toContain(rawSessionId);
    expect(persistedText).not.toContain(rawTurnId);
    expect(persistedText).not.toContain(rawToolCallId);
  });

  it("Handler 执行前已落盘 Invocation Provenance 且尚无 Receipt", async () => {
    const storeRoot = await runtimeStores.create("liushi-command-reserve-before-handler-");
    const store = fileStore(storeRoot);
    const invocationProvenance = provenance();
    const input = command("command-reserve-before-handler", digest("a"), invocationProvenance);
    const paths = resolveCommandReservationPaths(storeRoot, input);
    let persistedDuringHandler: unknown;
    const result = await new ApplicationCommandGateway(store, immediateDelay).execute(input, {
      execute: async () => {
        persistedDuringHandler = JSON.parse(await readFile(paths.recordFile, "utf8")) as unknown;
        return success({ committedVersion: 1 });
      },
    });

    expect(result).toMatchObject({ value: { status: CommandStatus.Committed } });
    expect(persistedDuringHandler).toMatchObject({ invocationProvenance });
    expect(persistedDuringHandler).not.toHaveProperty("receipt");
  });

  it("Complete 拒绝写入漂移的 Invocation Provenance 并保留 Pending Reservation", async () => {
    const storeRoot = await runtimeStores.create("liushi-command-complete-drift-");
    const store = fileStore(storeRoot);
    const provenanceA = provenance();
    const reservedCommand = command("command-complete-drift", digest("a"), provenanceA);
    const driftedCommand = command(
      "command-complete-drift",
      digest("a"),
      provenance({ inputDigest: digest("9") }),
    );
    const reserved = await store.reserve(reservedCommand);
    const receipt = createCommandReceipt({
      commandId: driftedCommand.commandId,
      requestDigest: driftedCommand.requestDigest,
      status: CommandStatus.Committed,
      committedVersion: 1,
    });

    expect(reserved.status).toBe(ResultStatus.Success);
    expect(receipt.status).toBe(ResultStatus.Success);
    if (receipt.status === ResultStatus.Failure) throw receipt.error;
    const completed = await store.complete(driftedCommand, receipt.value);

    expect(completed.status).toBe(ResultStatus.Failure);
    const persisted = JSON.parse(
      await readFile(resolveCommandReservationPaths(storeRoot, reservedCommand).recordFile, "utf8"),
    ) as unknown;
    expect(persisted).toMatchObject({ invocationProvenance: provenanceA });
    expect(persisted).not.toHaveProperty("receipt");
  });

  it("相同请求的 Invocation Provenance 漂移时返回幂等冲突", async () => {
    const storeRoot = await runtimeStores.create("liushi-command-provenance-drift-");
    let calls = 0;
    const handler = countingHandler(() => {
      calls += 1;
    });
    const first = command("command-drift", digest("a"), provenance());
    const drifted = command(
      "command-drift",
      digest("a"),
      provenance({ turnIdDigest: digest("9") }),
    );

    const firstResult = await createHarnessApplication({
      storeRoot,
    }).applicationCommandGateway.execute(first, handler);
    const driftedResult = await createHarnessApplication({
      storeRoot,
    }).applicationCommandGateway.execute(drifted, handler);

    expect(firstResult).toMatchObject({ value: { status: CommandStatus.Committed } });
    expect(driftedResult).toMatchObject({
      value: {
        status: CommandStatus.Conflict,
        errorCode: CommandErrorCode.IdempotencyConflict,
      },
    });
    expect(calls).toBe(1);
  });

  it("Reservation 的 Invocation Provenance 包含未知字段时 fail closed", async () => {
    const storeRoot = await runtimeStores.create("liushi-command-provenance-corrupt-");
    const store = fileStore(storeRoot);
    const input = command("command-provenance-corrupt", digest("a"), provenance());
    await store.reserve(input);
    const paths = resolveCommandReservationPaths(storeRoot, input);
    const persisted = JSON.parse(await readFile(paths.recordFile, "utf8")) as {
      invocationProvenance: Record<string, unknown>;
    };
    persisted.invocationProvenance["unexpected"] = true;
    await writeFile(paths.recordFile, `${JSON.stringify(persisted)}\n`, "utf8");

    const result = await new ApplicationCommandGateway(store, immediateDelay).execute(
      input,
      countingHandler(() => undefined),
    );

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("Reservation 损坏时 fail closed", async () => {
    const storeRoot = await runtimeStores.create("liushi-command-corrupt-");
    const store = fileStore(storeRoot);
    const input = command("command-corrupt", digest("a"));
    await store.reserve(input);
    const paths = resolveCommandReservationPaths(storeRoot, input);
    await writeFile(paths.recordFile, "{invalid-json}\n", "utf8");

    const result = await new ApplicationCommandGateway(store, immediateDelay).execute(
      input,
      countingHandler(() => undefined),
    );

    expect(result.status).toBe(ResultStatus.Failure);
  });
});

const immediateDelay = { wait: () => Promise.resolve() };

function fileStore(storeRoot: string): FileCommandReservationStore {
  return new FileCommandReservationStore(storeRoot, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
}

function countingHandler(onExecute: () => void): CommandHandler {
  return {
    execute: () => {
      onExecute();
      return Promise.resolve(success({ committedVersion: 1 }));
    },
  };
}

function command(
  commandId: string,
  requestDigest: ContentDigest,
  invocationProvenance?: CommandInvocationProvenance,
): CommandEnvelope {
  const parsed = createCommandEnvelope({
    commandId,
    commandType: "task.propose",
    aggregateType: "task",
    aggregateId: "task-1",
    expectedVersion: 0,
    idempotencyKey: "proposal-1",
    requestDigest,
    actor: { kind: ActorKind.Agent, actorId: "planner" },
    authorizationContext: {},
    correlationId: "correlation-1",
    ...(invocationProvenance === undefined ? {} : { invocationProvenance }),
    submittedAt: "2026-07-12T00:00:00.000Z",
    payload: {},
  });
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

function digest(character: string): ContentDigest {
  return `sha256:${character.repeat(64)}` as ContentDigest;
}

function digestText(value: string): ContentDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}` as ContentDigest;
}

function provenance(
  override: Partial<CommandInvocationProvenance> = {},
): CommandInvocationProvenance {
  return {
    schemaVersion: COMMAND_INVOCATION_PROVENANCE_SCHEMA_VERSION,
    executor: "codex",
    invocationId: digest("1"),
    sessionIdDigest: digest("2"),
    turnIdDigest: digest("3"),
    toolCallIdDigest: digest("4"),
    toolName: "shell_command",
    targetsDigest: digest("5"),
    inputDigest: digest("6"),
    ...override,
  };
}
