import type { ContentDigest, HarnessError, Result } from "#common/index.js";

import type { InstallationRevisionRecord } from "../contracts/index.js";

/** 排除记录摘要自身后计算完整 Installation Revision 记录摘要。 */
export function calculateInstallationRevisionRecordDigest(
  calculate: (input: unknown) => Result<ContentDigest, HarnessError>,
  record: Omit<InstallationRevisionRecord, "recordDigest">,
): Result<ContentDigest, HarnessError> {
  return calculate(record);
}
