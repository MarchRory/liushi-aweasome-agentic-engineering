import type { CodingTaskSessionChange } from "../contracts/index.js";
import { CodingTaskSessionChangeKind } from "../enums/index.js";

/** 将 Git 的关系型提示确定性展开为规范的 Added/Deleted 变化。 */
export function canonicalizeCodingTaskSessionChange(
  change: CodingTaskSessionChange,
): readonly CodingTaskSessionChange[] {
  if (change.kind === CodingTaskSessionChangeKind.Renamed) {
    return [
      {
        path: change.originalPath as string,
        kind: CodingTaskSessionChangeKind.Deleted,
        targetContentDigest: null,
      },
      {
        path: change.path,
        kind: CodingTaskSessionChangeKind.Added,
        targetContentDigest: change.targetContentDigest,
      },
    ];
  }
  if (change.kind === CodingTaskSessionChangeKind.Copied) {
    return [
      {
        path: change.path,
        kind: CodingTaskSessionChangeKind.Added,
        targetContentDigest: change.targetContentDigest,
      },
    ];
  }
  return [change];
}

/** 判断持久化变化集合是否已经采用规范顺序和内容状态语义。 */
export function isCanonicalCodingTaskSessionChangeSet(
  actual: readonly CodingTaskSessionChange[],
  canonical: readonly CodingTaskSessionChange[],
): boolean {
  return (
    actual.length === canonical.length &&
    actual.every((change, index) => {
      const expected = canonical[index];
      return (
        expected !== undefined &&
        change.path === expected.path &&
        change.originalPath === expected.originalPath &&
        change.kind === expected.kind &&
        change.targetContentDigest === expected.targetContentDigest
      );
    })
  );
}
