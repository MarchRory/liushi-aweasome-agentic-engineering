import { writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  ApplicationCommandGateway,
  CommandErrorCode,
  CommandStatus,
  createCommandEnvelope,
  type CommandEnvelope,
  type CommandHandler,
} from "../../src/application/index.js";
import { ActorKind, ResultStatus, success, type ContentDigest } from "../../src/common/index.js";
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

function command(commandId: string, requestDigest: ContentDigest): CommandEnvelope {
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
    submittedAt: "2026-07-12T00:00:00.000Z",
    payload: {},
  });
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

function digest(character: string): ContentDigest {
  return `sha256:${character.repeat(64)}` as ContentDigest;
}
