import type { PersistedTaskSnapshot } from "#domain/taskRun/index.js";

import type { SnapshotStore } from "../contracts/index.js";
import { readTaskSnapshot, writeTaskSnapshot } from "../io/index.js";

/** 基于本地文件 atomic write 的 Snapshot Store Adapter。 */
export class FileSnapshotStore implements SnapshotStore {
  /** 写入 Task Snapshot。 */
  public async write(snapshotFile: string, snapshot: PersistedTaskSnapshot): Promise<void> {
    await writeTaskSnapshot(snapshotFile, snapshot);
  }

  /** 读取 Task Snapshot。 */
  public async read(snapshotFile: string): Promise<PersistedTaskSnapshot> {
    return readTaskSnapshot(snapshotFile);
  }
}
