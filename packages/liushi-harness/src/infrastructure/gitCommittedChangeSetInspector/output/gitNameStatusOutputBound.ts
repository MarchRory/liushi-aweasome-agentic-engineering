/** 由完整 Write Set 计算 `--no-renames --name-status -z` 合法输出上界。 */
export function calculateGitNameStatusOutputBound(writeSet: readonly string[]): number | undefined {
  if (writeSet.length === 0) return undefined;
  let totalPathBytes = 0;
  for (const path of writeSet) {
    totalPathBytes += Buffer.byteLength(path);
  }
  const bound = totalPathBytes + writeSet.length * 3;
  return Number.isSafeInteger(bound) && bound > 0 ? bound : undefined;
}
