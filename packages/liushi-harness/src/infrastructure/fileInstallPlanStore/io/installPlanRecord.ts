import { readFile } from "node:fs/promises";

import { HarnessError, HarnessErrorCode } from "#common/index.js";

/** 读取并解析 InstallPlan JSON；记录缺失返回 undefined。 */
export async function readInstallPlanRecord(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "InstallPlan file is invalid.",
      {},
      error,
    );
  }
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
