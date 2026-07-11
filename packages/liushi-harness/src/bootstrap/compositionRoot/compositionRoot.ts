import {
  CheckRuntimeHealthUseCase,
  CreateTaskUseCase,
  GetTaskStatusUseCase,
  ProposeArtifactUseCase,
  RecordApprovalUseCase,
  ResolveRulesUseCase,
} from "#application/index.js";
import { HarnessError, HarnessErrorCode } from "#common/index.js";
import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
  FileRuntimeHealthAdapter,
  FileSnapshotStore,
  FileTaskRepository,
  Rfc8785Sha256DigestAdapter,
  SystemDelayAdapter,
  SystemClock,
  UlidGenerator,
} from "#infrastructure/index.js";

import type { HarnessApplication, HarnessApplicationOptions } from "./compositionRoot.contracts.js";

/** 唯一 Composition Root，负责构造具体 Adapter 和 Use Case。 */
export function createHarnessApplication(options: HarnessApplicationOptions): HarnessApplication {
  if (options.storeRoot.trim().length === 0) {
    throw new HarnessError(HarnessErrorCode.InvalidInput, "Runtime Store root cannot be empty.", {
      field: "storeRoot",
    });
  }

  const clock = options.clock ?? new SystemClock();
  const delay = options.delay ?? new SystemDelayAdapter();
  const taskIdGenerator = options.taskIdGenerator ?? new UlidGenerator();
  const eventIdGenerator = options.eventIdGenerator ?? new UlidGenerator();
  const artifactIdGenerator = options.artifactIdGenerator ?? new UlidGenerator();
  const decisionRequestIdGenerator = options.decisionRequestIdGenerator ?? new UlidGenerator();
  const approvalIdGenerator = options.approvalIdGenerator ?? new UlidGenerator();
  const snapshotStore = new FileSnapshotStore();
  const lockManager = new ExclusiveFileLockManager();
  const parentDirectoryDurability = new FileParentDirectoryDurability();
  const taskRepository = new FileTaskRepository(options.storeRoot, {
    eventIdGenerator,
    snapshotStore,
    lockManager,
    parentDirectoryDurability,
  });
  const runtimeHealth = new FileRuntimeHealthAdapter(options.storeRoot);
  const digest = new Rfc8785Sha256DigestAdapter();

  return {
    checkRuntimeHealth: new CheckRuntimeHealthUseCase(runtimeHealth),
    createTask: new CreateTaskUseCase(taskRepository, clock, taskIdGenerator),
    getTaskStatus: new GetTaskStatusUseCase(taskRepository),
    proposeArtifact: new ProposeArtifactUseCase(
      taskRepository,
      digest,
      clock,
      artifactIdGenerator,
      decisionRequestIdGenerator,
    ),
    recordApproval: new RecordApprovalUseCase(
      taskRepository,
      digest,
      clock,
      approvalIdGenerator,
      delay,
    ),
    resolveRules: new ResolveRulesUseCase(digest),
  };
}
