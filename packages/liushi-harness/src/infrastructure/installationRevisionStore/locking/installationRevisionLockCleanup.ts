import type { ExclusiveFileLockHandle } from "#infrastructure/persistence/fileEventStore/index.js";

/** 按获取顺序逆序释放锁，并聚合所有清理失败。 */
export async function releaseInstallationRevisionLocks(
  locks: readonly ExclusiveFileLockHandle[],
): Promise<Error | undefined> {
  const errors: unknown[] = [];
  for (const lock of [...locks].reverse()) {
    try {
      await lock.release();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors.length === 0
    ? undefined
    : new AggregateError(errors, "Unable to release Installation Revision lock.");
}
