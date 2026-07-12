import { resolve } from "node:path";

import type { EvidenceBundleLocator } from "#application/ports/index.js";
import { resolveCodingTaskStorePaths } from "#infrastructure/persistence/fileCodingTaskStore/index.js";

import { EVIDENCE_BUNDLE_DIRECTORY_NAME } from "../constants/index.js";

/** EvidenceBundle 文件布局。 */
export interface EvidenceBundleStorePaths {
  /** CodingTask Event 文件，用于校验父聚合存在。 */
  readonly codingTaskEventsFile: string;
  /** Bundle JSON 文件。 */
  readonly recordFile: string;
  /** 当前 Verification Run 的排他 Lock 文件。 */
  readonly lockFile: string;
}

/** 解析一个 Verification Run 的 EvidenceBundle 路径。 */
export function resolveEvidenceBundleStorePaths(
  storeRoot: string,
  locator: EvidenceBundleLocator,
): EvidenceBundleStorePaths {
  const codingTask = resolveCodingTaskStorePaths(
    storeRoot,
    locator.workspaceId,
    locator.codingTaskId,
  );
  const evidenceDirectory = resolve(codingTask.codingTaskDirectory, EVIDENCE_BUNDLE_DIRECTORY_NAME);
  return {
    codingTaskEventsFile: codingTask.eventsFile,
    recordFile: resolve(evidenceDirectory, `${locator.verificationRunId}.json`),
    lockFile: resolve(evidenceDirectory, `${locator.verificationRunId}.lock`),
  };
}
