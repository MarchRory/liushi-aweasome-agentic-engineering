import {
  ActorKind,
  CompileProjectProfileUseCase,
  ResultStatus,
  parseRepositoryId,
  parseWorkspaceId,
} from "../../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
  FileSnapshotStore,
  FileTaskRepository,
  Rfc8785Sha256DigestAdapter,
} from "../../../src/infrastructure/index.js";
import { FixedSequenceIdGenerator, TemporaryRuntimeStore } from "../runtime/index.js";

export const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
export const WORKSPACE_ID = "workspace-profile";
export const CREATED_AT = "2026-07-11T00:00:00.000Z";
export const ACTOR = { kind: ActorKind.Human, actorId: "tester" };
export const digestPort = new Rfc8785Sha256DigestAdapter();
export const runtimeStores = new TemporaryRuntimeStore();
export const workspaceId = unwrap(parseWorkspaceId(WORKSPACE_ID));
export const repositoryId = unwrap(parseRepositoryId("repo-a"));

export function makeUseCase(storeRoot: string): CompileProjectProfileUseCase {
  return new CompileProjectProfileUseCase(makeRepository(storeRoot), digestPort);
}

export function makeRepository(storeRoot: string): FileTaskRepository {
  return new FileTaskRepository(storeRoot, {
    eventIdGenerator: new FixedSequenceIdGenerator([]),
    snapshotStore: new FileSnapshotStore(),
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability: new FileParentDirectoryDurability(),
  });
}

export function unwrap<T>(
  result:
    { status: ResultStatus.Success; value: T } | { status: ResultStatus.Failure; error: Error },
): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
