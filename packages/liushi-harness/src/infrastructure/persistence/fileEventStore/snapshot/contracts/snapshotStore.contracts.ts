import type { PersistedTaskSnapshot } from "#domain/taskRun/index.js";

/** Task Snapshot 持久化边界。 */
export interface SnapshotStore {
  /** 使用 atomic rename 写入 Snapshot。 */
  write(snapshotFile: string, snapshot: PersistedTaskSnapshot): Promise<void>;
  /** 读取 Snapshot 并完成 schema 校验。 */
  read(snapshotFile: string): Promise<PersistedTaskSnapshot>;
}
