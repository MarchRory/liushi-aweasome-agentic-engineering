import { readFile } from "node:fs/promises";

import {
  CodingTaskEventType,
  ResultStatus,
  parseCodingTaskId,
  parseWorkspaceId,
  type CodingTaskAggregate,
} from "../../../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileCodingTaskRepository,
  FileParentDirectoryDurability,
  resolveCodingTaskStorePaths,
} from "../../../../src/infrastructure/index.js";

import type { CodingTaskSessionCloseoutCliSetup } from "../../codingTaskSessionCloseoutCli/index.js";

/** 从真实 File Repository 重建 Delivery 测试使用的权威 CodingTask。 */
export async function loadCodingTaskSessionDeliveryAggregate(
  setup: CodingTaskSessionCloseoutCliSetup,
): Promise<CodingTaskAggregate> {
  const workspaceId = parseWorkspaceId(setup.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) throw workspaceId.error;
  const codingTaskId = parseCodingTaskId(setup.codingTaskId);
  if (codingTaskId.status === ResultStatus.Failure) throw codingTaskId.error;
  const repository = new FileCodingTaskRepository(setup.storeRoot, {
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
  const loaded = await repository.load({
    workspaceId: workspaceId.value,
    codingTaskId: codingTaskId.value,
  });
  if (loaded.status === ResultStatus.Failure) throw loaded.error;
  return loaded.value.aggregate;
}

/** 统计权威 Event Log 中的 ImplementationSubmitted 事件。 */
export async function countCodingTaskSessionDeliveryEvents(
  setup: CodingTaskSessionCloseoutCliSetup,
): Promise<number> {
  const workspaceId = parseWorkspaceId(setup.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) throw workspaceId.error;
  const codingTaskId = parseCodingTaskId(setup.codingTaskId);
  if (codingTaskId.status === ResultStatus.Failure) throw codingTaskId.error;
  const paths = resolveCodingTaskStorePaths(setup.storeRoot, workspaceId.value, codingTaskId.value);
  const events = (await readFile(paths.eventsFile, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { readonly type: CodingTaskEventType });
  return events.filter((event) => event.type === CodingTaskEventType.ImplementationSubmitted)
    .length;
}
